import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/assets/fx/cracks');

const W = 512;
const H = 992;

const VARIANTS = [
  { name: 'coarse', seed: 0x51a7, primaries: 5, steps: 36, step: 16, width: 3.8, wall: 9, open: 2.8, glow: 1.6, branches: 1, warp: 10 },
  { name: 'medium', seed: 0x2c91, primaries: 8, steps: 52, step: 15, width: 4.4, wall: 11, open: 3.8, glow: 2.2, branches: 2, warp: 5 },
  { name: 'web', seed: 0x9e03, primaries: 11, steps: 38, step: 11, width: 2.4, wall: 6, open: 1.9, glow: 1.2, branches: 2, warp: 8 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  const crcBuf = Buffer.alloc(4 + data.length);
  crcBuf.write(type, 0, 4, 'ascii');
  data.copy(crcBuf, 4);
  out.writeUInt32BE(crc32(crcBuf), 8 + data.length);
  return out;
}

function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    rgb.copy(raw, row + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rimMask(nx, ny) {
  const dx = Math.abs(nx - 0.5) * 2;
  const dy = Math.abs(ny - 0.5) * 2;
  const box = Math.max(dx, dy * 0.92);
  const radial = Math.hypot((nx - 0.5) * 1.05, (ny - 0.5) * 0.72) * 2;
  const edge = Math.max(box, radial);
  return smoothstep(0.22, 0.96, edge);
}

function circumradius(a, b, c) {
  const ab = Math.hypot(a.x - b.x, a.y - b.y);
  const bc = Math.hypot(b.x - c.x, b.y - c.y);
  const ca = Math.hypot(c.x - a.x, c.y - a.y);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
  if (area < 1) return 1e9;
  return (ab * bc * ca) / (4 * area);
}

function placeSites(rand, count, rimBias) {
  const sites = [];
  let guard = 0;
  while (sites.length < count && guard < count * 200) {
    guard++;
    const x = 0.04 + rand() * 0.92;
    const y = 0.04 + rand() * 0.92;
    const rim = rimMask(x, y);
    const keep = rimBias ? lerp(0.04, 1, rim ** 1.15) : lerp(0.7, 0.1, rim);
    if (rand() > keep) continue;
    const px = x * (W - 1);
    const py = y * (H - 1);
    const minD = rimBias ? 40 : 86;
    let ok = true;
    for (const s of sites) {
      if (Math.hypot(px - s.x, py - s.y) < minD) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const next = { x: px, y: py };
    for (let i = 0; i < sites.length && ok; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        if (circumradius(next, sites[i], sites[j]) > 640) {
          ok = false;
          break;
        }
      }
    }
    if (ok) sites.push(next);
  }
  return sites;
}

function hash2(ix, iy) {
  const n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  const t = Math.imul(n ^ n >>> 13, 1274126177);
  return ((t ^ t >>> 16) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function fbm(x, y) {
  return (
    0.57 * valueNoise(x, y)
    + 0.28 * valueNoise(x * 2.03 + 17.1, y * 2.03 + 9.4)
    + 0.15 * valueNoise(x * 4.1 + 4.2, y * 4.1 + 11.7)
  );
}

function warp(x, y, amount, randPhase, detail) {
  const a = randPhase;
  const n1 = fbm(x * 0.0075 + a, y * 0.0075);
  const n2 = fbm(x * 0.0075 + 40.2, y * 0.0075 + a);
  const n3 = fbm(x * 0.018 + a * 3, y * 0.018);
  const n4 = fbm(x * 0.018 + 18, y * 0.018 + a);
  const d = detail ?? 0.08;
  return {
    x: x + amount * (n1 * 2 - 1) + amount * d * (n3 * 2 - 1),
    y: y + amount * (n2 * 2 - 1) + amount * d * (n4 * 2 - 1),
  };
}

function hairline(x, y, rim, cutoff) {
  const n = fbm(x * 0.045, y * 0.038);
  const ridge = 1 - Math.abs(n * 2 - 1);
  const n2 = fbm(x * 0.09 + 8.1, y * 0.08 + 3.3);
  const ridge2 = 1 - Math.abs(n2 * 2 - 1);
  const line = Math.max(
    smoothstep(cutoff, cutoff + 0.12, ridge),
    smoothstep(cutoff + 0.04, cutoff + 0.14, ridge2) * 0.7,
  );
  return line * rim ** 1.15;
}

function nearest3(px, py, sites) {
  let d1 = 1e12, d2 = 1e12, d3 = 1e12;
  for (const s of sites) {
    const d = (px - s.x) ** 2 + (py - s.y) ** 2;
    if (d < d1) {
      d3 = d2;
      d2 = d1;
      d1 = d;
    } else if (d < d2) {
      d3 = d2;
      d2 = d;
    } else if (d < d3) {
      d3 = d;
    }
  }
  return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), d3: Math.sqrt(d3) };
}

function pointOnRim(rand) {
  const t = rand();
  const side = Math.floor(rand() * 4);
  if (side === 0) return { x: t * (W - 1), y: 3, dx: 0, dy: 1 };
  if (side === 1) return { x: t * (W - 1), y: H - 4, dx: 0, dy: -1 };
  if (side === 2) return { x: 3, y: t * (H - 1), dx: 1, dy: 0 };
  return { x: W - 4, y: t * (H - 1), dx: -1, dy: 0 };
}

function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  let t = ((px - ax) * vx + (py - ay) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function growCrack(rand, segs, x, y, dx, dy, steps, stepLen, width, order, branchDepth) {
  const len0 = Math.hypot(dx, dy) || 1;
  dx /= len0;
  dy /= len0;
  for (let i = 0; i < steps; i++) {
    const turn = (fbm(x * 0.006 + 2.4, y * 0.006) - 0.5) * 0.16;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    let ndx = dx * c - dy * s;
    let ndy = dx * s + dy * c;
    const nlen = Math.hypot(ndx, ndy) || 1;
    dx = ndx / nlen;
    dy = ndy / nlen;
    const nx = x + dx * stepLen;
    const ny = y + dy * stepLen;
    if (nx < -20 || nx > W + 20 || ny < -20 || ny > H + 20) break;
    const fade = i / steps;
    const w = width * lerp(1, 0.42, fade);
    const ord = order * lerp(1, 0.58, fade);
    segs.push({ ax: x, ay: y, bx: nx, by: ny, w, order: ord });
    x = nx;
    y = ny;
    if (branchDepth > 0 && i > 6 && i < steps - 10 && rand() < 0.07) {
      const ang = (rand() < 0.5 ? 1 : -1) * lerp(0.85, 1.25, rand());
      const bc = Math.cos(ang);
      const bs = Math.sin(ang);
      growCrack(
        rand, segs, x, y,
        dx * bc - dy * bs, dx * bs + dy * bc,
        Math.floor(steps * lerp(0.22, 0.4, rand())),
        stepLen,
        w * 0.68,
        ord * 0.8,
        branchDepth - 1,
      );
    }
  }
}

function generate(variant) {
  const rand = mulberry32(variant.seed);
  const segs = [];
  const longs = Math.max(5, variant.primaries);
  for (let i = 0; i < longs; i++) {
    const vertical = i < Math.ceil(longs * 0.55);
    if (vertical) {
      const x = lerp(W * 0.12, W * 0.88, (i + 0.35 * rand()) / Math.ceil(longs * 0.55));
      const fromTop = rand() < 0.5;
      growCrack(
        rand, segs, x, fromTop ? 4 : H - 5,
        lerp(-0.12, 0.12, rand()), fromTop ? 1 : -1,
        variant.steps, variant.step, variant.width, 1, variant.branches,
      );
    } else {
      const y = lerp(H * 0.14, H * 0.86, rand());
      const fromLeft = rand() < 0.5;
      growCrack(
        rand, segs, fromLeft ? 4 : W - 5, y,
        fromLeft ? 1 : -1, lerp(-0.1, 0.1, rand()),
        Math.floor(variant.steps * 0.72), variant.step, variant.width * 0.9, 0.92, 1,
      );
    }
  }
  const rgb = Buffer.alloc(W * H * 3);
  const phase = variant.seed * 0.001;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = warp(x, y, variant.warp, phase, 0.12);
      let dist = 1e9;
      let width = variant.width;
      let order = 0.6;
      for (const s of segs) {
        const d = distToSeg(p.x, p.y, s.ax, s.ay, s.bx, s.by);
        if (d < dist) {
          dist = d;
          width = s.w;
          order = s.order;
        }
      }
      const openW = variant.open * lerp(0.75, 1.15, width / variant.width);
      const wallW = variant.wall * lerp(0.8, 1.2, width / variant.width);
      const glowW = variant.glow * lerp(0.7, 1.1, width / variant.width);
      const opening = 1 - smoothstep(0, openW, dist);
      const height = Math.pow(smoothstep(0, wallW, dist), 1.45);
      const g = Math.min(1, opening * Math.max(0.5, order));
      const r = Math.min(1, (1 - smoothstep(0, glowW, dist)) * lerp(0.45, 1, order));
      const i = (y * W + x) * 3;
      rgb[i] = Math.round(r * 255);
      rgb[i + 1] = Math.round(g * 255);
      rgb[i + 2] = Math.round(height * 255);
    }
  }
  return rgb;
}

function sample(rgb, x, y) {
  const i = (y * W + x) * 3;
  return { r: rgb[i] / 255, g: rgb[i + 1] / 255, b: rgb[i + 2] / 255 };
}

function goldPreview(packed, threshold) {
  const out = Buffer.alloc(W * H * 3);
  const paint = [0.62, 0.42, 0.28];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = sample(packed, x, y);
      const crack = smoothstep(threshold - 0.05, threshold + 0.02, p.g);
      const h = lerp(1, p.b, crack);
      const cavity = crack * (1 - h ** 1.35);
      const floor = crack * smoothstep(0.34, 0, h);
      const ao = lerp(1, 0.18 + 0.82 * h ** 1.25, crack);
      const iL = sample(packed, Math.max(0, x - 1), y);
      const iR = sample(packed, Math.min(W - 1, x + 1), y);
      const nx = (lerp(1, iL.b, smoothstep(threshold - 0.05, threshold + 0.02, iL.g))
        - lerp(1, iR.b, smoothstep(threshold - 0.05, threshold + 0.02, iR.g))) * 6.5;
      const ndl = Math.max(0, Math.min(1, (0.55 * 6.5 + 0.85) / Math.hypot(nx, 1) * 0.08 + 0.55));
      const wallR = paint[0] * (0.34 + 0.66 * ndl);
      const colR = lerp(paint[0], wallR, cavity) * ao + p.r * crack * (0.35 + 1.45 * floor);
      const colG = lerp(paint[1], paint[1] * (0.34 + 0.66 * ndl), cavity) * ao + p.r * crack * 0.74 * (0.35 + 1.45 * floor);
      const colB = lerp(paint[2], paint[2] * (0.34 + 0.66 * ndl), cavity) * ao + p.r * crack * 0.26 * (0.35 + 1.45 * floor);
      const i = (y * W + x) * 3;
      out[i] = Math.min(255, Math.round(colR * 255));
      out[i + 1] = Math.min(255, Math.round(colG * 255));
      out[i + 2] = Math.min(255, Math.round(colB * 255));
    }
  }
  return out;
}

