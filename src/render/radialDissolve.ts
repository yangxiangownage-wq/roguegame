/** UNO-style paint dissolve, radial from tile center to edges. */

export const DISSOLVE_MASK = 56;
export const DISSOLVE_SEC = 0.4;
export const DISSOLVE_STAGGER_SEC = 0.1;
/** Occupied cells are painted tile faces; clip supplies the round. */
export const ICON_FRAC = 1.04;

const SOFT_FRAC = 0.16;
const NOISE_FRAC = 0.11;

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

export function easeOutPaint(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function spawnScale(t: number): number {
  const u = easeOutPaint(t);
  if (u <= 0) return 1;
  if (u >= 1) return 1;
  if (u < 0.45) return 1 + 0.055 * (1 - Math.pow(1 - u / 0.45, 2));
  const p = (u - 0.45) / 0.55;
  return 1.055 + (1 - 1.055) * (p * p * (3 - 2 * p));
}

export function paintRadialDissolveMask(
  ctx: CanvasRenderingContext2D,
  linearT: number,
  seed: number,
): void {
  const MW = ctx.canvas.width;
  const MH = ctx.canvas.height;
  const u = easeOutPaint(linearT);
  const maxR = Math.SQRT1_2;
  const pad = 0.06;
  const minP = -pad;
  const maxP = maxR + pad;
  const span = maxP - minP;
  const softW = span * SOFT_FRAC;
  const noiseAmp = span * NOISE_FRAC;
  const thr = minP + span * u;
  const breathe = u * 1.6;

  const img = ctx.createImageData(MW, MH);
  const px = img.data;
  for (let j = 0; j < MH; j++) {
    for (let i = 0; i < MW; i++) {
      const x = (i + 0.5) / MW - 0.5;
      const y = (j + 0.5) / MH - 0.5;
      const dist = Math.hypot(x, y);
      const n =
        Math.sin(x * 16 + seed) * 0.42 +
        Math.sin(y * 19 + seed * 1.37 + breathe) * 0.3 +
        Math.sin((x + y) * 23 - seed * 0.61 + breathe * 0.7) * 0.18 +
        Math.sin((x - y) * 11 + seed * 2.1 + breathe * 1.4) * 0.22;
      const edge = thr + n * noiseAmp;
      const d = edge - dist;
      let a = 0;
      if (d >= softW) a = 255;
      else if (d > -softW * 0.45) {
        const k = (d + softW * 0.45) / (softW * 1.45);
        const s = k * k * (3 - 2 * k);
        a = Math.round(255 * Math.min(1, Math.max(0, s)));
      }
      const p = (j * MW + i) * 4;
      px[p] = 255;
      px[p + 1] = 255;
      px[p + 2] = 255;
      px[p + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function paintDirectionalDissolveMask(
  ctx: CanvasRenderingContext2D,
  linearT: number,
  _seed: number,
  dx: number,
  dy: number,
  reverse = false,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const u = Math.max(0, Math.min(1, linearT));
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const reach = Math.hypot(W, H) * 0.58;
  const cx = W / 2;
  const cy = H / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(cx - nx * reach, cy - ny * reach, cx + nx * reach, cy + ny * reach);
  const soft = 0.12;
  const front = u;
  if (reverse) {
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(Math.max(0, front - soft * 0.4), 'rgba(255,255,255,0)');
    grad.addColorStop(Math.min(1, front + soft), 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(Math.max(0, front - soft), 'rgba(255,255,255,1)');
    grad.addColorStop(Math.min(1, front + soft * 0.4), 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

export type DissolveStyle = { radial?: boolean; dx?: number; dy?: number; reverse?: boolean };

export function drawDissolvingIcon(
  g: CanvasRenderingContext2D,
  icon: CanvasImageSource,
  size: number,
  linearT: number,
  seed: number,
  mask: HTMLCanvasElement,
  maskCtx: CanvasRenderingContext2D,
  buf: HTMLCanvasElement,
  bufCtx: CanvasRenderingContext2D,
  style?: DissolveStyle,
): void {
  if (linearT <= 0) return;
  if (linearT >= 1) {
    g.drawImage(icon, 0, 0, size, size);
    return;
  }
  if (style && (style.dx !== undefined || style.dy !== undefined)) {
    paintDirectionalDissolveMask(maskCtx, linearT, seed, style.dx ?? 1, style.dy ?? 0, style.reverse === true);
  } else {
    paintRadialDissolveMask(maskCtx, linearT, seed);
  }
  const bw = buf.width;
  const bh = buf.height;
  bufCtx.setTransform(1, 0, 0, 1, 0, 0);
  bufCtx.globalCompositeOperation = 'source-over';
  bufCtx.clearRect(0, 0, bw, bh);
  bufCtx.imageSmoothingEnabled = true;
  bufCtx.imageSmoothingQuality = style && (style.dx !== undefined || style.dy !== undefined) ? 'low' : 'high';
  bufCtx.drawImage(icon, 0, 0, bw, bh);
  bufCtx.globalCompositeOperation = 'destination-in';
  bufCtx.drawImage(mask, 0, 0, bw, bh);
  bufCtx.globalCompositeOperation = 'source-over';
  g.drawImage(buf, 0, 0, size, size);
}
