// Draws the app icon (two rising chevrons on a violet gradient) as PNGs without any image library.
// Usage: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CHEVRONS = [[[0.27, 0.62], [0.5, 0.4], [0.73, 0.62]], [[0.27, 0.8], [0.5, 0.58], [0.73, 0.8]]];
const distSeg = (px, py, [ax, ay], [bx, by]) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay));
};

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size, g = (u + v) / 2;
      let [r, gr, b] = [91 + (139 - 91) * g, 63 + (92 - 63) * g, 212 + (246 - 212) * g];
      const d = Math.min(...CHEVRONS.flatMap(([a, m, c]) => [distSeg(u, v, a, m), distSeg(u, v, m, c)]));
      const ink = Math.max(0, Math.min(1, (0.06 - d) * size)); // anti-aliased stroke
      const spark = Math.max(0, Math.min(1, (0.045 - Math.hypot(u - 0.5, v - 0.22)) * size));
      const w = Math.max(ink, spark * 0.95);
      r += (255 - r) * w; gr += (255 - gr) * w; b += (255 - b) * w;
      raw.set([r, gr, b, 255].map(Math.round), y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = ~0; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dir = new URL('../icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const s of [192, 512]) writeFileSync(new URL(`icon-${s}.png`, dir), png(s));
const path = CHEVRONS.map(([a, m, c]) => `M${a[0] * 100} ${a[1] * 100}L${m[0] * 100} ${m[1] * 100}L${c[0] * 100} ${c[1] * 100}`).join('');
writeFileSync(new URL('icon.svg', dir), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b3fd4"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(#g)"/><path d="${path}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="22" r="4.5" fill="#fff"/></svg>\n`);
console.log('icons written');