function channel(packed, which) {
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = sample(packed, x, y);
      const v = which === 'r' ? p.r : which === 'g' ? p.g : p.b;
      const i = (y * W + x) * 3;
      const c = Math.round(v * 255);
      out[i] = c;
      out[i + 1] = c;
      out[i + 2] = c;
    }
  }
  return out;
}

function blit(dst, dw, src, sw, sh, dx, dy, scale) {
  const tw = Math.round(sw * scale);
  const th = Math.round(sh * scale);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(sh - 1, Math.floor(y / scale));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(sw - 1, Math.floor(x / scale));
      const si = (sy * sw + sx) * 3;
      const di = ((dy + y) * dw + (dx + x)) * 3;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
    }
  }
}

function fill(dst, dw, dh, color) {
  for (let i = 0; i < dw * dh; i++) {
    dst[i * 3] = color[0];
    dst[i * 3 + 1] = color[1];
    dst[i * 3 + 2] = color[2];
  }
}

mkdirSync(OUT, { recursive: true });

const scale = 0.42;
const thumbW = Math.round(W * scale);
const thumbH = Math.round(H * scale);
const cols = 6;
const rows = VARIANTS.length;
const pad = 18;
const sheetW = pad + cols * (thumbW + pad);
const sheetH = pad + rows * (thumbH + pad);
const sheet = Buffer.alloc(sheetW * sheetH * 3);
fill(sheet, sheetW, sheetH, [18, 14, 12]);

VARIANTS.forEach((variant, row) => {
  const packed = generate(variant);
  const packedPath = join(OUT, `portrait-crack-${variant.name}.png`);
  writePNG(packedPath, W, H, packed);
  console.log('wrote', packedPath);

  const images = [
    packed,
    goldPreview(packed, 0.82),
    goldPreview(packed, 0.52),
    goldPreview(packed, 0.16),
    channel(packed, 'g'),
    channel(packed, 'r'),
  ];
  images.forEach((img, col) => {
    blit(sheet, sheetW, img, W, H, pad + col * (thumbW + pad), pad + row * (thumbH + pad), scale);
  });
});

const sheetPath = join(OUT, 'portrait-crack-preview.png');
writePNG(sheetPath, sheetW, sheetH, sheet);
console.log('wrote', sheetPath);
