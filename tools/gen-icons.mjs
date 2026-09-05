/**
 * 程序化生成插件图标（蓝色盾牌 + 白色对勾），输出 PNG 到 public/icons/。
 * 无第三方依赖：手写 PNG 编码（zlib deflate + CRC32）。
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 盾牌绘制（带超采样抗锯齿） ---------- */

/** 盾牌轮廓：u ∈ [-1,1] 横向，v ∈ [0,1] 纵向（0 顶部，1 底部尖端） */
function insideShield(u, v) {
  if (v < 0 || v > 1) return false;
  const HALF = 0.86;
  const R = 0.18; // 顶部圆角半径
  let half;
  if (v <= 0.52) half = HALF;
  else half = HALF * Math.pow(1 - (v - 0.52) / 0.48, 1.12);
  if (Math.abs(u) > half) return false;
  // 顶部圆角
  if (v < R && Math.abs(u) > HALF - R) {
    const dx = Math.abs(u) - (HALF - R);
    const dy = R - v;
    if (dx * dx + dy * dy > R * R) return false;
  }
  return true;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 对勾：两段线 */
function onCheck(u, v) {
  const T = 0.155;
  return (
    distToSegment(u, v, -0.42, 0.46, -0.1, 0.68) < T ||
    distToSegment(u, v, -0.1, 0.68, 0.46, 0.22) < T
  );
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4; // 每像素 4x4 超采样
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cov = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (px + (sx + 0.5) / SS) / size;
          const fy = (py + (sy + 0.5) / SS) / size;
          // 映射到盾牌坐标系（留 4% 边距）
          const u = (fx - 0.5) * 2.09;
          const v = (fy - 0.04) / 0.92;
          if (!insideShield(u, v)) continue;
          cov++;
          if (onCheck(u, v)) {
            r += 255;
            g += 255;
            b += 255;
          } else {
            // 蓝色渐变：#3B82F6 -> #1D4ED8
            r += 59 + (29 - 59) * v;
            g += 130 + (78 - 130) * v;
            b += 246 + (216 - 246) * v;
          }
        }
      }
      const idx = (py * size + px) * 4;
      if (cov > 0) {
        rgba[idx] = Math.round(r / cov);
        rgba[idx + 1] = Math.round(g / cov);
        rgba[idx + 2] = Math.round(b / cov);
        rgba[idx + 3] = Math.round((cov / (SS * SS)) * 255);
      }
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon${size}.png`), renderIcon(size));
  console.log(`generated icon${size}.png`);
}
