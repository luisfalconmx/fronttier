// Unified developer tools: Elements, Console and Network across all panes.
import type { NetSummary } from '../../shared/types';
import type { App } from '../app';
import { api, ask, clear, fmtBytes, fmtMs, h, icon } from '../dom';
import type { PaneView } from '../pane';
import { action, empty, short, table } from './ui';

interface DomNode {
  sel: string;
  tag: string;
  attrs: [string, string][];
  text: string;
  n: number;
}

export function elementsPanel(app: App) {
  const tree = h('div', { class: 'dom-tree', role: 'tree' });
  const actions = h('div', { class: 'dom-actions' });
  const search = h('input', { type: 'search', placeholder: 'Ir a selector CSS…', onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && reveal(search.value.trim()) });
  let selected: DomNode | null = null;
  const rows = new Map<string, HTMLElement>();

  const edit = async (op: Record<string, unknown>) => {
    await app.toolAll('domEdit', op);
  };

  const renderActions = () => {
    if (!selected) return clear(actions, h('p', { class: 'muted small' }, 'Selecciona un nodo. Los cambios se aplican en todos los paneles.'));
    const s = selected;
    clear(
      actions,
      h('code', { class: 'sel' }, s.sel),
      h(
        'div',
        { class: 'row wrap' },
        h('button', { class: 'btn small', onclick: () => api().copyText(s.sel) }, 'Copiar selector'),
        h('button', { class: 'btn small', onclick: async () => {
          const name = await ask('Nombre del atributo', 'class');
          if (!name) return;
          const current = s.attrs.find(([k]) => k === name)?.[1] ?? '';
          const value = await ask(`Valor de ${name}`, current);
          if (value !== null) await edit({ kind: 'attr', sel: s.sel, name, value }), refreshNode(s.sel);
        } }, 'Editar atributo'),
        h('button', { class: 'btn small', onclick: async () => {
          const v = await ask('Estilo inline (style)', s.attrs.find(([k]) => k === 'style')?.[1] ?? '', { multiline: true });
          if (v !== null) await edit({ kind: 'style', sel: s.sel, value: v }), refreshNode(s.sel);
        } }, 'Estilo inline'),
        h('button', { class: 'btn small', onclick: async () => {
          const v = await ask('Texto del elemento', s.text, { multiline: true, hint: 'Reemplaza todo el contenido del elemento.' });
          if (v !== null) await edit({ kind: 'text', sel: s.sel, value: v }), refreshNode(s.sel);
        } }, 'Editar texto'),
        h('button', { class: 'btn small danger', onclick: async () => (await edit({ kind: 'remove', sel: s.sel }), load()) }, 'Eliminar'),
      ),
    );
  };

  const nodeLabel = (n: DomNode) => {
    const attrs = n.attrs.map(([k, v]) => [h('span', { class: 'attr-k' }, ' ' + k), v ? [h('span', { class: 'attr-eq' }, '="'), h('span', { class: 'attr-v' }, v.length > 60 ? v.slice(0, 60) + '…' : v), h('span', { class: 'attr-eq' }, '"')] : null]);
    return h('span', { class: 'node' }, h('span', { class: 'tag' }, '<' + n.tag), attrs, h('span', { class: 'tag' }, '>'), n.text ? h('span', { class: 'node-text' }, ' ' + n.text) : null);
  };

  const renderChildren = (container: HTMLElement, nodes: DomNode[], depth: number) => {
    for (const n of nodes) {
      const kids = h('div', { class: 'dom-kids hidden' });
      const toggle = h('span', { class: 'twisty' }, n.n ? '▸' : '');
      const row = h(
        'div',
        { class: 'dom-row', role: 'treeitem', style: { paddingLeft: depth * 12 + 6 + 'px' }, title: n.sel },
        toggle,
        nodeLabel(n),
      );
      row.addEventListener('click', async (e) => {
        if (e.target === toggle) return;
        tree.querySelectorAll('.dom-row.sel').forEach((r) => r.classList.remove('sel'));
        row.classList.add('sel');
        selected = n;
        renderActions();
        app.toolAll('highlight', { sel: n.sel, scroll: true });
      });
      toggle.addEventListener('click', () => expand(n, kids, toggle, depth));
      row.addEventListener('dblclick', () => expand(n, kids, toggle, depth));
      rows.set(n.sel, row);
      (row as any)._expand = () => expand(n, kids, toggle, depth, true);
      container.append(row, kids);
    }
  };

  async function expand(n: DomNode, kids: HTMLElement, toggle: HTMLElement, depth: number, forceOpen = false) {
    if (!n.n) return;
    const open = !kids.classList.contains('hidden');
    if (open && !forceOpen) {
      kids.classList.add('hidden');
      toggle.textContent = '▸';
      return;
    }
    if (!kids.childElementCount) {
      const r = await app.primary()?.tool<{ children: DomNode[] }>('dom', { sel: n.sel });
      renderChildren(kids, r?.children ?? [], depth + 1);
    }
    kids.classList.remove('hidden');
    toggle.textContent = '▾';
  }

  async function load() {
    rows.clear();
    selected = null;
    renderActions();
    const p = app.primary();
    if (!p) return clear(tree, empty('Abre una página para ver su DOM.'));
    try {
      const r = await p.tool<{ children: DomNode[] }>('dom', {});
      clear(tree);
      renderChildren(tree, r.children, 0);
      for (const n of r.children) if (n.tag === 'body') (rows.get(n.sel) as any)?._expand();
    } catch (e: any) {
      clear(tree, empty(e.message));
    }
  }

  async function refreshNode(sel: string) {
    const parent = sel.includes(' > ') ? sel.slice(0, sel.lastIndexOf(' > ')) : undefined;
    const r = await app.primary()?.tool<{ children: DomNode[] }>('dom', { sel: parent });
    const fresh = r?.children.find((c) => c.sel === sel);
    const row = rows.get(sel);
    if (fresh && row) {
      row.querySelector('.node')?.replaceWith(nodeLabel(fresh));
      if (selected?.sel === sel) (selected = fresh), renderActions();
    }
  }

  async function reveal(sel: string) {
    if (!sel) return;
    if (!rows.size) await load();
    const parts = sel.split(' > ');
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join(' > ');
      const row = rows.get(prefix);
      if (row) await (row as any)._expand();
    }
    let row = rows.get(sel);
    if (!row) {
      // Path starts at an id outside the loaded tree: show that subtree on its own.
      const r = await app.primary()?.tool<{ children: DomNode[] }>('dom', { sel: parts.slice(0, -1).join(' > ') || undefined });
      const nodes = r?.children ?? [];
      clear(tree, h('p', { class: 'muted small' }, 'Subárbol de ' + (parts.slice(0, -1).join(' > ') || 'html')));
      renderChildren(tree, nodes, 0);
      row = rows.get(sel);
    }
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.click();
    } else app.toast('No se encontró ' + sel);
  }

  const el = h('div', { class: 'panel-elements' }, h('div', { class: 'row' }, search, h('button', { class: 'btn small', onclick: () => load() }, icon('reload', 14), 'Recargar')), actions, tree);
  app.events.on('navigate', () => setTimeout(load, 800));
  app.events.on('tab', () => setTimeout(load, 800));
  return { el, show: () => !rows.size && load(), reveal };
}

