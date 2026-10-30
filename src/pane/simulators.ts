// Vision and situational simulators that CDP does not provide natively.
// (Protanopia, deuteranopia, tritanopia, achromatopsia, blurred vision and
// reduced contrast are applied by Chromium via Emulation.setEmulatedVisionDeficiency.)
import { isOurs } from '../shared/sync-core';
import { clearLayer, el, layer, pageStyle } from './dom';

const MATRICES: Record<string, string> = {
  protanomaly: '0.817 0.183 0 0 0  0.333 0.667 0 0 0  0 0.125 0.875 0 0  0 0 0 1 0',
  deuteranomaly: '0.8 0.2 0 0 0  0.258 0.742 0 0 0  0 0.142 0.858 0 0  0 0 0 1 0',
  tritanomaly: '0.967 0.033 0 0 0  0 0.733 0.267 0 0  0 0.183 0.817 0 0  0 0 0 1 0',
  achromatomaly: '0.618 0.32 0.062 0 0  0.163 0.775 0.062 0 0  0.163 0.32 0.516 0 0  0 0 0 1 0',
};

let dyslexiaTimer: ReturnType<typeof setInterval> | undefined;
const originals = new Map<Text, string>();

function svgFilter(id: string, inner: string) {
  let svg = document.getElementById('fronttier-svg-filters') as Element | null;
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (svg as SVGSVGElement).style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.id = 'fronttier-svg-filters';
    svg.setAttribute('data-fronttier', '');
    svg.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(svg);
  }
  svg.innerHTML = `<filter id="${id}" color-interpolation-filters="linearRGB">${inner}</filter>`;
}

function shuffleWord(w: string) {
  if (w.length < 4) return w;
  const mid = w.slice(1, -1).split('');
  for (let i = mid.length - 1; i > 0; i--) {
    if (Math.random() < 0.5) continue;
    const j = Math.floor(Math.random() * (i + 1));
    [mid[i], mid[j]] = [mid[j], mid[i]];
  }
  return w[0] + mid.join('') + w[w.length - 1];
}

function dyslexia(on: boolean) {
  clearInterval(dyslexiaTimer);
  for (const [node, text] of originals) node.textContent = text;
  originals.clear();
  if (!on) return;
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n && nodes.length < 3000; n = walker.nextNode() as Text | null) {
    const p = n.parentElement;
    if (p && !isOurs(p) && !/^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/.test(p.tagName) && n.textContent!.trim()) nodes.push(n);
  }
  for (const n of nodes) originals.set(n, n.textContent!);
  dyslexiaTimer = setInterval(() => {
    for (const [n, text] of originals) if (Math.random() < 0.3) n.textContent = text.replace(/\p{L}+/gu, (w) => (Math.random() < 0.4 ? shuffleWord(w) : w));
  }, 600);
}

export function applySimulator(name: string) {
  pageStyle('sim', null);
  clearLayer('sim');
  document.getElementById('fronttier-svg-filters')?.remove();
  dyslexia(false);
  if (!name) return;
  const body = (filter: string) => pageStyle('sim', `body{filter:${filter}!important}`);
  switch (name) {
    case 'protanomaly':
    case 'deuteranomaly':
    case 'tritanomaly':
    case 'achromatomaly':
      svgFilter('fronttier-sim', `<feColorMatrix type="matrix" values="${MATRICES[name]}"/>`);
      body('url(#fronttier-sim)');
      break;
    case 'cataracts':
      body('blur(2.2px) sepia(.35) brightness(1.08) contrast(.75)');
      layer('sim').appendChild(el('div', 'veil', { background: 'radial-gradient(circle at 50% 45%, rgba(255,250,235,.15), rgba(255,250,235,.45))' }));
      break;
    case 'glaucoma':
      layer('sim').appendChild(el('div', 'veil', { background: 'radial-gradient(ellipse at center, transparent 0%, transparent 28%, rgba(0,0,0,.7) 52%, rgba(0,0,0,.97) 75%)' }));
      break;
    case 'tunnel':
      layer('sim').appendChild(el('div', 'veil', { background: 'radial-gradient(circle at center, transparent 0, transparent 18vmin, #000 34vmin)' }));
      break;
    case 'macular': {
      const spot = el('div', 'veil', { background: 'radial-gradient(circle at center, rgba(40,40,40,.92) 0, rgba(60,60,60,.75) 10vmin, rgba(80,80,80,.3) 22vmin, transparent 32vmin)' });
      (spot.style as any).backdropFilter = 'blur(3px)';
      layer('sim').appendChild(spot);
      break;
    }
    case 'astigmatism':
      svgFilter('fronttier-sim', '<feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="b"/><feOffset in="b" dx="3" dy="2" result="o"/><feComponentTransfer in="o" result="f"><feFuncA type="linear" slope="0.5"/></feComponentTransfer><feMerge><feMergeNode in="b"/><feMergeNode in="f"/></feMerge>');
      body('url(#fronttier-sim)');
      break;
    case 'dyslexia':
      dyslexia(true);
      break;
    case 'dim':
      body('brightness(.45)');
      break;
    case 'sunlight':
      body('brightness(1.5) contrast(.5) saturate(.55)');
      layer('sim').appendChild(el('div', 'veil', { background: 'linear-gradient(135deg, rgba(255,255,255,.55), rgba(255,255,255,.15) 60%, rgba(255,255,255,.4))' }));
      break;
    case 'night':
      body('sepia(.55) hue-rotate(-15deg) brightness(.8)');
      break;
    case 'tremor':
      // Motor: jittery pointer is not possible to simulate faithfully; show enlarged hit targets instead.
      pageStyle('sim', 'a,button,input,select,textarea,[role=button],[tabindex]{outline:3px dashed #f59e0b!important;outline-offset:2px!important}');
      break;
  }
}
