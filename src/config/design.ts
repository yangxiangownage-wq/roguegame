export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export interface DesignFit {
  scale: number;
  offsetX: number;
  offsetY: number;
  usedW: number;
  usedH: number;
  viewW: number;
  viewH: number;
}

export function computeDesignFit(
  viewW = typeof window !== 'undefined' ? window.innerWidth : DESIGN_WIDTH,
  viewH = typeof window !== 'undefined' ? window.innerHeight : DESIGN_HEIGHT,
): DesignFit {
  const scale = Math.min(viewW / DESIGN_WIDTH, viewH / DESIGN_HEIGHT);
  const usedW = DESIGN_WIDTH * scale;
  const usedH = DESIGN_HEIGHT * scale;
  return {
    scale,
    offsetX: (viewW - usedW) / 2,
    offsetY: (viewH - usedH) / 2,
    usedW,
    usedH,
    viewW,
    viewH,
  };
}

export function applyDesignStage(
  rootId = 'design-root',
  viewW?: number,
  viewH?: number,
): DesignFit {
  const fit = computeDesignFit(viewW, viewH);
  const stage = document.getElementById(rootId) as HTMLElement | null;
  if (stage) {
    stage.style.width = `${DESIGN_WIDTH}px`;
    stage.style.height = `${DESIGN_HEIGHT}px`;
    stage.style.transform = `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`;
    stage.style.transformOrigin = 'top left';
  }
  const gameRoot = document.getElementById('game-root');
  if (gameRoot) {
    gameRoot.style.setProperty('--design-scale', String(fit.scale));
    gameRoot.style.setProperty('--design-w', `${DESIGN_WIDTH}px`);
    gameRoot.style.setProperty('--design-h', `${DESIGN_HEIGHT}px`);
    gameRoot.style.setProperty('--design-offset-x', `${fit.offsetX}px`);
    gameRoot.style.setProperty('--design-offset-y', `${fit.offsetY}px`);
  }
  return fit;
}

export function clientToDesign(
  clientX: number,
  clientY: number,
  fit: DesignFit,
): { x: number; y: number } {
  return {
    x: (clientX - fit.offsetX) / fit.scale,
    y: (clientY - fit.offsetY) / fit.scale,
  };
}
