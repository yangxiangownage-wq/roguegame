import { loadCatalog, selectedCard } from '@/config/catalog';
import { applyDesignStage, DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/design';
import { mountCardInspector } from '@/ui/CardInspector';
import { mountCardPreview } from '@/ui/CardPreview';

export class CardApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  private constructor() {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    if (!canvas) throw new Error('#game-canvas missing');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas unavailable');
    this.canvas = canvas;
    this.ctx = ctx;

    const inspector = document.querySelector<HTMLElement>('#card-inspector');
    if (!inspector) throw new Error('#card-inspector missing');
    const previewRoot = document.querySelector<HTMLElement>('#card-preview');
    if (!previewRoot) throw new Error('#card-preview missing');

    const save = loadCatalog();
    const paint = mountCardPreview(previewRoot);
    const refresh = () => paint(selectedCard(save));
    mountCardInspector(inspector, save, refresh);
    refresh();

    applyDesignStage();
    this.bindResize();
  }

  static create(): CardApp {
    const app = new CardApp();
    app.onResize();
    return app;
  }

  private bindResize(): void {
    const onResize = () => this.onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
  }

  private onResize(): void {
    const viewW = window.visualViewport?.width ?? window.innerWidth;
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    applyDesignStage('design-root', viewW, viewH);
    this.syncCanvasBuffer();
    this.ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  private syncCanvasBuffer(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(DESIGN_WIDTH * this.dpr);
    this.canvas.height = Math.round(DESIGN_HEIGHT * this.dpr);
    this.canvas.style.width = `${DESIGN_WIDTH}px`;
    this.canvas.style.height = `${DESIGN_HEIGHT}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
