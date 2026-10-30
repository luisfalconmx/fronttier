// Draws build/icon.png (1024×1024): four tiles on a violet rounded square.
// Pure Node (zlib), so no image tooling is needed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 1024;
const px = Buffer.alloc(S * S * 4);

// Signed distance to a rounded rectangle; negative inside.
function sdRound(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function over(i, r, g, b, a) {
  const da = px[i + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa === 0) return;
  px[i] = (r * a + px[i] * da * (1 - a)) / oa;
  px[i + 1] = (g * a + px[i + 1] * da * (1 - a)) / oa;
  px[i + 2] = (b * a + px[i + 2] * da * (1 - a)) / oa;
  px[i + 3] = oa * 255;
}

const tiles = [
  [384, 384, 1.0],
  [640, 384, 0.72],
  [384, 640, 0.5],
  [640, 640, 0.86],
];

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const d = sdRound(x + 0.5, y + 0.5, 512, 512, 432, 432, 190);
    const a = Math.min(1, Math.max(0, 0.5 - d));
    if (a > 0) {
      const t = (x + y) / (2 * S);
      over(i, 109 + (139 - 109) * t, 40 + (92 - 40) * t, 217 + (246 - 217) * t, a);
    }
    for (const [cx, cy, alpha] of tiles) {
      const td = sdRound(x + 0.5, y + 0.5, cx, cy, 112, 112, 34);
      const ta = Math.min(1, Math.max(0, 0.5 - td));
      if (ta > 0) over(i, 255, 255, 255, ta * alpha);
    }
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

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log('Ícono generado en', out);
