// Helpers for drawing on top of the page without touching its own DOM tree:
// everything lives in one shadow root attached to <html>.
import { OVERLAY_TAG } from '../shared/sync-core';

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.fixed { position: fixed; inset: 0; pointer-events: none; }
.doc { position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; }
.badge { position: absolute; font: 600 11px/1 system-ui, sans-serif; color: #fff; background: #6d28d9; border-radius: 10px; padding: 3px 6px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
.badge.fail { background: #dc2626; }
.badge.warn { background: #d97706; }
.badge.alt { background: rgba(17,24,39,.9); max-width: 260px; white-space: normal; font-weight: 500; line-height: 1.3; }
.box { position: fixed; pointer-events: none; }
.card { position: fixed; z-index: 3; background: #111827; color: #e5e7eb; font-size: 12px; line-height: 1.45; padding: 10px 12px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.35); max-width: 340px; pointer-events: none; }
.card b { color: #fff; }
.card .tag { color: #c4b5fd; font-weight: 700; }
.card .row { display: flex; gap: 8px; justify-content: space-between; }
.card .muted { color: #9ca3af; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(255,255,255,.4); vertical-align: -1px; margin-right: 4px; }
.ruler-x { position: fixed; top: 0; left: 0; right: 0; height: 18px; background-color: rgba(250,250,250,.92); border-bottom: 1px solid #9ca3af;
  background-image: repeating-linear-gradient(90deg, #6b7280 0 1px, transparent 1px 100px), repeating-linear-gradient(90deg, #9ca3af 0 1px, transparent 1px 10px);
  background-size: 100% 18px, 100% 6px; background-repeat: no-repeat; background-position: 0 0, 0 12px; }
.ruler-y { position: fixed; top: 0; left: 0; bottom: 0; width: 18px; background-color: rgba(250,250,250,.92); border-right: 1px solid #9ca3af;
  background-image: repeating-linear-gradient(180deg, #6b7280 0 1px, transparent 1px 100px), repeating-linear-gradient(180deg, #9ca3af 0 1px, transparent 1px 10px);
  background-size: 18px 100%, 6px 100%; background-repeat: no-repeat; background-position: 0 0, 12px 0; }
.ruler-label { position: fixed; font: 9px/1 ui-monospace, monospace; color: #374151; }
.cursor-x { position: fixed; top: 0; bottom: 0; width: 1px; background: #ef4444; }
.cursor-y { position: fixed; left: 0; right: 0; height: 1px; background: #ef4444; }
.pos { position: fixed; font: 10px/1 ui-monospace, monospace; background: #ef4444; color: #fff; padding: 2px 4px; border-radius: 3px; }
.grid { position: fixed; top: 0; bottom: 0; display: flex; left: 0; right: 0; margin: 0 auto; }
.grid > div { flex: 1; background: rgba(239,68,68,.12); border-left: 1px solid rgba(239,68,68,.35); border-right: 1px solid rgba(239,68,68,.35); }
.hl { position: absolute; border: 2px solid #8b5cf6; background: rgba(139,92,246,.15); border-radius: 2px; transition: opacity .4s; }
.hl-label { position: absolute; transform: translateY(-100%); background: #8b5cf6; color: #fff; font: 600 11px/1 system-ui; padding: 3px 5px; border-radius: 3px 3px 0 0; white-space: nowrap; }
.veil { position: fixed; inset: 0; pointer-events: none; }
`;

let root: ShadowRoot | null = null;

export function overlayRoot(): ShadowRoot {
  if (root && root.host.isConnected) return root;
  const host = document.createElement(OVERLAY_TAG.toLowerCase());
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;filter:none!important;';
  document.documentElement.appendChild(host);
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);
  return root;
}

export function layer(name: string, kind: 'fixed' | 'doc' = 'fixed'): HTMLElement {
  const r = overlayRoot();
  let el = r.querySelector<HTMLElement>(`[data-layer="${name}"]`);
  if (!el) {
    el = document.createElement('div');
    el.dataset.layer = name;
    el.className = kind;
    r.appendChild(el);
  }
  return el;
}

export function clearLayer(name: string) {
  root?.querySelector(`[data-layer="${name}"]`)?.remove();
}

export function el(tag: string, cls: string, style: Partial<CSSStyleDeclaration> = {}, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Inject or remove a stylesheet into the page itself. */
export function pageStyle(id: string, css: string | null) {
  const elId = 'fronttier-style-' + id;
  let s = document.getElementById(elId) as HTMLStyleElement | null;
  if (css === null) {
    s?.remove();
    return;
  }
  if (!s) {
    s = document.createElement('style');
    s.id = elId;
    s.setAttribute('data-fronttier', '');
    (document.head || document.documentElement).appendChild(s);
  }
  s.textContent = css;
}

export function isVisible(e: Element) {
  const r = e.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(e);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
}

export function docRect(e: Element) {
  const r = e.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function textOf(e: Element, max = 120) {
  return (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Rough accessible name: enough for the inspector card and outline lists. */
export function accessibleName(e: Element): string {
  const label = e.getAttribute('aria-label');
  if (label) return label.trim();
  const by = e.getAttribute('aria-labelledby');
  if (by) return by.split(/\s+/).map((id) => textOf(document.getElementById(id) ?? document.createElement('i'))).join(' ').trim();
  if (e instanceof HTMLImageElement) return e.alt ?? '';
  if (e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement) {
    const id = e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`);
    if (id) return textOf(id);
    const wrap = e.closest('label');
    if (wrap) return textOf(wrap);
    return e.getAttribute('placeholder') ?? e.getAttribute('title') ?? '';
  }
  const t = textOf(e);
  if (t) return t;
  const img = e.querySelector('img[alt], svg[aria-label], [role=img][aria-label]');
  if (img) return img.getAttribute('alt') ?? img.getAttribute('aria-label') ?? '';
  return e.getAttribute('title') ?? '';
}

const IMPLICIT_ROLES: Record<string, string> = {
  A: 'link', BUTTON: 'button', NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary',
  FORM: 'form', SECTION: 'region', ARTICLE: 'article', UL: 'list', OL: 'list', LI: 'listitem', IMG: 'img', TABLE: 'table',
  H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading', SELECT: 'combobox', TEXTAREA: 'textbox', DIALOG: 'dialog',
};

export function roleOf(e: Element): string {
  const r = e.getAttribute('role');
  if (r) return r;
  if (e instanceof HTMLInputElement) return ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', search: 'searchbox' } as Record<string, string>)[e.type] ?? 'textbox';
  if (e.tagName === 'A' && !e.hasAttribute('href')) return 'generic';
  return IMPLICIT_ROLES[e.tagName] ?? 'generic';
}
