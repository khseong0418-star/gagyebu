// 외부 라이브러리 없이 앱 아이콘(PNG)을 생성합니다.  실행: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'docs', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- 최소 PNG 인코더 ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 도형 ----
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function inRR(x, y, [x0, y0, x1, y1, r]) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r;
}
const inC = (x, y, [cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// 512px 기준 좌표. 지갑 모양 (maskable 안전영역: 중심 반경 205px 이내)
const BG = rgb('#5a48d4');
const LAYERS = [
  { t: 'rr', g: [150, 128, 330, 214, 22], c: rgb('#c9c2ff') }, // 꽂혀 있는 카드
  { t: 'rr', g: [128, 172, 384, 356, 34], c: rgb('#ffffff') }, // 지갑 몸통
  { t: 'rr', g: [292, 228, 404, 300, 22], c: rgb('#3d2fa6') }, // 잠금 탭
  { t: 'c', g: [330, 264, 12], c: rgb('#ffffff') }, // 버튼
];

function draw(size, maskable) {
  const SS = 4; // 4x4 슈퍼샘플링
  const k = 512 / size;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * k;
          const y = (py + (sy + 0.5) / SS) * k;
          let col = maskable || inRR(x, y, [0, 0, 512, 512, 112]) ? BG : null;
          if (!col) continue;
          for (const L of LAYERS) if (L.t === 'rr' ? inRR(x, y, L.g) : inC(x, y, L.g)) col = L.c;
          r += col[0]; g += col[1]; b += col[2]; a++;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        buf[i] = Math.round(r / a);
        buf[i + 1] = Math.round(g / a);
        buf[i + 2] = Math.round(b / a);
        buf[i + 3] = Math.round((255 * a) / (SS * SS));
      }
    }
  }
  return png(size, size, buf);
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-192.png', 192, true],
  ['maskable-512.png', 512, true],
]) {
  fs.writeFileSync(path.join(OUT, name), draw(size, maskable));
  console.log('wrote', name);
}
