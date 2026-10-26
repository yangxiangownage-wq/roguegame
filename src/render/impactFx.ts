export type ImpactBurst = {
  x: number;
  y: number;
  dir: number;
  damage: number;
  age: number;
  shards: Shard[];
  sparks: Spark[];
  dust: Dust[];
  smoke: Dust[];
  decal: { angle: number; scale: number; alpha: number };
};

type Shard = {
  cell: number;
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number; delay: number; life: number; max: number;
};
type Spark = {
  x: number; y: number; vx: number; vy: number;
  len: number; width: number; delay: number; life: number; max: number;
};
type Dust = {
  x: number; y: number; vx: number; vy: number;
  rot: number; size: number; grow: number; delay: number;
  life: number; max: number;
};

type SpriteCell = { sx: number; sy: number; sw: number; sh: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const ring = (i: number, n: number, jitter: number) =>
  ((i + 0.5) / n) * Math.PI * 2 + (Math.random() - 0.5) * jitter;
const mixSize = (min: number, max: number) => min + Math.random() * (max - min);
const punchEase = (t: number) => {
  if (t < 0.05) return 2.4;
  if (t < 0.14) {
    const u = (t - 0.05) / 0.09;
    const brake = u * u * (3 - 2 * u);
    return 2.4 * (1 - brake) + 0.3 * brake;
  }
  return 0.3 * Math.exp(-3.2 * (t - 0.14));
};
const sparkEase = (t: number) => (t < 0.04 ? 1.8 : 1.8 * Math.exp(-10 * (t - 0.04)));

export function spawnImpact(x: number, y: number, dir: number, damage: number, cellCount: number): ImpactBurst {
  const weight = Math.min(10, Math.max(1, damage));
  const shards: Shard[] = [];
  const sparks: Spark[] = [];
  const dust: Dust[] = [];
  const smoke: Dust[] = [];
  const nShard = 10 + Math.round(weight * 0.8);
  const nSpark = 12 + Math.round(weight);
  const nDust = 6 + Math.round(weight * 0.4);
  const nSmoke = 7 + Math.round(weight * 0.4);
  for (let i = 0; i < nShard; i++) {
    const angle = ring(i, nShard, 0.35);
    const speed = 560 + Math.random() * (320 + weight * 24);
    shards.push({
      cell: cellCount > 0 ? Math.floor(Math.random() * cellCount) : 0,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: angle + Math.random() * 0.8,
      vr: (Math.random() - 0.5) * 10,
      size: mixSize(12, 28),
      delay: Math.random() * 0.018,
      life: 0,
      max: 0.5 + Math.random() * 0.22,
    });
  }
  for (let i = 0; i < nSpark; i++) {
    const angle = ring(i, nSpark, 0.28);
    const speed = 640 + Math.random() * 380;
    sparks.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: mixSize(8, 44),
      width: mixSize(0.7, 4.2),
      delay: Math.random() * 0.016,
      life: 0,
      max: 0.08 + Math.random() * 0.06,
    });
  }
  for (let i = 0; i < nDust; i++) {
    const angle = ring(i, nDust, 0.5);
    const speed = 36 + Math.random() * 54;
    dust.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      size: mixSize(28, 52),
      grow: 50 + Math.random() * 30,
      delay: 0.1 + Math.random() * 0.05,
      life: 0,
      max: 0.45 + Math.random() * 0.2,
    });
  }
  for (let i = 0; i < nSmoke; i++) {
    const angle = ring(i, nSmoke, 0.8);
    const speed = 12 + Math.random() * 22;
    smoke.push({
      x: x + (Math.random() - 0.5) * 28,
      y: y + (Math.random() - 0.5) * 18,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.35 - (28 + Math.random() * 24),
      rot: (Math.random() - 0.5) * 0.5,
      size: mixSize(34, 58),
      grow: 55 + Math.random() * 35,
      delay: 0.05 + Math.random() * 0.07,
      life: 0,
      max: 0.42 + Math.random() * 0.18,
    });
  }
  return {
    x, y, dir, damage: weight, age: 0, shards, sparks, dust, smoke,
    decal: { angle: (Math.random() - 0.5) * 0.5, scale: 0.7 + weight * 0.06, alpha: 0.55 + weight * 0.03 },
  };
}

