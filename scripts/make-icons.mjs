// Generates the app icons as PNGs with no image libraries: shapes are rasterized
// with 4x4 supersampling and written with Node's zlib. Run: npm run icons

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const TEAL = [11, 110, 102];
const TONES = [[241, 199, 168], [201, 141, 100], [141, 90, 59], [79, 50, 38]];
const STITCH = [232, 246, 244];

// ---- PNG encoding ----
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- shapes in a 64x64 design space ----
const inRoundRect = (x, y, rx, ry, w, h, r) => {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/**
 * @param scale   how much of the canvas the logo occupies (maskable icons need padding)
 * @param mono    white silhouette on transparent, for Android's notification badge
 * @param square  full-bleed square background (maskable / Apple icons get masked by the OS)
 */
function render(size, { scale = 1, mono = false, square = false } = {}) {
  const S = 4;
  const out = Buffer.alloc(size * size * 4);
  const off = (64 - 64 / scale) / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = ((px + (sx + 0.5) / S) / size) * 64 / scale + off;
          const y = ((py + (sy + 0.5) / S) / size) * 64 / scale + off;
          const X = ((px + (sx + 0.5) / S) / size) * 64;
          const Y = ((py + (sy + 0.5) / S) / size) * 64;
          let col = null;
          if (mono) {
            const tiles = [[11, 11], [34, 11], [11, 34], [34, 34]];
            if (tiles.some(([tx, ty]) => inRoundRect(X, Y, tx, ty, 19, 19, 5))) col = [255, 255, 255];
          } else {
            if (square || inRoundRect(X, Y, 0, 0, 64, 64, 16)) col = TEAL;
            const tiles = [[11, 11, 0], [34, 11, 1], [11, 34, 2], [34, 34, 3]];
            for (const [tx, ty, i] of tiles) if (inRoundRect(x, y, tx, ty, 19, 19, 5)) col = TONES[i];
            const onStitch = (Math.abs(x - 32) < 0.8 && Math.floor(y / 2.5) % 2 === 0 && y > 8 && y < 56) ||
              (Math.abs(y - 32) < 0.8 && Math.floor(x / 2.5) % 2 === 0 && x > 8 && x < 56);
            if (onStitch && col === TEAL) col = STITCH;
          }
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
        }
      }
      const n = S * S;
      const i = (py * size + px) * 4;
      const cov = a / 255;
      out[i] = cov ? Math.round(r / cov) : 0;
      out[i + 1] = cov ? Math.round(g / cov) : 0;
      out[i + 2] = cov ? Math.round(b / cov) : 0;
      out[i + 3] = Math.round(a / n);
    }
  }
  return png(size, out);
}

mkdirSync("public/icons", { recursive: true });
const jobs = {
  "icon-192.png": render(192),
  "icon-512.png": render(512),
  "maskable-512.png": render(512, { scale: 0.8, square: true }),
  "apple-touch-icon.png": render(180, { square: true }),
  "badge-72.png": render(72, { mono: true }),
};
for (const [name, buf] of Object.entries(jobs)) {
  writeFileSync(`public/icons/${name}`, buf);
  console.log(`public/icons/${name}  ${buf.length} bytes`);
}

writeFileSync("public/icons/favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="16" fill="#0b6e66"/>
<rect x="11" y="11" width="19" height="19" rx="5" fill="#f1c7a8"/>
<rect x="34" y="11" width="19" height="19" rx="5" fill="#c98d64"/>
<rect x="11" y="34" width="19" height="19" rx="5" fill="#8d5a3b"/>
<rect x="34" y="34" width="19" height="19" rx="5" fill="#4f3226"/>
</svg>
`);
console.log("public/icons/favicon.svg");
