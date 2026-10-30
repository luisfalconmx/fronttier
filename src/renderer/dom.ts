import type { FronttierAPI } from '../shared/api';

declare global {
  interface Window {
    fronttier: FronttierAPI;
  }
}

export const api = () => window.fronttier;

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any> & { class?: string; style?: string | Partial<CSSStyleDeclaration> };

/** Tiny hyperscript helper: h('button', { class: 'x', onclick }, 'Texto'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') typeof v === 'string' ? (e.style.cssText = v) : Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k in e && typeof v !== 'string') (e as any)[k] = v;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(e, children);
  return e;
}

export function append(parent: Node, children: Child[]) {
  for (const c of (children as any[]).flat(Infinity) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : (c as Node));
  }
}

export function clear(e: Element, ...children: Child[]) {
  e.replaceChildren();
  append(e, children);
  return e;
}

const PATHS: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  forward: 'M9 18l6-6-6-6',
  reload: 'M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  layout: 'M3 4h18v16H3zM9 4v16M15 4v16',
  sync: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  record: 'M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
  portal: 'M5 5h6v6H5zM13 13h6v6h-6zM13 5h6v6h-6zM5 13h6v6H5z',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  panel: 'M3 4h18v16H3zM15 4v16',
  rotate: 'M4 4v6h6M20 20v-6h-6M5 15a8 8 0 0 0 14 1M19 9A8 8 0 0 0 5 8',
  devtools: 'M8 9l-4 3 4 3M16 9l4 3-4 3M13 6l-2 12',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  elements: 'M8 9l-4 3 4 3M16 9l4 3-4 3',
  console: 'M4 17l6-5-6-5M12 19h8',
  network: 'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4',
  perf: 'M3 12h4l3-8 4 16 3-8h4',
  meta: 'M4 6h16M4 12h10M4 18h7',
  social: 'M18 8a3 3 0 1 0-3-3M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0-3-3M8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  outline: 'M4 5h16M8 10h12M8 15h12M12 20h8',
  a11y: 'M12 4a2 2 0 1 0 0 .01M5 8l7 2 7-2M12 10v5l-3 6M12 15l3 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  emulate: 'M7 3h10v18H7zM11 18h2',
  debug: 'M8 8V6a4 4 0 0 1 8 0v2M6 8h12v6a6 6 0 0 1-12 0zM3 13h3M18 13h3M4 19l3-2M20 19l-3-2',
  storage: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  warn: 'M12 3l10 18H2zM12 10v4M12 17h.01',
  check: 'M5 12l5 5L20 7',
  zoomFit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  folder: 'M3 6h6l2 2h10v11H3z',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  pin: 'M12 17v5M8 3h8l-1 6 3 3H6l3-3z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
};

export function icon(name: string, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', name === 'record' ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name] ?? PATHS.more);
  svg.appendChild(path);
  return svg;
}

export function iconButton(name: string, title: string, onclick: (e: MouseEvent) => void, extra = '') {
  return h('button', { class: 'icon-btn ' + extra, title, 'aria-label': title, onclick }, icon(name));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, kind: 'info' | 'error' = 'info') {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast', role: 'status' });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t!.className = ''), 3200);
}

export function fmtBytes(n: number) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' kB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export function fmtMs(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n < 1000 ? Math.round(n) + ' ms' : (n / 1000).toFixed(2) + ' s';
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Simple anchored dropdown. Closes on outside click or Escape. */
export function popover(anchor: HTMLElement, content: HTMLElement, opts: { align?: 'left' | 'right'; width?: number } = {}) {
  document.querySelectorAll('.popover').forEach((p) => p.remove());
  const pop = h('div', { class: 'popover', role: 'dialog' }, content);
  if (opts.width) pop.style.width = opts.width + 'px';
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  let left = opts.align === 'right' ? r.right - pw : r.left;
  left = Math.max(8, Math.min(left, innerWidth - pw - 8));
  pop.style.left = left + 'px';
  pop.style.top = r.bottom + 6 + 'px';
  pop.style.maxHeight = innerHeight - r.bottom - 20 + 'px';
  const close = () => {
    pop.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', esc, true);
  };
  const outside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  setTimeout(() => {
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', esc, true);
  });
  return close;
}

export function menuList(items: ({ label: string; hint?: string; onclick: () => void; checked?: boolean; danger?: boolean } | 'sep' | { heading: string })[], close?: () => void) {
  return h(
    'div',
    { class: 'menu-list', role: 'menu' },
    items.map((it) => {
      if (it === 'sep') return h('div', { class: 'menu-sep' });
      if ('heading' in it) return h('div', { class: 'menu-heading' }, it.heading);
      return h(
        'button',
        { class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', onclick: () => (it.onclick(), close?.()) },
        h('span', { class: 'check' }, it.checked ? '✓' : ''),
        h('span', { class: 'label' }, it.label),
        it.hint ? h('span', { class: 'hint' }, it.hint) : null,
      );
    }),
  );
}

export function field(label: string, control: HTMLElement, hint?: string) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('small', { class: 'muted' }, hint) : null);
}

export function select<T extends string>(value: T, options: [T, string][], onchange: (v: T) => void) {
  const s = h('select', { onchange: () => onchange(s.value as T) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  return s;
}

export function toggle(label: string, checked: boolean, onchange: (v: boolean) => void, hint?: string) {
  const input = h('input', { type: 'checkbox', checked, onchange: () => onchange(input.checked) });
  return h('label', { class: 'toggle' }, input, h('span', null, label, hint ? h('small', { class: 'muted block' }, hint) : null));
}

/** Modal text prompt (window.prompt is not available in Electron). */
export function ask(title: string, value = '', opts: { multiline?: boolean; hint?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const input = opts.multiline ? h('textarea', { rows: 6 }) : h('input', { type: 'text' });
    input.value = value;
    const done = (v: string | null) => {
      overlay.remove();
      resolve(v);
    };
    const overlay = h(
      'div',
      { class: 'modal-backdrop', onmousedown: (e: MouseEvent) => e.target === overlay && done(null) },
      h(
        'form',
        { class: 'modal small', onsubmit: (e: Event) => (e.preventDefault(), done(input.value)) },
        h('h3', null, title),
        opts.hint ? h('p', { class: 'muted small' }, opts.hint) : null,
        input,
        h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => done(null) }, 'Cancelar'), h('button', { type: 'submit', class: 'btn primary' }, 'Aceptar')),
      ),
    );
    overlay.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
    document.body.appendChild(overlay);
    input.focus();
    (input as HTMLInputElement).select?.();
  });
}
