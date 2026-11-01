import {
  Accessibility, ArrowLeft, ArrowLeftToLine, ArrowRight, ArrowRightToLine, Bug, Camera, Check, Circle, CodeXml, Columns3, Command, Copy, CopyPlus,
  createElement, Database, Download, Ellipsis, Eye, FileText, Folder, Gauge, LayoutDashboard, ListTree, Maximize, MemoryStick, Moon, Network, PanelRight,
  Pin, Plus, QrCode, RefreshCcw, RotateCcwSquare, RotateCw, ScrollText, Search, Settings, Share2, ShieldOff, Smartphone, SquareCode, SquareTerminal, Star,
  Sun, SunMoon, Monitor, Tag, Trash2, TriangleAlert, X, Zap, ZoomIn, ZoomOut, type IconNode,
} from 'lucide';
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

// App icon names → Lucide icons (https://lucide.dev). Named imports keep the bundle to the ones used.
const ICONS: Record<string, IconNode> = {
  back: ArrowLeft,
  forward: ArrowRight,
  reload: RotateCw,
  plus: Plus,
  close: X,
  layout: LayoutDashboard,
  sync: RefreshCcw,
  camera: Camera,
  record: Circle,
  portal: QrCode,
  command: Command,
  panel: PanelRight,
  rotate: RotateCcwSquare,
  devtools: SquareCode,
  more: Ellipsis,
  star: Star,
  elements: CodeXml,
  console: SquareTerminal,
  network: Network,
  perf: Gauge,
  meta: FileText,
  social: Share2,
  outline: ListTree,
  a11y: Accessibility,
  eye: Eye,
  emulate: Smartphone,
  debug: Bug,
  storage: Database,
  settings: Settings,
  moon: Moon,
  sun: Sun,
  scheme: SunMoon,
  system: Monitor,
  vitals: Gauge,
  search: Search,
  copy: Copy,
  duplicate: CopyPlus,
  trash: Trash2,
  warn: TriangleAlert,
  check: Check,
  zoomFit: Maximize,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  folder: Folder,
  download: Download,
  pin: Pin,
  bolt: Zap,
  tag: Tag,
  panes: Columns3,
  ram: MemoryStick,
  shield: ShieldOff,
  moveLeft: ArrowLeftToLine,
  moveRight: ArrowRightToLine,
  fullPage: ScrollText,
};

export function icon(name: string, size = 16) {
  const svg = createElement(ICONS[name] ?? Ellipsis, {
    width: size,
    height: size,
    'stroke-width': 1.8,
    fill: name === 'record' ? 'currentColor' : 'none',
    'aria-hidden': 'true',
  });
  svg.classList.add('icon');
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

let activeClose: (() => void) | undefined;

/** Simple anchored dropdown. Closes on outside click or Escape. */
export function popover(anchor: HTMLElement, content: HTMLElement, opts: { align?: 'left' | 'right'; width?: number; beside?: HTMLElement; onClose?: () => void } = {}) {
  activeClose?.();
  document.querySelectorAll('.popover').forEach((p) => p.remove());
  const pop = h('div', { class: 'popover', role: 'dialog' }, content);
  if (opts.width) pop.style.width = opts.width + 'px';
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const beside = opts.beside?.getBoundingClientRect();
  const bounds = (opts.beside?.closest('.panes-wrap') ?? document.documentElement).getBoundingClientRect();
  if (beside && (beside.right + 8 + pw <= bounds.right || beside.left - 8 - pw >= bounds.left)) {
    // Next to the element (e.g. a pane), on whichever side has room; right first.
    const top = Math.max(8, Math.min(r.top, innerHeight - pop.offsetHeight - 8));
    pop.style.left = (beside.right + 8 + pw <= bounds.right ? beside.right + 8 : beside.left - 8 - pw) + 'px';
    pop.style.top = top + 'px';
    pop.style.maxHeight = innerHeight - top - 8 + 'px';
  } else if (anchor.closest('.side-tabs')) {
    // Side rail: open beside the button, toward the panes.
    const top = Math.max(8, Math.min(r.top, innerHeight - pop.offsetHeight - 8));
    pop.style.left = Math.max(8, r.left - pw - 6) + 'px';
    pop.style.top = top + 'px';
    pop.style.maxHeight = innerHeight - top - 8 + 'px';
  } else {
    let left = opts.align === 'right' ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, innerWidth - pw - 8));
    pop.style.left = left + 'px';
    pop.style.top = r.bottom + 6 + 'px';
    pop.style.maxHeight = innerHeight - r.bottom - 20 + 'px';
  }
  const close = () => {
    if (!pop.isConnected) return;
    pop.remove();
    opts.onClose?.();
    if (activeClose === close) activeClose = undefined;
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', esc, true);
  };
  const outside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  activeClose = close;
  setTimeout(() => {
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', esc, true);
  });
  return close;
}

export function menuList(items: ({ label: string; hint?: string; icon?: string; onclick: () => void; checked?: boolean; danger?: boolean } | 'sep' | { heading: string })[], close?: () => void) {
  return h(
    'div',
    { class: 'menu-list', role: 'menu' },
    items.map((it) => {
      if (it === 'sep') return h('div', { class: 'menu-sep' });
      if ('heading' in it) return h('div', { class: 'menu-heading' }, it.heading);
      return h(
        'button',
        { class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', onclick: () => (it.onclick(), close?.()) },
        h('span', { class: 'check' }, it.checked ? icon('check', 14) : it.icon ? icon(it.icon, 14) : ''),
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
