// Outline (headings, landmarks, links), accessibility audits and simulators.
import type { App } from '../app';
import { api, clear, h, toggle } from '../dom';
import { action, copyBtn, empty, issueList, link, pill, section, short, swatch, table, tabs } from './ui';

type Outline = Awaited<ReturnType<typeof import('../../pane/tools').outline>>;
type Images = Awaited<ReturnType<typeof import('../../pane/tools').images>>;
type Contrast = Awaited<ReturnType<typeof import('../../pane/tools').contrastAudit>>;

const highlight = (app: App, sel: string) => app.toolAll('highlight', { sel, scroll: true });

export function outlinePanel(app: App) {
  const body = h('div');
  let view = 'headings';
  let data: Outline | null = null;
  const linkStatus = new Map<string, number>();

  async function load() {
    const p = app.primary();
    if (!p) return clear(body, empty('Abre una página.'));
    try {
      data = await p.tool<Outline>('outline');
      render();
    } catch (e: any) {
      clear(body, empty(e.message));
    }
  }

  async function checkLinks() {
    if (!data) return;
    const urls = [...new Set(data.links.map((l) => l.href).filter((u) => /^https?:/.test(u)))].slice(0, 150);
    let i = 0;
    const worker = async () => {
      while (i < urls.length) {
        const u = urls[i++];
        if (linkStatus.has(u)) continue;
        linkStatus.set(u, (await api().fetchText(u)).status);
        render();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    const broken = urls.filter((u) => (linkStatus.get(u) ?? 0) >= 400 || linkStatus.get(u) === 0).length;
    app.toast(broken ? `${broken} enlaces rotos de ${urls.length}` : `${urls.length} enlaces comprobados, ninguno roto`);
  }

  function render() {
    if (!data) return;
    const d = data;
    let content: HTMLElement;
    if (view === 'headings') {
      content = d.headings.length
        ? h(
            'ol',
            { class: 'outline' },
            d.headings.map((x) =>
              h(
                'li',
                { class: 'clickable' + (x.issues.length ? ' has-issue' : ''), style: { paddingLeft: (x.level - 1) * 14 + 'px' }, onclick: () => highlight(app, x.sel) },
                h('span', { class: 'hl-level' }, 'H' + x.level),
                ' ',
                x.text || h('em', { class: 'muted' }, '(vacío)'),
                x.hidden ? h('small', { class: 'muted' }, ' oculto') : null,
                x.issues.map((i) => [' ', pill('warn', i)]),
              ),
            ),
          )
        : empty('La página no tiene encabezados.');
    } else if (view === 'landmarks') {
      content = h(
        'div',
        null,
        issueList(d.landmarkIssues.map((m) => ({ level: 'warn' as const, msg: m }))),
        d.landmarks.length ? h('ul', { class: 'outline' }, d.landmarks.map((l) => h('li', { class: 'clickable', onclick: () => highlight(app, l.sel) }, h('b', null, l.role), ` <${l.tag}>`, l.name ? ` “${l.name}”` : ''))) : empty('No hay landmarks.'),
      );
    } else {
      const bad = d.links.filter((l) => l.issues.length).length;
      content = h(
        'div',
        null,
        h('div', { class: 'row' }, h('span', { class: 'muted small' }, `${d.links.length} enlaces · ${bad} con avisos · ${d.links.filter((l) => l.external).length} externos`), action('Buscar enlaces rotos', checkLinks)),
        table(
          ['Texto', 'Destino', 'Estado'],
          d.links.map((l) => {
            const st = linkStatus.get(l.href);
            return [
              h('span', { class: 'clickable', onclick: () => highlight(app, l.sel) }, l.text || h('em', { class: 'bad' }, 'sin texto'), l.issues.map((i) => [' ', pill('warn', i)])),
              h('span', { title: l.href }, short(l.href, 40)),
              st === undefined ? '' : h('span', { class: st >= 400 || st === 0 ? 'bad' : 'good' }, st === 0 ? 'error' : String(st)),
            ];
          }),
          'compact',
        ),
      );
    }
    clear(body.querySelector('.outline-content') ?? body.appendChild(h('div', { class: 'outline-content' })), content);
  }

  const el = h(
    'div',
    null,
    h('div', { class: 'row' }, tabs([['headings', 'Encabezados'], ['landmarks', 'Landmarks'], ['links', 'Enlaces']], (id) => ((view = id), render())), action('Actualizar', load, 'btn small')),
    body,
  );
  app.events.on('navigate', () => setTimeout(() => el.isConnected && load(), 1500));
  return { el, show: () => load() };
}

const IMPACT: Record<string, 'error' | 'warn' | 'info'> = { critical: 'error', serious: 'error', moderate: 'warn', minor: 'info' };
const IMPACT_ES: Record<string, string> = { critical: 'Crítico', serious: 'Grave', moderate: 'Moderado', minor: 'Menor' };

export function a11yPanel(app: App) {
  const out = h('div');
  let view = 'scan';
  let axeSrc = '';

  async function scan() {
    const p = app.primary();
    if (!p) return clear(out, empty('Abre una página.'));
    axeSrc ||= await api().axeSource();
    clear(out, empty('Analizando con axe-core…'));
    try {
      const r = await p.webview.executeJavaScript(
        `${axeSrc};\naxe.run(document, { resultTypes: ['violations'] }).then(r => ({
          violations: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, description: v.description, helpUrl: v.helpUrl, tags: v.tags, nodes: v.nodes.slice(0, 25).map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 200), summary: n.failureSummary })) })),
          passes: r.passes.length, incomplete: r.incomplete.length }))`,
        true,
      );
      const order = ['critical', 'serious', 'moderate', 'minor'];
      r.violations.sort((a: any, b: any) => order.indexOf(a.impact) - order.indexOf(b.impact));
      clear(
        out,
        h('p', null, pill(r.violations.length ? 'error' : 'ok', `${r.violations.length} problemas`), ' ', pill('ok', `${r.passes} reglas superadas`), ' ', pill('info', `${r.incomplete} a revisar manualmente`)),
        r.violations.length
          ? h(
              'div',
              null,
              r.violations.map((v: any) =>
                h(
                  'details',
                  { class: 'axe' },
                  h('summary', null, pill(IMPACT[v.impact] ?? 'info', IMPACT_ES[v.impact] ?? v.impact), ' ', v.help, h('small', { class: 'muted' }, ` (${v.nodes.length})`)),
                  h('p', { class: 'muted small' }, v.description, ' ', link(v.helpUrl, 'Más información')),
                  h('p', { class: 'small muted' }, v.tags.filter((t: string) => /wcag|best/.test(t)).join(' · ')),
                  h('ul', { class: 'nodes' }, v.nodes.map((n: any) => h('li', { class: 'clickable', onclick: () => highlight(app, n.target) }, h('code', null, n.html), h('pre', { class: 'small' }, n.summary)))),
                ),
              ),
            )
          : h('p', { class: 'ok-line' }, '¡Sin problemas automáticos! Revisa también manualmente el teclado y el lector de pantalla.'),
      );
    } catch (e: any) {
      clear(out, empty('No se pudo ejecutar axe: ' + e.message));
    }
  }

  async function images() {
    const p = app.primary();
    if (!p) return;
    const list = await p.tool<Images>('images');
    const bad = list.filter((i) => i.issues.length);
    clear(
      out,
      h('div', { class: 'row' }, toggle('Mostrar texto alternativo sobre las imágenes', app.tools.showAlt, (v) => app.setTools({ showAlt: v }))),
      h('p', { class: 'muted small' }, `${list.length} imágenes · ${bad.length} con avisos · ${list.filter((i) => i.decorative).length} decorativas`),
      h(
        'div',
        { class: 'img-audit' },
        [...bad, ...list.filter((i) => !i.issues.length)].map((i) =>
          h(
            'div',
            { class: 'img-item clickable', onclick: () => highlight(app, i.sel) },
            i.src ? h('img', { src: i.src, alt: '', loading: 'lazy' }) : h('div', { class: 'img-ph' }, i.tag),
            h(
              'div',
              null,
              h('div', null, i.alt === null ? h('em', { class: 'bad' }, 'sin atributo alt') : i.alt === '' ? h('em', { class: 'muted' }, 'alt vacío (decorativa)') : `“${i.alt}”`),
              h('small', { class: 'muted' }, `${i.tag} · ${i.rendered.w}×${i.rendered.h}${i.natural?.w ? ` (original ${i.natural.w}×${i.natural.h})` : ''}${i.visible ? '' : ' · oculta'}`),
              h('div', null, i.issues.map((x) => [pill('warn', x), ' '])),
            ),
          ),
        ),
      ),
    );
  }

  async function contrast() {
    const p = app.primary();
    if (!p) return;
    const r = await p.tool<Contrast>('contrast');
    const fails = r.items.filter((i) => !i.aa).sort((a, b) => a.ratio - b.ratio);
    const passes = r.items.filter((i) => i.aa);
    const row = (i: Contrast['items'][number]) =>
      h(
        'div',
        { class: 'contrast-item clickable', onclick: () => highlight(app, i.sel) },
        h('div', { class: 'contrast-sample', style: { color: i.fg, background: i.bg } }, 'Aa'),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'ellipsis' }, i.text),
          h('small', null, swatch(i.fg), i.fg, ' sobre ', swatch(i.bg), i.bg, i.large ? ' · texto grande' : ''),
          h('div', null, pill(i.aa ? 'ok' : 'error', `${i.ratio.toFixed(2)}:1 AA ${i.aa ? '✓' : '✕'}`), ' ', pill(i.aaa ? 'ok' : 'warn', `AAA ${i.aaa ? '✓' : '✕'}`), ' ', pill(Math.abs(i.apca) >= (i.large ? 45 : 60) ? 'ok' : 'warn', `APCA Lc ${Math.round(i.apca)}`)),
          i.suggestion ? h('div', { class: 'small' }, 'Sugerencia AA: ', swatch(i.suggestion), h('code', null, i.suggestion), copyBtn(i.suggestion, 'Copiar color')) : null,
        ),
      );
    clear(
      out,
      toggle('Marcar en la página los textos que fallan', app.tools.contrastBadges, (v) => app.setTools({ contrastBadges: v })),
      h('p', { class: 'muted small' }, `${r.items.length} textos analizados · ${fails.length} fallan AA · ${r.unknown} sobre imágenes o degradados (revisar manualmente)`),
      section('Fallan', fails.length ? h('div', null, fails.map(row)) : empty('Ninguno.')),
      h('details', null, h('summary', null, `Pasan (${passes.length})`), h('div', null, passes.slice(0, 150).map(row))),
    );
  }

  async function focus() {
    const p = app.primary();
    if (!p) return;
    const list = await p.tool<{ tag: string; name: string; tabIndex: number }[]>('focusOrder');
    clear(
      out,
      toggle('Mostrar el orden de foco sobre la página', app.tools.focusOrder, (v) => app.setTools({ focusOrder: v })),
      h('p', { class: 'muted small' }, `${list.length} elementos enfocables con teclado. Los marcados en ámbar usan tabindex > 0, que altera el orden natural.`),
      h('ol', { class: 'focus-list' }, list.map((x) => h('li', null, h('code', null, x.tag), ' ', x.name || h('em', { class: 'bad' }, 'sin nombre'), x.tabIndex > 0 ? [' ', pill('warn', 'tabindex=' + x.tabIndex)] : null))),
    );
  }

  async function axTree() {
    const p = app.primary();
    if (!p?.wcId) return;
    clear(out, empty('Leyendo el árbol de accesibilidad…'));
    const r = await api().cdp(p.wcId, 'Accessibility.getFullAXTree', {});
    const nodes: any[] = r.nodes ?? [];
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    let count = 0;
    const render = (n: any, depth: number): any => {
      if (!n || count > 2000) return null;
      const kids = (n.childIds ?? []).map((id: string) => byId.get(id));
      if (n.ignored) return kids.map((k: any) => render(k, depth));
      count++;
      const role = n.role?.value ?? '';
      const name = n.name?.value ?? '';
      const children = kids.map((k: any) => render(k, depth + 1)).flat().filter(Boolean);
      const label = h('span', null, h('b', null, role), name ? ` “${String(name).slice(0, 80)}”` : '');
      return children.length && depth < 40 ? h('details', { class: 'ax', open: depth < 3 }, h('summary', null, label), children) : h('div', { class: 'ax leaf' }, label);
    };
    clear(out, h('p', { class: 'muted small' }, 'Lo que recibe un lector de pantalla (rol y nombre accesible) según Chromium.'), render(nodes[0], 0));
  }

  const views: Record<string, () => Promise<unknown>> = { scan, images, contrast, focus, ax: axTree };
  const run = () => (views[view]?.() ?? Promise.resolve()).catch((e: any) => clear(out, empty(e.message)));
  const el = h(
    'div',
    null,
    h('div', { class: 'row wrap' }, tabs([['scan', 'Escáner'], ['contrast', 'Contraste'], ['images', 'Imágenes'], ['focus', 'Orden de foco'], ['ax', 'Árbol a11y']], (id) => ((view = id), run())), action('Actualizar', run, 'btn small')),
    out,
  );
  app.events.on('navigate', () => setTimeout(() => el.isConnected && run(), 1500));
  return { el };
}

