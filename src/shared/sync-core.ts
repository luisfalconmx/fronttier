// Interaction mirroring shared by the pane preload and the Portal client.
// Elements are addressed by a structural CSS path so the same element can be
// found in every pane even when layouts differ between breakpoints.
import type { SyncEvent, SyncFlags } from './types';

export const OVERLAY_TAG = 'FRONTTIER-OVERLAY';

export function isOurs(el: Element | null): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) if (n.tagName === OVERLAY_TAG) return true;
  return false;
}

export function selectorFor(el: Element): string {
  if (el === document.documentElement) return 'html';
  const parts: string[] = [];
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n.id && /^[A-Za-z][\w-]*$/.test(n.id) && document.querySelectorAll('#' + n.id).length === 1) {
      parts.unshift('#' + n.id);
      break;
    }
    const tag = n.tagName.toLowerCase();
    const parent: Element | null = n.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const same = Array.from(parent.children).filter((c) => c.tagName === n!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
  }
  return parts.join(' > ');
}

export function find(sel: string | undefined): Element | null {
  if (!sel) return null;
  try {
    return document.querySelector(sel);
  } catch {
    return null;
  }
}

function ratio(pos: number, range: number) {
  return range > 0 ? pos / range : 0;
}

const SYNC_KEYS = new Set(['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' ']);

export interface SyncOptions {
  flags(): SyncFlags;
  send(ev: SyncEvent): void;
  /** Real hover needs trusted input; the pane asks the host to move the mouse there. */
  hoverAt?(x: number, y: number): void;
}

export function createSync(opts: SyncOptions) {
  const quietUntil: Record<string, number> = {};
  const quiet = (t: string, ms: number) => (quietUntil[t] = performance.now() + ms);
  const muted = (t: string) => (quietUntil[t] ?? 0) > performance.now();
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHover = 0;

  const emit = (ev: SyncEvent) => {
    if (!muted(ev.t)) opts.send(ev);
  };

  const onScroll = (e: Event) => {
    if (!opts.flags().scroll || muted('scroll')) return;
    const target = e.target as Element | Document;
    // A timer rather than rAF: rAF stalls while the window is occluded.
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (target === document || target === document.documentElement || target === document.body) {
        const se = document.scrollingElement || document.documentElement;
        emit({ t: 'scroll', x: ratio(se.scrollLeft, se.scrollWidth - se.clientWidth), y: ratio(se.scrollTop, se.scrollHeight - se.clientHeight) });
      } else if (target instanceof Element && !isOurs(target)) {
        emit({
          t: 'scroll',
          sel: selectorFor(target),
          x: ratio(target.scrollLeft, target.scrollWidth - target.clientWidth),
          y: ratio(target.scrollTop, target.scrollHeight - target.clientHeight),
        });
      }
    }, 16);
  };

  const onClick = (e: MouseEvent) => {
    if (!e.isTrusted || !opts.flags().click || muted('click')) return;
    const el = e.target as Element;
    if (!(el instanceof Element) || isOurs(el)) return;
    // Decide after dispatch: an unprevented link click is a real navigation and
    // is mirrored by navigation sync instead, so it is not replayed as a click.
    setTimeout(() => {
      const a = el.closest('a[href]') as HTMLAnchorElement | null;
      if (a && !e.defaultPrevented && !a.getAttribute('href')!.startsWith('javascript:')) return;
      emit({ t: 'click', sel: selectorFor(el) });
    }, 0);
  };

  const onInput = (e: Event) => {
    if (!e.isTrusted || !opts.flags().input || muted('input')) return;
    const el = e.target as HTMLInputElement;
    if (!(el instanceof Element) || isOurs(el)) return;
    const v = el.type === 'checkbox' || el.type === 'radio' ? el.checked : (el as any).isContentEditable ? el.innerHTML : el.value;
    if (el.type === 'password' || el.type === 'file') return;
    emit({ t: 'input', sel: selectorFor(el), v });
  };

  const onFocus = (e: FocusEvent) => {
    if (!e.isTrusted || !opts.flags().input || muted('focus')) return;
    const el = e.target as Element;
    if (el instanceof Element && !isOurs(el)) emit({ t: 'focus', sel: selectorFor(el) });
  };

  const onSubmit = (e: Event) => {
    if (!e.isTrusted || !opts.flags().input || muted('submit')) return;
    emit({ t: 'submit', sel: selectorFor(e.target as Element) });
  };

  const onOver = (e: MouseEvent) => {
    if (!e.isTrusted || !opts.flags().hover || muted('hover')) return;
    const now = performance.now();
    if (now - lastHover < 40) return;
    lastHover = now;
    const el = e.target as Element;
    if (el instanceof Element && !isOurs(el)) emit({ t: 'hover', sel: selectorFor(el) });
  };

  const onKey = (e: KeyboardEvent) => {
    if (!e.isTrusted || !opts.flags().keys || muted('key') || !SYNC_KEYS.has(e.key)) return;
    const a = document.activeElement;
    emit({ t: 'key', key: e.key, code: e.code, sel: a && a !== document.body ? selectorFor(a) : undefined });
  };

  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('click', onClick, true);
  window.addEventListener('input', onInput, true);
  window.addEventListener('change', onInput, true);
  window.addEventListener('focusin', onFocus, true);
  window.addEventListener('submit', onSubmit, true);
  window.addEventListener('mouseover', onOver, { capture: true, passive: true });
  window.addEventListener('keydown', onKey, true);

  function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string | boolean) {
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      if (el.checked !== v) el.click();
      return;
    }
    if ((el as any).isContentEditable) {
      (el as HTMLElement).innerHTML = String(v);
    } else {
      // Use the prototype setter so frameworks that track `value` see a change.
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, String(v));
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function apply(ev: SyncEvent) {
    quiet(ev.t, ev.t === 'scroll' ? 180 : 250);
    switch (ev.t) {
      case 'scroll': {
        const el = ev.sel ? find(ev.sel) : document.scrollingElement || document.documentElement;
        if (!el) return;
        el.scrollTo({ left: ev.x * (el.scrollWidth - el.clientWidth), top: ev.y * (el.scrollHeight - el.clientHeight), behavior: 'instant' as ScrollBehavior });
        return;
      }
      case 'click': {
        const el = find(ev.sel) as HTMLElement | null;
        quiet('focus', 250);
        quiet('input', 250);
        el?.click?.();
        return;
      }
      case 'input': {
        const el = find(ev.sel) as HTMLInputElement | null;
        if (el) setValue(el, ev.v);
        return;
      }
      case 'focus': {
        (find(ev.sel) as HTMLElement | null)?.focus?.({ preventScroll: true });
        return;
      }
      case 'submit': {
        const f = find(ev.sel) as HTMLFormElement | null;
        if (f && typeof f.requestSubmit === 'function') f.requestSubmit();
        return;
      }
      case 'hover': {
        const el = find(ev.sel);
        if (!el || !opts.hoverAt) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
        const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 0), innerHeight - 1);
        quiet('hover', 300);
        opts.hoverAt(x, y);
        return;
      }
      case 'key': {
        const el = (find(ev.sel) as HTMLElement | null) || document.activeElement || document.body;
        for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: ev.key, code: ev.code, bubbles: true, cancelable: true }));
        return;
      }
      case 'nav': {
        if (location.href !== ev.url) location.href = ev.url;
        return;
      }
    }
  }

  return { apply };
}