export function updateImpact(burst: ImpactBurst, dt: number): boolean {
  burst.age += dt;
  for (const p of burst.shards) {
    if (burst.age < p.delay) continue;
    p.life += dt;
    const k = punchEase(p.life);
    p.x += p.vx * k * dt;
    p.y += p.vy * k * dt + 180 * Math.max(0, p.life - 0.2) * dt;
    p.rot += p.vr * k * dt;
  }
  for (const p of burst.sparks) {
    if (burst.age < p.delay) continue;
    p.life += dt;
    const k = sparkEase(p.life);
    p.x += p.vx * k * dt;
    p.y += p.vy * k * dt;
  }
  for (const p of burst.dust) {
    if (burst.age < p.delay) continue;
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 18 * dt;
    p.vx *= Math.exp(-2.2 * dt);
    p.size += p.grow * dt;
  }
  for (const p of burst.smoke) {
    if (burst.age < p.delay) continue;
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 22 * dt;
    p.vx *= Math.exp(-1.6 * dt);
    p.size += p.grow * dt;
  }
  return burst.age < 1.4;
}

export function sliceSheet(img: HTMLImageElement, cols: number, rows: number): SpriteCell[] {
  const cw = img.naturalWidth / cols;
  const ch = img.naturalHeight / rows;
  const cells: SpriteCell[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return cells;
  g.drawImage(img, 0, 0);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = Math.floor(col * cw);
      const oy = Math.floor(row * ch);
      const w = Math.floor(cw);
      const h = Math.floor(ch);
      const data = g.getImageData(ox, oy, w, h).data;
      let minX = w, minY = h, maxX = 0, maxY = 0, hits = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] < 24) continue;
          hits++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (hits < 40 || maxX - minX < 8 || maxY - minY < 8) continue;
      const pad = 2;
      cells.push({
        sx: ox + Math.max(0, minX - pad),
        sy: oy + Math.max(0, minY - pad),
        sw: Math.min(w, maxX - minX + 1 + pad * 2),
        sh: Math.min(h, maxY - minY + 1 + pad * 2),
      });
    }
  }
  return cells;
}

export function drawImpactBurst(
  g: CanvasRenderingContext2D,
  burst: ImpactBurst,
  sprites: { shards?: HTMLImageElement; dust?: HTMLImageElement; crack?: HTMLImageElement; star?: HTMLImageElement },
  cells: SpriteCell[],
): void {
  const { x, y, age, damage } = burst;
  drawShockwave(g, x, y, Math.max(0, age - 0.02), damage);
  drawDust(g, burst, sprites.dust);
  drawSmoke(g, burst);
  drawStar(g, x, y, age, damage, sprites.star);
  drawShards(g, burst, sprites.shards, cells);
  drawSparks(g, burst);
}

export function drawDecal(
  g: CanvasRenderingContext2D,
  burst: ImpactBurst,
  crack: HTMLImageElement | undefined,
  pose: { x: number; y: number; angle: number; sx: number; sy: number },
): void {
  if (!crack?.naturalWidth) return;
  const fade = clamp01(1 - (burst.age - 0.18) / 0.4);
  if (fade <= 0.02) return;
  g.save();
  g.translate(pose.x, pose.y);
  g.rotate(pose.angle);
  g.scale(pose.sx, pose.sy);
  g.translate(burst.x - pose.x, burst.y - pose.y);
  g.rotate(burst.decal.angle);
  g.globalAlpha = burst.decal.alpha * fade;
  g.globalCompositeOperation = 'multiply';
  const size = 90 * burst.decal.scale;
  g.drawImage(crack, -size / 2, -size / 2, size, size);
  g.restore();
}

function starEnvelope(age: number): { scale: number; alpha: number; stretch: number; spin: number } | null {
  if (age < 0) return null;
  if (age < 0.045) {
    const u = age / 0.045;
    const e = u * u * (3 - 2 * u);
    return { scale: 0.2 + 1.1 * e, alpha: Math.min(1, u * 1.5), stretch: 0.5 + 0.85 * e, spin: u };
  }
  if (age < 0.11) {
    const u = (age - 0.045) / 0.065;
    return { scale: 1.3 - 0.18 * u, alpha: 1, stretch: 1.35 - 0.4 * u, spin: 1 + u };
  }
  const u = clamp01((age - 0.11) / 0.13);
  if (u >= 1) return null;
  return { scale: 1.12 + 0.28 * u, alpha: 1 - u * u, stretch: 0.95 + 0.55 * u, spin: 2 + u };
}

