/** UNO-style paint dissolve, radial from tile center to edges. */

export const DISSOLVE_MASK = 56;
export const DISSOLVE_SEC = 0.4;
export const DISSOLVE_STAGGER_SEC = 0.1;
export const ICON_FRAC = 1;

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

export function drawDissolvingIcon(
  g: CanvasRenderingContext2D,
  icon: HTMLImageElement,
  size: number,
  linearT: number,
  seed: number,
  mask: HTMLCanvasElement,
  maskCtx: CanvasRenderingContext2D,
  buf: HTMLCanvasElement,
  bufCtx: CanvasRenderingContext2D,
): void {
  if (linearT <= 0) return;
  if (linearT >= 1) {
    g.drawImage(icon, 0, 0, size, size);
    return;
  }
  paintRadialDissolveMask(maskCtx, linearT, seed);
  const bw = buf.width;
  const bh = buf.height;
  bufCtx.setTransform(1, 0, 0, 1, 0, 0);
  bufCtx.globalCompositeOperation = 'source-over';
  bufCtx.clearRect(0, 0, bw, bh);
  bufCtx.imageSmoothingEnabled = true;
  bufCtx.imageSmoothingQuality = 'high';
  bufCtx.drawImage(icon, 0, 0, bw, bh);
  bufCtx.globalCompositeOperation = 'destination-in';
  bufCtx.drawImage(mask, 0, 0, bw, bh);
  bufCtx.globalCompositeOperation = 'source-over';
  g.drawImage(buf, 0, 0, size, size);
}
