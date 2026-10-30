// Draws build/icon.png (1024×1024): build/logo.png inside a rounded square.
// Pure Node (zlib), so no image tooling is needed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
const S = 1024;
const px = Buffer.alloc(S * S * 4);

// Decodes an 8-bit, non-interlaced RGB/RGBA PNG into RGBA pixels.
function readPng(file) {
  const buf = readFileSync(file);
  let w = 0, h = 0, type = 0;
  const idat = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const kind = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      type = data[9];
      if (data[8] !== 8 || data[12] !== 0 || (type !== 2 && type !== 6)) throw new Error('PNG no soportado: usa RGB/RGBA de 8 bits sin entrelazado');
    } else if (kind === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const cur = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = (cur[x] + p) & 255;
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[i] = cur[x * bpp];
      out[i + 1] = cur[x * bpp + 1];
      out[i + 2] = cur[x * bpp + 2];
      out[i + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    cur.copy(prev);
  }
  return { w, h, data: out };
}

// Signed distance to a rounded rectangle; negative inside.
function sdRound(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Bilinear sample of the logo at normalized coordinates (u, v) ∈ [0, 1].
function sample(img, u, v, ch) {
  const fx = Math.min(img.w - 1, Math.max(0, u * img.w - 0.5));
  const fy = Math.min(img.h - 1, Math.max(0, v * img.h - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x, y) => img.data[(y * img.w + x) * 4 + ch];
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}

const logo = readPng(join(BUILD, 'logo.png'));
// macOS icon grid: the tile fills 824 of 1024 px, centered.
const HALF = 412;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = sdRound(x + 0.5, y + 0.5, 512, 512, HALF, HALF, 185);
    const a = Math.min(1, Math.max(0, 0.5 - d));
    if (a <= 0) continue;
    const u = (x + 0.5 - (512 - HALF)) / (2 * HALF);
    const v = (y + 0.5 - (512 - HALF)) / (2 * HALF);
    const i = (y * S + x) * 4;
    px[i] = sample(logo, u, v, 0);
    px[i + 1] = sample(logo, u, v, 1);
    px[i + 2] = sample(logo, u, v, 2);
    px[i + 3] = a * 255;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}

const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);

const out = join(BUILD, 'icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log('Ícono generado en', out);
