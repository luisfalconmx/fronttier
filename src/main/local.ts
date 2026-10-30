// Local mode: a tiny static file server for a folder on disk, plus a watcher
// that drives live reload.
import { createReadStream, existsSync, readdirSync, statSync, watch, type FSWatcher } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, relative, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
};

let server: http.Server | null = null;

export async function serveFolder(root: string): Promise<string> {
  server?.close();
  const srv = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = normalize(join(root, path));
    if (relative(root, file).startsWith('..')) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      const index = join(file, 'index.html');
      if (existsSync(index)) file = index;
      else {
        const items = readdirSync(file, { withFileTypes: true })
          .map((d) => `<li><a href="${encodeURI(path.replace(/\/?$/, '/') + d.name)}${d.isDirectory() ? '/' : ''}">${d.name}${d.isDirectory() ? '/' : ''}</a></li>`)
          .join('');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>${path}</title><h1>${path}</h1><ul>${items}</ul>`);
        return;
      }
    }
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado: ' + path);
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  server = srv;
  return `http://localhost:${(srv.address() as AddressInfo).port}/`;
}

let watcher: FSWatcher | null = null;

export function watchFolder(dir: string | null, onChange: (file: string) => void) {
  watcher?.close();
  watcher = null;
  if (!dir) return;
  let timer: NodeJS.Timeout | undefined;
  let changed = new Set<string>();
  watcher = watch(dir, { recursive: true }, (_e, name) => {
    const file = String(name ?? '');
    if (/(^|[\\/])(node_modules|\.git|\.cache|dist-electron)([\\/]|$)/.test(file) || file.split(sep).some((p) => p.startsWith('.'))) return;
    changed.add(file);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const files = [...changed];
      changed = new Set();
      // Only CSS changed → hot-swap stylesheets; anything else → full reload.
      onChange(files.every((f) => f.endsWith('.css')) ? files[0] : files.find((f) => !f.endsWith('.css')) ?? files[0]);
    }, 150);
  });
}
