// Meta information, robots.txt, manifest, structured data, HTML validation
// and social share previews.
import type { App } from '../app';
import { api, clear, h } from '../dom';
import { action, copyBtn, empty, issueList, kv, link, section, short, table } from './ui';

type Meta = Awaited<ReturnType<typeof import('../../pane/tools').meta>>;

function robotsAllows(txt: string, path: string) {
  const groups: { agents: string[]; rules: [boolean, string][] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  const sitemaps: string[] = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === 'user-agent') {
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(v.toLowerCase());
    } else if ((k === 'allow' || k === 'disallow') && cur) cur.rules.push([k === 'allow', v]);
    else if (k === 'sitemap') sitemaps.push(v);
  }
  const g = groups.find((x) => x.agents.includes('*'));
  let best: [boolean, string] | null = null;
  for (const r of g?.rules ?? []) {
    if (!r[1]) continue;
    const re = new RegExp('^' + r[1].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r[1].length > best[1].length || (r[1].length === best[1].length && r[0]))) best = r;
  }
  return { allowed: best ? best[0] : true, rule: best?.[1], sitemaps, groups: groups.length };
}

export function metaPanel(app: App) {
  const body = h('div');
  let lastUrl = '';

  async function load() {
    const p = app.primary();
    if (!p) return clear(body, empty('Abre una página para revisar sus metadatos.'));
    clear(body, empty('Analizando…'));
    try {
      const m = await p.tool<Meta>('meta');
      lastUrl = m.url;
      const u = new URL(m.url);
      const [robots, manifest] = await Promise.all([
        /^https?:$/.test(u.protocol) ? api().fetchText(u.origin + '/robots.txt') : Promise.resolve(null),
        m.manifest ? api().fetchText(m.manifest) : Promise.resolve(null),
      ]);
      const issues = [...m.issues];
      let robotsSec: HTMLElement;
      if (!robots) robotsSec = empty('No aplica para esta URL.');
      else if (!robots.ok) {
        issues.push({ level: 'info', msg: `No hay robots.txt (HTTP ${robots.status}).` });
        robotsSec = empty(`robots.txt no encontrado (HTTP ${robots.status}).`);
      } else {
        const r = robotsAllows(robots.text, u.pathname + u.search);
        if (!r.allowed) issues.push({ level: 'error', msg: `robots.txt bloquea esta ruta (regla “${r.rule}”).` });
        if (!r.sitemaps.length) issues.push({ level: 'info', msg: 'robots.txt no declara ningún Sitemap.' });
        robotsSec = h(
          'div',
          null,
          kv([
            ['Esta ruta', r.allowed ? '✓ Permitida para *' : `✕ Bloqueada (${r.rule})`],
            ['Grupos', String(r.groups)],
            ['Sitemaps', r.sitemaps.length ? h('div', null, r.sitemaps.map((s) => h('div', null, link(s, short(s))))) : null],
          ]),
          h('details', null, h('summary', null, 'Ver robots.txt'), h('pre', { class: 'code' }, robots.text.slice(0, 20000))),
        );
      }
      let manifestSec: HTMLElement = empty('La página no enlaza un Web App Manifest.');
      if (manifest) {
        try {
          const j = JSON.parse(manifest.text);
          const miss = ['name', 'short_name', 'start_url', 'display', 'icons'].filter((k) => !(k in j));
          if (miss.length) issues.push({ level: 'warn', msg: 'Al manifest le falta: ' + miss.join(', ') });
          manifestSec = h(
            'div',
            null,
            kv([
              ['name', j.name],
              ['short_name', j.short_name],
              ['start_url', j.start_url],
              ['display', j.display],
              ['theme_color', j.theme_color],
              ['background_color', j.background_color],
              ['Íconos', j.icons ? `${j.icons.length}: ` + j.icons.map((i: any) => i.sizes).join(', ') : null],
            ]),
          );
        } catch {
          issues.push({ level: 'error', msg: 'El manifest no es JSON válido.' });
          manifestSec = empty('Manifest inválido.');
        }
      }
      const tagTable = (obj: Record<string, string>) =>
        Object.keys(obj).length ? table(['Propiedad', 'Valor'], Object.entries(obj).map(([k, v]) => [h('code', null, k), h('span', { class: 'break' }, v)])) : empty('No hay etiquetas.');
      const len = (s: string | null, max: number) => (s ? h('span', null, s, h('small', { class: s.length > max ? 'bad' : 'muted' }, `  (${s.length})`)) : null);
      clear(
        body,
        h('div', { class: 'row' }, action('Volver a analizar', load), action('Validar HTML (envía el DOM a validator.w3.org)', validate)),
        section('Problemas', issueList(issues)),
        section(
          'Básico',
          kv([
            ['Título', len(m.title, 60)],
            ['Descripción', len(m.description, 160)],
            ['URL canónica', m.canonical ? link(m.canonical, short(m.canonical)) : null],
            ['Idioma', m.lang],
            ['Charset', m.charset],
            ['Viewport', m.viewport],
            ['Robots', m.robots ?? 'index, follow (por defecto)'],
            ['theme-color', m.themeColor],
            ['Generador', m.generator],
            ['H1', m.h1.join(' · ') || null],
          ]),
        ),
        section('Favicons', m.icons.length ? h('div', { class: 'icons' }, m.icons.map((i) => h('figure', null, h('img', { src: i.href, alt: '', loading: 'lazy' }), h('figcaption', null, `${i.rel} ${i.sizes}`)))) : empty('Sin favicon.')),
        m.alternates.length ? section('Hreflang', table(['Idioma', 'URL'], m.alternates.map((a) => [a.lang, short(a.href)]))) : null,
        section('Open Graph', tagTable(m.og)),
        section('Twitter / X', tagTable(m.twitter)),
        section(
          'Datos estructurados (JSON-LD)',
          m.jsonld.length
            ? h('div', null, m.jsonld.map((j: any) => h('details', null, h('summary', null, j.ok ? `✓ ${j.types.join(', ') || 'Sin @type'}` : '✕ JSON inválido'), h('pre', { class: 'code' }, j.ok ? JSON.stringify(j.data, null, 2) : j.error + '\n\n' + j.raw))))
            : empty('No hay bloques JSON-LD.'),
        ),
        section('robots.txt', robotsSec),
        section('Web App Manifest', manifestSec),
        section('Todas las meta', tagTable(m.all)),
        h('div', { id: 'validator-out' }),
      );
    } catch (e: any) {
      clear(body, empty('No se pudo analizar: ' + e.message));
    }
  }

  async function validate() {
    const p = app.primary();
    const out = body.querySelector('#validator-out');
    if (!p || !out) return;
    const html = await p.tool<string>('html');
    const res = await api().postText('https://validator.w3.org/nu/?out=json', html, 'text/html; charset=utf-8');
    if (!res.ok) return clear(out, section('Validación HTML', empty('El validador no respondió: ' + res.status)));
    const msgs: any[] = JSON.parse(res.text).messages ?? [];
    clear(
      out,
      section(
        `Validación HTML (${msgs.filter((m) => m.type === 'error').length} errores, ${msgs.filter((m) => m.subType === 'warning').length} avisos)`,
        h('p', { class: 'muted small' }, 'Se validó el DOM renderizado, no el HTML original del servidor.'),
        issueList(msgs.slice(0, 200).map((m) => ({ level: m.type === 'error' ? 'error' : m.subType === 'warning' ? 'warn' : 'info', msg: `${m.message}${m.lastLine ? ` (línea ${m.lastLine})` : ''}${m.extract ? ' — ' + m.extract.trim().slice(0, 100) : ''}` }))),
      ),
    );
  }

  app.events.on('navigate', () => setTimeout(() => body.isConnected && load(), 1500));
  const el = h('div', null, body);
  return { el, show: () => (app.primary()?.url !== lastUrl ? load() : undefined) };
}

