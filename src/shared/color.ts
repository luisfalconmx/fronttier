// Colour parsing and contrast maths (WCAG 2.x ratio and APCA Lc).
export type RGBA = [number, number, number, number];

export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v)));
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3] > 1 ? p[3] / 255 : p[3]];
  }
  m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  return null;
}

export function blend(top: RGBA, bottom: RGBA): RGBA {
  const a = top[3] + bottom[3] * (1 - top[3]);
  if (a === 0) return [0, 0, 0, 0];
  const c = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
  return [c(0), c(1), c(2), a];
}

function channel(v: number) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance([r, g, b]: RGBA | number[]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGBA | number[], b: RGBA | number[]) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** APCA lightness contrast (Lc), text on background. */
export function apca(text: RGBA | number[], bg: RGBA | number[]) {
  const y = ([r, g, b]: number[]) => 0.2126729 * Math.pow(r / 255, 2.4) + 0.7151522 * Math.pow(g / 255, 2.4) + 0.072175 * Math.pow(b / 255, 2.4);
  const clamp = (v: number) => (v < 0.022 ? v + Math.pow(0.022 - v, 1.414) : v);
  const yt = clamp(y(text as number[]));
  const yb = clamp(y(bg as number[]));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const s = (Math.pow(yb, 0.56) - Math.pow(yt, 0.57)) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (Math.pow(yb, 0.65) - Math.pow(yt, 0.62)) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

export function toHex([r, g, b]: RGBA | number[]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl([r, g, b]: number[]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: number[]): RGBA {
  if (s === 0) return [l * 255, l * 255, l * 255, 1];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, 1];
}

/** Closest colour (same hue and saturation) that reaches `target` contrast on `bg`. */
export function suggestColor(fg: RGBA, bg: RGBA, target: number): string | null {
  const [h, s, l] = rgbToHsl(fg);
  const towardsDark = luminance(bg) > 0.18;
  for (let step = 0; step <= 100; step++) {
    const nl = towardsDark ? l - step / 100 : l + step / 100;
    if (nl < 0 || nl > 1) break;
    const c = hslToRgb([h, s, nl]);
    if (contrastRatio(c, bg) >= target) return toHex(c);
  }
  const fallback: RGBA = towardsDark ? [0, 0, 0, 1] : [255, 255, 255, 1];
  return contrastRatio(fallback, bg) >= target ? toHex(fallback) : null;
}
