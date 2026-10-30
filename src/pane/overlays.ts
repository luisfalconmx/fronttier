// Debug overlays: layout outlines, overflow, rulers, focus order, contrast
// badges, grid, reference image, alt text and content toggles.
import type { GridOverlay, PaneToolsState } from '../shared/types';
import { isOurs, selectorFor } from '../shared/sync-core';
import { clearLayer, debounce, docRect, el, isVisible, layer, pageStyle } from './dom';
import { contrastAudit } from './tools';

export interface OverflowReport {
  overflow: boolean;
  amount: number;
  offenders: string[];
}

/** Elements that stick out past the right edge of the viewport. */
export function overflowCheck(mark: boolean): OverflowReport {
  const docEl = document.documentElement;
  const vw = docEl.clientWidth;
  const amount = Math.max(0, (document.scrollingElement || docEl).scrollWidth - vw);
  document.querySelectorAll('[data-fronttier-overflow]').forEach((e) => e.removeAttribute('data-fronttier-overflow'));
  const offenders: string[] = [];
  if (amount > 0) {
    for (const e of Array.from(document.body?.querySelectorAll('*') ?? [])) {
      if (isOurs(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || (r.right <= vw + 1 && r.left >= -1)) continue;
      // Skip elements clipped by a scrolling/hidden ancestor.
      let clipped = false;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible') {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      // Report the outermost offender only.
      if (e.parentElement?.hasAttribute('data-fronttier-overflow')) continue;
      if (mark) e.setAttribute('data-fronttier-overflow', '');
      offenders.push(selectorFor(e));
      if (offenders.length >= 50) break;
    }
  }
  return { overflow: amount > 0, amount, offenders };
}

function drawRulers(on: boolean) {
  clearLayer('rulers');
  window.removeEventListener('mousemove', rulerMove, true);
  if (!on) return;
  const l = layer('rulers');
  l.append(el('div', 'ruler-x'), el('div', 'ruler-y'));
  for (let x = 100; x < innerWidth; x += 100) l.append(el('span', 'ruler-label', { left: x + 2 + 'px', top: '2px' }, String(x)));
  for (let y = 100; y < innerHeight; y += 100) l.append(el('span', 'ruler-label', { top: y + 2 + 'px', left: '2px' }, String(y)));
  l.append(el('div', 'cursor-x'), el('div', 'cursor-y'), el('div', 'pos'));
  window.addEventListener('mousemove', rulerMove, true);
}

function rulerMove(e: MouseEvent) {
  const l = layer('rulers');
  const cx = l.querySelector<HTMLElement>('.cursor-x');
  const cy = l.querySelector<HTMLElement>('.cursor-y');
  const pos = l.querySelector<HTMLElement>('.pos');
  if (!cx || !cy || !pos) return;
  cx.style.left = e.clientX + 'px';
  cy.style.top = e.clientY + 'px';
  pos.style.left = e.clientX + 6 + 'px';
  pos.style.top = e.clientY + 6 + 'px';
  pos.textContent = `${e.clientX}, ${e.clientY + Math.round(scrollY)}`;
}

const TABBABLE = 'a[href], area[href], button, input:not([type=hidden]), select, textarea, iframe, summary, [tabindex], [contenteditable=""], [contenteditable=true], audio[controls], video[controls]';

export function tabOrder(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (e) => !isOurs(e) && e.tabIndex >= 0 && !(e as HTMLButtonElement).disabled && !e.closest('[inert]') && isVisible(e),
  );
  const positive = all.filter((e) => e.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return [...positive, ...all.filter((e) => e.tabIndex === 0)];
}

function drawFocusOrder() {
  clearLayer('focus');
  const l = layer('focus', 'doc');
  const items = tabOrder();
  const pts = items.map((e) => docRect(e));
  const w = document.documentElement.scrollWidth;
  const h = document.documentElement.scrollHeight;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible';
  const line = document.createElementNS(svgNS, 'polyline');
  line.setAttribute('points', pts.map((p) => `${p.x + 10},${p.y + 10}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#e7000b');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '6 4');
  svg.appendChild(line);
  l.appendChild(svg);
  pts.forEach((p, i) => {
    const b = el('div', 'badge' + (items[i].tabIndex > 0 ? ' warn' : ''), { left: p.x + 'px', top: p.y + 'px' }, String(i + 1));
    l.appendChild(b);
    const o = el('div', 'hl', { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', borderColor: 'rgba(109,40,217,.6)', background: 'transparent', borderStyle: 'dashed' });
    l.appendChild(o);
  });
}

function drawContrastBadges() {
  clearLayer('contrast');
  const l = layer('contrast', 'doc');
  for (const item of contrastAudit().items) {
    if (item.aa) continue;
    const e = document.querySelector(item.sel);
    if (!e) continue;
    const r = docRect(e);
    l.appendChild(el('div', 'badge fail', { left: r.x + 'px', top: Math.max(0, r.y - 16) + 'px' }, `${item.ratio.toFixed(2)}:1 ✕ AA`));
  }
}

function drawAlt() {
  clearLayer('alt');
  const l = layer('alt', 'doc');
  for (const img of Array.from(document.images)) {
    if (!isVisible(img)) continue;
    const r = docRect(img);
    const alt = img.getAttribute('alt');
    const cls = alt === null ? 'badge fail' : alt === '' ? 'badge warn' : 'badge alt';
    l.appendChild(el('div', cls, { left: r.x + 4 + 'px', top: r.y + 4 + 'px' }, alt === null ? 'Sin alt' : alt === '' ? 'alt="" (decorativa)' : alt));
  }
}

function drawGrid(g: GridOverlay | null) {
  clearLayer('grid');
  if (!g) return;
  const l = layer('grid');
  const wrap = el('div', 'grid', { gap: g.gutter + 'px', padding: `0 ${g.margin}px`, maxWidth: g.maxWidth ? g.maxWidth + 'px' : 'none' });
  for (let i = 0; i < Math.max(1, Math.min(48, g.columns)); i++) wrap.appendChild(document.createElement('div'));
  l.appendChild(wrap);
}

function drawReference(ref: PaneToolsState['reference']) {
  clearLayer('reference');
  if (!ref) return;
  const l = layer('reference', 'doc');
  const img = document.createElement('img');
  img.src = ref.src;
  img.style.cssText = `position:absolute;top:0;left:0;width:${document.documentElement.clientWidth}px;opacity:${ref.opacity};mix-blend-mode:${ref.difference ? 'difference' : 'normal'}`;
  l.appendChild(img);
}

let applied: PaneToolsState | null = null;
let observer: MutationObserver | null = null;
let onOverflow: (r: OverflowReport) => void = () => {};

const redraw = debounce(() => {
  if (!applied) return;
  if (applied.focusOrder) drawFocusOrder();
  if (applied.contrastBadges) drawContrastBadges();
  if (applied.showAlt) drawAlt();
  if (applied.rulers) drawRulers(true);
  onOverflow(overflowCheck(applied.overflow));
}, 400);

export function watchOverflow(cb: (r: OverflowReport) => void) {
  onOverflow = cb;
}

export function applyTools(t: PaneToolsState) {
  const prev = applied;
  applied = t;
  pageStyle(
    'layout',
    t.layoutDebug
      ? `*:not(fronttier-overlay){outline:1px solid rgba(236,72,153,.55)!important;outline-offset:-1px!important}
         * *{outline-color:rgba(59,130,246,.55)!important} * * *{outline-color:rgba(16,185,129,.55)!important}
         * * * *{outline-color:rgba(245,158,11,.6)!important} * * * * *{outline-color:rgba(139,92,246,.6)!important}`
      : null,
  );
  pageStyle('overflow', t.overflow ? `[data-fronttier-overflow]{outline:2px solid #ef4444!important;outline-offset:-2px!important;background-color:rgba(239,68,68,.12)!important}` : null);
  pageStyle('noimg', t.disableImages ? `img,picture,video,canvas,svg image{visibility:hidden!important}*{background-image:none!important}` : null);
  if (!prev || prev.disableCSS !== t.disableCSS) {
    for (const s of Array.from(document.styleSheets)) {
      const owner = s.ownerNode as Element | null;
      if (owner?.hasAttribute?.('data-fronttier')) continue;
      s.disabled = t.disableCSS;
    }
  }
  if (!t.focusOrder) clearLayer('focus');
  if (!t.contrastBadges) clearLayer('contrast');
  if (!t.showAlt) clearLayer('alt');
  if (!t.rulers) drawRulers(false);
  if (JSON.stringify(prev?.grid) !== JSON.stringify(t.grid)) drawGrid(t.grid);
  if (JSON.stringify(prev?.reference) !== JSON.stringify(t.reference)) drawReference(t.reference);

  if (!observer && document.body) {
    observer = new MutationObserver((muts) => {
      if (muts.every((m) => isOurs(m.target as Element) || (m.target as Element)?.id?.startsWith?.('fronttier-style'))) return;
      redraw();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    window.addEventListener('resize', redraw);
    window.addEventListener('load', redraw);
  }
  redraw();
}