export function socialPanel(app: App) {
  const body = h('div');
  async function load() {
    const p = app.primary();
    if (!p) return clear(body, empty('Abre una página para ver sus vistas previas.'));
    let m: Meta;
    try {
      m = await p.tool<Meta>('meta');
    } catch (e: any) {
      return clear(body, empty(e.message));
    }
    const title = m.og['og:title'] || m.twitter['twitter:title'] || m.title || 'Sin título';
    const desc = m.og['og:description'] || m.twitter['twitter:description'] || m.description || '';
    const abs = (u?: string) => {
      if (!u) return '';
      try {
        return new URL(u, m.url).href;
      } catch {
        return '';
      }
    };
    const image = abs(m.og['og:image'] || m.twitter['twitter:image']);
    const host = new URL(m.url).host.replace(/^www\./, '');
    const site = m.og['og:site_name'] || host;
    const large = (m.twitter['twitter:card'] ?? (image ? 'summary_large_image' : 'summary')) === 'summary_large_image';
    const img = (cls = '') => (image ? h('img', { class: 'sp-img ' + cls, src: image, alt: '', onerror: (e: Event) => (e.target as HTMLElement).replaceWith(h('div', { class: 'sp-img missing ' + cls }, 'La imagen no carga')) }) : h('div', { class: 'sp-img missing ' + cls }, 'Sin og:image'));
    const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
    const card = (name: string, ...content: any[]) => section(name, h('div', { class: 'sp sp-' + name.toLowerCase().replace(/[^a-z]/g, '') }, ...content));
    clear(
      body,
      h('div', { class: 'row' }, action('Actualizar', load), image ? copyBtn(image, 'Copiar URL de la imagen') : null),
      h('p', { class: 'muted small' }, 'Aproximaciones del aspecto en cada plataforma; cada servicio puede recortar distinto.'),
      card('Buscador', h('div', { class: 'sp-serp' }, h('div', { class: 'sp-site' }, h('b', null, site), h('small', null, m.url)), h('div', { class: 'sp-serp-title' }, cut(m.title || title, 60)), h('div', { class: 'sp-desc' }, cut(m.description || desc, 160)))),
      card('X (Twitter)', large ? h('div', { class: 'sp-x large' }, img(), h('div', { class: 'sp-x-domain' }, host), h('div', { class: 'sp-x-title' }, cut(title, 70))) : h('div', { class: 'sp-x small' }, img('thumb'), h('div', null, h('div', { class: 'sp-x-domain' }, host), h('b', null, cut(title, 70)), h('div', { class: 'sp-desc' }, cut(desc, 120))))),
      card('Facebook', h('div', { class: 'sp-fb' }, img(), h('div', { class: 'sp-fb-body' }, h('small', null, host.toUpperCase()), h('b', null, cut(title, 88)), h('div', { class: 'sp-desc' }, cut(desc, 110))))),
      card('LinkedIn', h('div', { class: 'sp-li' }, img(), h('div', { class: 'sp-li-body' }, h('b', null, cut(title, 70)), h('small', null, host)))),
      card('Slack', h('div', { class: 'sp-slack' }, h('b', null, site), h('a', null, title), h('div', { class: 'sp-desc' }, cut(desc, 200)), image ? img('slack') : null)),
      card('Discord', h('div', { class: 'sp-discord', style: { borderLeftColor: m.themeColor || '#5865f2' } }, h('small', null, site), h('a', null, cut(title, 90)), h('div', { class: 'sp-desc' }, cut(desc, 300)), image ? img() : null)),
      card('WhatsApp', h('div', { class: 'sp-wa' }, image ? img('thumb') : null, h('div', null, h('b', null, cut(title, 60)), h('div', { class: 'sp-desc' }, cut(desc, 80)), h('small', null, host)))),
    );
  }
  app.events.on('navigate', () => setTimeout(() => body.isConnected && load(), 1500));
  return { el: h('div', null, body), show: () => load() };
}