const SIMS: { group: string; items: [string, string, 'cdp' | 'page'][] }[] = [
  {
    group: 'Visión del color',
    items: [
      ['protanopia', 'Protanopía (sin rojo)', 'cdp'],
      ['deuteranopia', 'Deuteranopía (sin verde)', 'cdp'],
      ['tritanopia', 'Tritanopía (sin azul)', 'cdp'],
      ['achromatopsia', 'Acromatopsia (sin color)', 'cdp'],
      ['protanomaly', 'Protanomalía (rojo débil)', 'page'],
      ['deuteranomaly', 'Deuteranomalía (verde débil)', 'page'],
      ['tritanomaly', 'Tritanomalía (azul débil)', 'page'],
      ['achromatomaly', 'Acromatomalía (color débil)', 'page'],
    ],
  },
  {
    group: 'Visión',
    items: [
      ['blurredVision', 'Visión borrosa', 'cdp'],
      ['reducedContrast', 'Contraste reducido', 'cdp'],
      ['cataracts', 'Cataratas', 'page'],
      ['glaucoma', 'Glaucoma', 'page'],
      ['macular', 'Degeneración macular', 'page'],
      ['tunnel', 'Visión de túnel', 'page'],
      ['astigmatism', 'Astigmatismo', 'page'],
    ],
  },
  { group: 'Cognitiva y motriz', items: [['dyslexia', 'Dislexia (letras que se mueven)', 'page'], ['tremor', 'Temblor: resaltar objetivos táctiles', 'page']] },
  {
    group: 'Situacional',
    items: [
      ['dim', 'Pantalla tenue', 'page'],
      ['sunlight', 'Luz solar directa', 'page'],
      ['night', 'Modo nocturno / luz cálida', 'page'],
    ],
  },
];

export function simulatorsPanel(app: App) {
  const current = () => app.settings.emu.vision || app.tools.simulator;
  const set = (id: string, kind: 'cdp' | 'page' | null) => {
    app.setEmu({ vision: kind === 'cdp' ? id : '' });
    app.setTools({ simulator: kind === 'page' ? id : '' });
    render();
  };
  const body = h('div');
  const render = () =>
    clear(
      body,
      h('p', { class: 'muted small' }, 'Se aplica a todos los paneles. Las simulaciones de color usan la emulación de Chromium o matrices de color publicadas.'),
      h('button', { class: 'btn' + (current() ? '' : ' primary'), onclick: () => set('', null) }, 'Sin simulación'),
      SIMS.map((g) =>
        section(
          g.group,
          h('div', { class: 'sim-grid' }, g.items.map(([id, label, kind]) => h('button', { class: 'chip' + (current() === id ? ' on' : ''), onclick: () => set(id, kind) }, label))),
        ),
      ),
    );
  render();
  return { el: body, show: render };
}