interface LogRow {
  key: string;
  level: string;
  message: string;
  source: string;
  panes: Set<string>;
  time: number;
  el?: HTMLElement;
}

export function consolePanel(app: App) {
  const list = h('div', { class: 'console-list', role: 'log' });
  const logs: LogRow[] = [];
  let level = 'all';
  let filter = '';
  let onlySelected = false;

  const visible = (r: LogRow) => (level === 'all' || r.level === level || (level === 'warning' && r.level === 'warn')) && (!filter || r.message.toLowerCase().includes(filter));
  const rowEl = (r: LogRow) =>
    h(
      'div',
      { class: 'log ' + r.level },
      h('span', { class: 'log-panes', title: [...r.panes].join(', ') }, r.panes.size > 1 ? `${r.panes.size} paneles` : [...r.panes][0]),
      h('pre', { class: 'log-msg' }, r.message),
      r.source ? h('span', { class: 'log-src', title: r.source }, short(r.source, 40)) : null,
    );
  const render = () => {
    clear(list, logs.filter(visible).map((r) => (r.el = rowEl(r))));
    list.scrollTop = list.scrollHeight;
  };

  app.events.on('console', ({ pane, level: lv, message, source }: { pane: PaneView; level: string; message: string; source: string }) => {
    const key = lv + '|' + message + '|' + source;
    const now = Date.now();
    const last = [...logs].reverse().find((l) => l.key === key && now - l.time < 2500);
    if (last) {
      last.panes.add(pane.cfg.name);
      if (last.el) last.el.replaceWith((last.el = rowEl(last)));
      return;
    }
    const r: LogRow = { key, level: lv, message, source, panes: new Set([pane.cfg.name]), time: now };
    logs.push(r);
    if (logs.length > 1500) logs.splice(0, 300);
    if (visible(r)) {
      list.appendChild((r.el = rowEl(r)));
      if (list.scrollHeight - list.scrollTop - list.clientHeight < 80) list.scrollTop = list.scrollHeight;
    }
  });
  app.events.on('tab', () => ((logs.length = 0), render()));

  const input = h('textarea', { class: 'console-input', rows: 2, placeholder: 'JavaScript para ejecutar en todos los paneles (Enter ejecuta, Shift+Enter nueva línea)' });
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const code = input.value.trim();
    if (!code) return;
    input.value = '';
    const targets = onlySelected ? [app.primary()].filter(Boolean) as PaneView[] : app.panes;
    list.appendChild(h('div', { class: 'log input' }, h('span', { class: 'log-panes' }, '›'), h('pre', { class: 'log-msg' }, code)));
    for (const p of targets) {
      try {
        const v = await p.webview.executeJavaScript(code, true);
        list.appendChild(h('div', { class: 'log result' }, h('span', { class: 'log-panes' }, p.cfg.name), h('pre', { class: 'log-msg' }, fmt(v))));
      } catch (err: any) {
        list.appendChild(h('div', { class: 'log error' }, h('span', { class: 'log-panes' }, p.cfg.name), h('pre', { class: 'log-msg' }, String(err?.message ?? err))));
      }
    }
    list.scrollTop = list.scrollHeight;
  });

  const levels: [string, string][] = [
    ['all', 'Todo'],
    ['error', 'Errores'],
    ['warning', 'Avisos'],
    ['info', 'Info'],
  ];
  const seg = h('div', { class: 'seg' }, levels.map(([id, l]) => h('button', { class: id === level ? 'on' : '', onclick: (e: MouseEvent) => {
    level = id;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    render();
  } }, l)));
  const el = h(
    'div',
    { class: 'panel-console' },
    h('div', { class: 'row wrap' }, seg, h('input', { type: 'search', placeholder: 'Filtrar', oninput: (e: Event) => ((filter = (e.target as HTMLInputElement).value.toLowerCase()), render()) }), h('button', { class: 'btn small', onclick: () => ((logs.length = 0), render()) }, 'Limpiar')),
    list,
    h('label', { class: 'mini-check' }, h('input', { type: 'checkbox', onchange: (e: Event) => (onlySelected = (e.target as HTMLInputElement).checked) }), 'Ejecutar solo en el panel seleccionado'),
    input,
  );
  return { el };
}

