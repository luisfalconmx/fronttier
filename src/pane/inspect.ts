// Quick inspect: hold Alt/Option over any element to see its box model,
// typography, colours, contrast and accessibility info.
import { blend, contrastRatio, parseColor, toHex } from '../shared/color';
import { isOurs } from '../shared/sync-core';
import { accessibleName, clearLayer, el, layer, roleOf } from './dom';

let active = false;
let lastTarget: Element | null = null;

function px(v: string) {
  return parseFloat(v) || 0;
}

function bgOf(e: Element) {
  let c: [number, number, number, number] = [0, 0, 0, 0];
  for (let n: Element | null = e; n; n = n.parentElement) {
    const bg = parseColor(getComputedStyle(n).backgroundColor);
    if (bg && bg[3] > 0) {
      c = blend(c, bg);
      if (c[3] >= 0.99) return c;
    }
  }
  return blend(c, [255, 255, 255, 1]);
}

function draw(target: Element) {
  const l = layer('inspect');
  l.innerHTML = '';
  const r = target.getBoundingClientRect();
  const cs = getComputedStyle(target);
  const m = { t: px(cs.marginTop), r: px(cs.marginRight), b: px(cs.marginBottom), l: px(cs.marginLeft) };
  const p = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  const bw = { t: px(cs.borderTopWidth), r: px(cs.borderRightWidth), b: px(cs.borderBottomWidth), l: px(cs.borderLeftWidth) };
  const box = (x: number, y: number, w: number, h: number, color: string) => l.appendChild(el('div', 'box', { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px', background: color }));
  box(r.left - m.l, r.top - m.t, r.width + m.l + m.r, r.height + m.t + m.b, 'rgba(249,115,22,.28)');
  box(r.left, r.top, r.width, r.height, 'rgba(250,204,21,.25)');
  box(r.left + bw.l, r.top + bw.t, r.width - bw.l - bw.r, r.height - bw.t - bw.b, 'rgba(34,197,94,.3)');
  box(r.left + bw.l + p.l, r.top + bw.t + p.t, r.width - bw.l - bw.r - p.l - p.r, r.height - bw.t - bw.b - p.t - p.b, 'rgba(59,130,246,.35)');

  const fg = parseColor(cs.color) ?? [0, 0, 0, 1];
  const bg = bgOf(target);
  const ratio = contrastRatio(blend(fg, bg), bg);
  const size = px(cs.fontSize);
  const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
  const grade = ratio >= (large ? 4.5 : 7) ? 'AAA' : ratio >= (large ? 3 : 4.5) ? 'AA' : 'Falla';
  const cls = typeof target.className === 'string' && target.className.trim() ? '.' + target.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
  const card = el('div', 'card');
  const name = accessibleName(target);
  const rows: [string, string][] = [
    ['Tamaño', `${Math.round(r.width * 10) / 10} × ${Math.round(r.height * 10) / 10}`],
    ['Fuente', `${cs.fontFamily.split(',')[0].replace(/["']/g, '')} ${cs.fontWeight}`],
    ['Tamaño/interlineado', `${cs.fontSize} / ${cs.lineHeight}`],
    ['Margen', `${m.t} ${m.r} ${m.b} ${m.l}`],
    ['Padding', `${p.t} ${p.r} ${p.b} ${p.l}`],
    ['Display', cs.display + (cs.position !== 'static' ? ' · ' + cs.position : '')],
    ['Rol', roleOf(target)],
  ];
  card.innerHTML = `<div><span class="tag">${target.tagName.toLowerCase()}</span>${target.id ? '<b>#' + target.id + '</b>' : ''}<span class="muted">${cls}</span></div>`;
  for (const [k, v] of rows) card.appendChild(rowEl(k, v));
  const colors = el('div', 'row');
  colors.innerHTML = `<span><span class="sw" style="background:${toHex(fg)}"></span>${toHex(fg)}</span><span><span class="sw" style="background:${toHex(bg)}"></span>${toHex(bg)}</span><b>${ratio.toFixed(2)}:1 ${grade}</b>`;
  card.appendChild(colors);
  if (name) card.appendChild(rowEl('Nombre accesible', name.slice(0, 80)));
  l.appendChild(card);
  const cw = 340;
  const below = r.bottom + 8 + 220 < innerHeight;
  card.style.left = Math.max(4, Math.min(r.left, innerWidth - cw - 4)) + 'px';
  card.style.top = (below ? r.bottom + 8 : Math.max(4, r.top - 230)) + 'px';
}

function rowEl(k: string, v: string) {
  const row = el('div', 'row');
  row.appendChild(el('span', 'muted', {}, k));
  row.appendChild(el('span', '', {}, v));
  return row;
}

function onMove(e: MouseEvent) {
  if (!active) return;
  const t = document.elementFromPoint(e.clientX, e.clientY);
  if (!t || isOurs(t) || t === lastTarget) return;
  lastTarget = t;
  draw(t);
}

function stop() {
  active = false;
  lastTarget = null;
  clearLayer('inspect');
}

export function installInspector() {
  let pointer = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    onMove(e);
  }, { capture: true, passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Alt' || e.ctrlKey || e.metaKey || e.shiftKey || active) return;
    active = true;
    const t = document.elementFromPoint(pointer.x, pointer.y);
    if (t && !isOurs(t)) draw((lastTarget = t));
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') stop();
  }, true);
  window.addEventListener('blur', stop);
  window.addEventListener('scroll', () => active && lastTarget && draw(lastTarget), { capture: true, passive: true });
}
