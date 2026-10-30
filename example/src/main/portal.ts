// Portal: serves the site being developed to other devices on the network
// through a rewriting proxy and mirrors interactions over a WebSocket.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import { delimiter, join } from 'node:path';
import tls from 'node:tls';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PortalInfo, SyncEvent } from '../shared/types';

const CLIENT_PATH = '/__fronttier/client.js';
const WS_PATH = '/__fronttier/ws';
const STRIP = new Set(['content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'strict-transport-security', 'content-length']);

function lanAddresses() {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

function findBinary(name: string) {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  const dirs = [...(process.env.PATH ?? '').split(delimiter), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  for (const d of dirs) if (d && existsSync(join(d, exe))) return join(d, exe);
  return null;
}

export class Portal {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private tunnel: ChildProcess | null = null;
  private target: URL | null = null;
  private info: PortalInfo = { running: false, port: 0, lan: [], clients: 0 };

  constructor(
    private clientScript: () => string,
    private onEvent: (ev: SyncEvent) => void,
    private onStatus: (info: PortalInfo) => void,
  ) {}

  status() {
    return { ...this.info };
  }

  setTarget(url: string) {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') this.target = u;
    } catch {}
  }

  async start(url: string, port: number, publicTunnel: boolean): Promise<PortalInfo> {
    await this.stop();
    this.setTarget(url);
    if (!this.target) throw new Error('Portal necesita una URL http(s)');
    const server = http.createServer((req, res) => this.handle(req, res));
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith(WS_PATH)) wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws));
      else this.proxyUpgrade(req, socket as net.Socket, head);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port || 0, '0.0.0.0', () => resolve());
    });
    this.server = server;
    this.wss = wss;
    const actual = (server.address() as net.AddressInfo).port;
    this.info = { running: true, port: actual, lan: lanAddresses().map((ip) => `http://${ip}:${actual}`), clients: 0, target: this.target.origin };
    if (publicTunnel) this.startTunnel(actual);
    this.onStatus(this.status());
    return this.status();
  }

  private startTunnel(port: number) {
    const bin = findBinary('cloudflared');
    if (!bin) {
      this.info.tunnelError = 'Instala "cloudflared" para obtener una URL pública.';
      return;
    }
    const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.tunnel = child;
    const scan = (buf: Buffer) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !this.info.publicUrl) {
        this.info.publicUrl = m[0];
        this.onStatus(this.status());
      }
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);
    child.on('exit', () => {
      if (this.tunnel === child) this.tunnel = null;
    });
  }

  async stop(): Promise<PortalInfo> {
    this.tunnel?.kill();
    this.tunnel = null;
    for (const c of this.wss?.clients ?? []) c.terminate();
    this.wss?.close();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
    this.server = null;
    this.wss = null;
    this.info = { running: false, port: 0, lan: [], clients: 0 };
    this.onStatus(this.status());
    return this.status();
  }

  /** Events coming from the app panes, forwarded to every connected device. */
  broadcast(ev: SyncEvent, except?: WebSocket) {
    if (!this.wss || !this.target) return;
    let out: SyncEvent = ev;
    if (ev.t === 'nav') {
      try {
        const u = new URL(ev.url);
        if (u.origin !== this.target.origin) return;
        out = { t: 'nav', url: u.pathname + u.search + u.hash };
      } catch {
        return;
      }
    }
    const data = JSON.stringify(out);
    for (const c of this.wss.clients) if (c !== except && c.readyState === 1) c.send(data);
  }

  private connect(ws: WebSocket) {
    this.info.clients = this.wss?.clients.size ?? 0;
    this.onStatus(this.status());
    ws.on('message', (raw) => {
      let ev: SyncEvent;
      try {
        ev = JSON.parse(String(raw));
      } catch {
        return;
      }
      this.broadcast(ev, ws);
      if (ev.t === 'nav' && this.target) ev = { t: 'nav', url: new URL(ev.url, this.target.origin).href };
      this.onEvent(ev);
    });
    ws.on('close', () => {
      this.info.clients = this.wss?.clients.size ?? 0;
      this.onStatus(this.status());
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const target = this.target!;
    if (req.url === CLIENT_PATH) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(this.clientScript());
      return;
    }
    const proxyHost = req.headers.host ?? '';
    const upstream = new URL(req.url ?? '/', target.origin);
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host, 'accept-encoding': 'identity' };
    for (const h of ['origin', 'referer'] as const) {
      const v = req.headers[h];
      if (typeof v === 'string') headers[h] = v.replace(/^https?:\/\/[^/]+/, target.origin);
    }
    const lib = upstream.protocol === 'https:' ? https : http;
    const preq = lib.request(upstream, { method: req.method, headers, rejectUnauthorized: false }, (pres) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [k, v] of Object.entries(pres.headers)) {
        if (STRIP.has(k)) continue;
        if (k === 'location' && typeof v === 'string') out[k] = v.replace(target.origin, '');
        else if (k === 'set-cookie' && Array.isArray(v)) out[k] = v.map((c) => c.replace(/;\s*domain=[^;]+/gi, '').replace(/;\s*secure/gi, '').replace(/;\s*samesite=none/gi, '; SameSite=Lax'));
        else out[k] = v;
      }
      const type = String(pres.headers['content-type'] ?? '');
      if (!type.includes('text/html')) {
        res.writeHead(pres.statusCode ?? 200, out);
        pres.pipe(res);
        return;
      }
      const chunks: Buffer[] = [];
      pres.on('data', (c) => chunks.push(c));
      pres.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        const esc = target.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(new RegExp(esc, 'g'), '').replace(new RegExp('//' + target.host.replace(/[.]/g, '\\.'), 'g'), '//' + proxyHost);
        const tag = `<script src="${CLIENT_PATH}"></script>`;
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
        res.writeHead(pres.statusCode ?? 200, out);
        res.end(html);
      });
    });
    preq.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Portal no pudo contactar ' + target.origin + ': ' + e.message);
    });
    req.pipe(preq);
  }

  /** Pass-through for the site's own WebSockets (e.g. dev-server hot reload). */
  private proxyUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer) {
    const target = this.target!;
    const secure = target.protocol === 'https:';
    const port = Number(target.port) || (secure ? 443 : 80);
    const upstream = secure ? tls.connect({ host: target.hostname, port, servername: target.hostname, rejectUnauthorized: false }) : net.connect(port, target.hostname);
    upstream.on('connect', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i];
        const v = k.toLowerCase() === 'host' ? target.host : k.toLowerCase() === 'origin' ? target.origin : req.rawHeaders[i + 1];
        lines.push(`${k}: ${v}`);
      }
      upstream.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    if (secure) upstream.on('secureConnect', () => upstream.emit('connect'));
    const end = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on('error', end);
    socket.on('error', end);
  }
}
