import { api, h, icon } from '../dom';

export function section(title: string, ...children: any[]) {
  return h('section', { class: 'psec' }, h('h3', null, title), ...children);
}

export function empty(msg: string) {
  return h('p', { class: 'empty muted' }, msg);
}

export function pill(level: 'error' | 'warn' | 'info' | 'ok', text: string) {
  return h('span', { class: 'pill ' + level }, text);
}

export function issueList(items: { level: 'error' | 'warn' | 'info'; msg: string }[]) {
  if (!items.length) return h('p', { class: 'ok-line' }, icon('check', 14), ' Sin problemas detectados.');
  const label = { error: 'Error', warn: 'Aviso', info: 'Info' };
  return h('ul', { class: 'issues' }, items.map((i) => h('li', { class: i.level }, pill(i.level, label[i.level]), ' ', i.msg)));
}

export function kv(rows: [string, any][]) {
  return h(
    'dl',
    { class: 'kv' },
    rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v === null || v === undefined || v === '' ? h('span', { class: 'muted' }, '— falta —') : v)]),
  );
}

export function table(headers: string[], rows: any[][], cls = '') {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl ' + cls }, h('thead', null, h('tr', null, headers.map((t) => h('th', null, t)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
}

/** Button that shows a busy state while its async handler runs. */
export function action(label: string, run: () => Promise<unknown> | unknown, cls = 'btn') {
  const b = h('button', { class: cls }, label);
  b.addEventListener('click', async () => {
    b.disabled = true;
    b.classList.add('busy');
    try {
      await run();
    } finally {
      b.disabled = false;
      b.classList.remove('busy');
    }
  });
  return b;
}

export function link(href: string, text = href) {
  return h('a', { href: '#', class: 'ext', title: href, onclick: (e: Event) => (e.preventDefault(), api().openExternal(href)) }, text);
}

export function copyBtn(text: string, title = 'Copiar') {
  return h('button', { class: 'icon-btn tiny', title, onclick: () => api().copyText(text) }, icon('copy', 12));
}

export function swatch(color: string) {
  return h('span', { class: 'swatch', style: { background: color }, title: color });
}

export function short(url: string, max = 60) {
  try {
    const u = new URL(url);
    const s = u.host + u.pathname + u.search;
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  } catch {
    return url.length > max ? url.slice(0, max - 1) + '…' : url;
  }
}

export function tabs(names: [string, string][], onChange: (id: string) => void, initial = names[0][0]) {
  const bar = h('div', { class: 'seg' });
  const set = (id: string) => {
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    onChange(id);
  };
  for (const [id, label] of names) bar.appendChild(h('button', { 'data-id': id, onclick: () => set(id) }, label));
  queueMicrotask(() => set(initial));
  return bar;
}
