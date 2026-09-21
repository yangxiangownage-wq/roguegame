const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

function computeDesignFit(viewW, viewH) {
  const scale = Math.min(viewW / DESIGN_WIDTH, viewH / DESIGN_HEIGHT);
  const usedW = DESIGN_WIDTH * scale;
  const usedH = DESIGN_HEIGHT * scale;
  return {
    scale,
    offsetX: (viewW - usedW) / 2,
    offsetY: (viewH - usedH) / 2,
    usedW,
    usedH,
  };
}

function almost(a, b, eps = 1e-6) {
  if (Math.abs(a - b) > eps) throw new Error(`expected ${b}, got ${a}`);
}

const cases = [
  { name: '1080p', w: 1920, h: 1080, scale: 1, ox: 0, oy: 0 },
  { name: '720p', w: 1280, h: 720, scale: 1280 / 1920, ox: 0, oy: 0 },
  { name: '16:10 1920×1200', w: 1920, h: 1200, scale: 1, ox: 0, oy: 60 },
  { name: 'ultrawide 2560×1080', w: 2560, h: 1080, scale: 1, ox: 320, oy: 0 },
  { name: 'square 800×800', w: 800, h: 800, scale: 800 / 1920, ox: 0, oy: (800 - 1080 * (800 / 1920)) / 2 },
];

for (const c of cases) {
  const fit = computeDesignFit(c.w, c.h);
  almost(fit.scale, c.scale);
  almost(fit.offsetX, c.ox);
  almost(fit.offsetY, c.oy);
  console.log(`ok  ${c.name}  scale=${fit.scale.toFixed(4)}  offset=${fit.offsetX.toFixed(1)},${fit.offsetY.toFixed(1)}`);
}

console.log('all fit cases passed');