function drawStar(
  g: CanvasRenderingContext2D,
  x: number, y: number, age: number, damage: number,
  img: HTMLImageElement | undefined,
): void {
  const env = starEnvelope(age);
  if (!env) return;
  const size = (200 + damage * 6) * env.scale;
  const flicker = 1 + 0.07 * Math.sin(age * 72);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.rotate(env.spin * 0.85);
  g.scale(env.stretch * flicker, (2 - env.stretch) * flicker);
  g.globalAlpha = env.alpha;
  if (img?.naturalWidth) {
    g.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.22);
    glow.addColorStop(0, '#fffef8');
    glow.addColorStop(0.22, '#ead9b0');
    glow.addColorStop(1, 'rgba(196, 166, 107, 0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.rotate(Math.PI / 4 - env.spin * 1.35);
  g.globalAlpha = env.alpha * 0.42;
  const small = size * 0.58;
  if (img?.naturalWidth) {
    g.drawImage(img, -small / 2, -small / 2, small, small);
  }
  g.restore();
}

function drawShockwave(g: CanvasRenderingContext2D, x: number, y: number, age: number, damage: number): void {
  const t = age / 0.16;
  if (t >= 1) return;
  const r = 12 + t * (88 + damage * 5);
  g.save();
  g.globalAlpha = (1 - t) * (1 - t) * 0.85;
  g.strokeStyle = '#f3dd9a';
  g.lineWidth = Math.max(1.2, 5.5 * (1 - t));
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  if (damage >= 6 && t < 0.85) {
    g.globalAlpha *= 0.55;
    g.beginPath();
    g.arc(x, y, r * 0.62, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

function particleLife(p: { life: number; max: number }): number | null {
  if (p.life <= 0) return null;
  const u = clamp01(p.life / p.max);
  return u >= 1 ? null : u;
}

function drawSparks(g: CanvasRenderingContext2D, burst: ImpactBurst): void {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = '#fff3c0';
  g.lineCap = 'round';
  for (const p of burst.sparks) {
    const u = particleLife(p);
    if (u === null) continue;
    const speed = Math.hypot(p.vx, p.vy) || 1;
    g.globalAlpha = (1 - u) * (1 - u);
    g.lineWidth = p.width * (1 - u * 0.5);
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x - (p.vx / speed) * p.len * (1 - u * 0.3), p.y - (p.vy / speed) * p.len * (1 - u * 0.3));
    g.stroke();
  }
  g.restore();
}

function drawShards(
  g: CanvasRenderingContext2D,
  burst: ImpactBurst,
  img: HTMLImageElement | undefined,
  cells: SpriteCell[],
): void {
  for (const p of burst.shards) {
    const u = particleLife(p);
    if (u === null) continue;
    g.save();
    g.globalAlpha = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    const s = p.size;
    if (img?.naturalWidth && cells.length) {
      const cell = cells[p.cell % cells.length]!;
      g.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh, -s / 2, -s / 2, s, s);
    } else {
      g.fillStyle = u < 0.5 ? '#e0c48a' : '#6a4a28';
      g.fillRect(-s * 0.35, -s * 0.22, s * 0.7, s * 0.44);
    }
    g.restore();
  }
}

function drawDust(g: CanvasRenderingContext2D, burst: ImpactBurst, img: HTMLImageElement | undefined): void {
  for (const p of burst.dust) {
    const u = particleLife(p);
    if (u === null) continue;
    g.save();
    g.globalAlpha = (1 - u) * 0.45;
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    if (img?.naturalWidth) {
      g.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
    } else {
      g.fillStyle = '#8a6a40';
      g.beginPath();
      g.arc(0, 0, p.size * 0.35, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

function drawSmoke(g: CanvasRenderingContext2D, burst: ImpactBurst): void {
  for (const p of burst.smoke) {
    const u = particleLife(p);
    if (u === null) continue;
    const appear = clamp01(u / 0.18);
    const fade = appear * (1 - u) * (1 - u);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.scale(1.28, 0.7);
    const r = p.size * 0.5;
    const fog = g.createRadialGradient(-r * 0.12, -r * 0.1, r * 0.06, 0, 0, r);
    fog.addColorStop(0, 'rgba(255, 251, 244, 0.55)');
    fog.addColorStop(0.38, 'rgba(232, 224, 210, 0.16)');
    fog.addColorStop(1, 'rgba(232, 224, 210, 0)');
    g.globalAlpha = fade * 0.8;
    g.fillStyle = fog;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}