function fmt(v: unknown) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

export function networkPanel(app: App) {
  const summary = h('div');
  const detail = h('div');
  let type = 'all';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shown = false;

  const render = () => {
    const rows = app.panes.map((p) => {
      const s = app.net.get(p.wcId);
      const page = (() => {
        try {
          return new URL(p.url).origin;
        } catch {
          return '';
        }
      })();
      const third = s ? s.origins.filter((o) => o !== page && /^https?:/.test(o)).length : 0;
      return [p.cfg.name, s?.count ?? '—', s ? fmtBytes(s.bytes) : '—', fmtMs(s?.dcl), fmtMs(s?.load), third];
    });
    clear(summary, table(['Panel', 'Peticiones', 'Transferido', 'DOMContentLoaded', 'Load', 'Orígenes externos'], rows));
    const p = app.primary();
    const s: NetSummary | undefined = p ? app.net.get(p.wcId) : undefined;
    if (!p || !s) return clear(detail, empty('Sin datos de red todavía.'));
    const types = ['all', ...new Set(s.requests.map((r) => r.type))];
    const reqs = s.requests.filter((r) => type === 'all' || r.type === type);
    let page = '';
    try {
      page = new URL(p.url).origin;
    } catch {}
    const origins = s.origins.filter((o) => o !== page && /^https?:/.test(o));
    clear(
      detail,
      h('h4', null, `Peticiones de “${p.cfg.name}”`),
      h('div', { class: 'seg wrap' }, types.map((t) => h('button', { class: t === type ? 'on' : '', onclick: () => ((type = t), render()) }, t === 'all' ? 'Todas' : t))),
      table(
        ['Recurso', 'Tipo', 'Estado', 'Tamaño', 'Tiempo'],
        reqs.slice(-300).map((r) => [
          h('span', { title: r.url }, short(r.url, 48)),
          r.type,
          r.failed ? h('span', { class: 'bad' }, r.failed) : h('span', { class: (r.status ?? 0) >= 400 ? 'bad' : '' }, r.cached ? `${r.status ?? ''} (caché)` : String(r.status ?? '…')),
          r.size !== undefined ? fmtBytes(r.size) : '…',
          r.end ? fmtMs((r.end - r.start) * 1000) : '…',
        ]),
        'compact',
      ),
      origins.length ? h('h4', null, `Orígenes externos (${origins.length})`) : null,
      origins.length ? h('ul', { class: 'plain' }, origins.map((o) => h('li', null, o))) : null,
    );
  };
  const schedule = () => {
    if (!shown || timer) return;
    timer = setTimeout(() => ((timer = undefined), render()), 500);
  };
  app.events.on('net', schedule);
  app.events.on('select', schedule);
  const el = h('div', { class: 'panel-network' }, h('p', { class: 'muted small' }, 'Datos medidos con el protocolo de DevTools en cada panel. Selecciona un panel para ver sus peticiones.'), summary, detail);
  return { el, show: () => ((shown = true), render()), hide: () => (shown = false) };
}

export { action };
