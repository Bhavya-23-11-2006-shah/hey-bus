// Generates sticky-days/icons/*.png from code — no dependencies, no binary assets in the repo.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'sticky-days', 'icons');
const S = 4; // supersampling factor

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

function canvas(n) {
  return { n, c: new Float64Array(n * n * 3) };
}

function setPx(cv, x, y, [r, g, b], alpha = 1) {
  if (x < 0 || y < 0 || x >= cv.n || y >= cv.n || alpha <= 0) return;
  const i = (y * cv.n + x) * 3;
  const ia = 1 - alpha;
  cv.c[i] = r * alpha + cv.c[i] * ia;
  cv.c[i + 1] = g * alpha + cv.c[i + 1] * ia;
  cv.c[i + 2] = b * alpha + cv.c[i + 2] * ia;
}

function fillRect(cv, x0, y0, x1, y1, colour, alpha = 1) {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(cv.n, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(cv.n, Math.round(x1)); x++) {
      setPx(cv, x, y, colour, alpha);
    }
  }
}

function fillRoundRect(cv, x0, y0, x1, y1, r, colour) {
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(cv.n, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(cv.n, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const px = x + 0.5, py = y + 0.5;
      const cx = Math.min(Math.max(px, x0 + r), x1 - r);
      const cy = Math.min(Math.max(py, y0 + r), y1 - r);
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy <= r * r) setPx(cv, x, y, colour);
    }
  }
}

function fillCircle(cv, cx, cy, rad, colourFn) {
  const xa = Math.max(0, Math.floor(cx - rad)), xb = Math.min(cv.n, Math.ceil(cx + rad));
  const ya = Math.max(0, Math.floor(cy - rad)), yb = Math.min(cv.n, Math.ceil(cy + rad));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d <= rad) setPx(cv, x, y, colourFn(d / rad));
    }
  }
}

// Bottom-right folded corner of the note.
function fillTriangle(cv, ax, ay, bx, by, cx2, cy2, colour, alpha) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx2)));
  const maxX = Math.min(cv.n, Math.ceil(Math.max(ax, bx, cx2)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy2)));
  const maxY = Math.min(cv.n, Math.ceil(Math.max(ay, by, cy2)));
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d1 = sign(px, py, ax, ay, bx, by);
      const d2 = sign(px, py, bx, by, cx2, cy2);
      const d3 = sign(px, py, cx2, cy2, ax, ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) setPx(cv, x, y, colour, alpha);
    }
  }
}

function renderIcon(size) {
  const n = size * S;
  const cv = canvas(n);
  const U = (v) => v * n; // normalised → device pixels

  fillRect(cv, 0, 0, n, n, hex('#e8edf5'));

  // Note body + darker header strip.
  fillRoundRect(cv, U(0.17), U(0.14), U(0.83), U(0.86), U(0.055), hex('#ffe45e'));
  fillRect(cv, U(0.17), U(0.14), U(0.83), U(0.245), hex('#f2cc2a'));

  // Folded corner.
  fillTriangle(cv, U(0.83), U(0.70), U(0.83), U(0.86), U(0.67), U(0.86), hex('#e0b12a'), 0.55);

  // Written lines.
  const ink = hex('#2a2230');
  fillRoundRect(cv, U(0.27), U(0.40), U(0.73), U(0.436), U(0.018), ink);
  fillRoundRect(cv, U(0.27), U(0.52), U(0.67), U(0.556), U(0.018), ink);
  fillRoundRect(cv, U(0.27), U(0.64), U(0.53), U(0.676), U(0.018), ink);

  // The pin.
  const light = hex('#ff9a9a'), dark = hex('#b3203b');
  fillCircle(cv, U(0.5), U(0.20), U(0.052), (t) => [
    light[0] + (dark[0] - light[0]) * t,
    light[1] + (dark[1] - light[1]) * t,
    light[2] + (dark[2] - light[2]) * t
  ]);

  // Downsample.
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const i = ((y * S + sy) * n + (x * S + sx)) * 3;
          r += cv.c[i]; g += cv.c[i + 1]; b += cv.c[i + 2];
        }
      }
      const k = S * S;
      const o = (y * size + x) * 4;
      rgba[o] = Math.round(r / k);
      rgba[o + 1] = Math.round(g / k);
      rgba[o + 2] = Math.round(b / k);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

// ---- minimal PNG writer ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180]
]) {
  fs.writeFileSync(path.join(outDir, file), png(size, renderIcon(size)));
  console.log('wrote', path.join('sticky-days', 'icons', file));
}
