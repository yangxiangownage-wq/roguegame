import { createSkillCard } from '@/config/skillCard';
import { applyDesignStage, DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/design';
import { SkillCardView } from '@/render/skillCard';
import { mountCardInspector } from '@/ui/CardInspector';

export class CardApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly view: SkillCardView;
  private readonly data = createSkillCard();
  private dpr = 1;

  private constructor(view: SkillCardView) {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    if (!canvas) throw new Error('#game-canvas missing');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.view = view;
    const inspector = document.querySelector<HTMLElement>('#card-inspector');
    if (!inspector) throw new Error('#card-inspector missing');
    mountCardInspector(inspector, this.data);
    applyDesignStage();
    this.bindResize();
  }

  static async create(): Promise<CardApp> {
    const view = await SkillCardView.create();
    const app = new CardApp(view);
    app.onResize();
    requestAnimationFrame(() => app.tick());
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
  }

  private syncCanvasBuffer(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(DESIGN_WIDTH * this.dpr);
    this.canvas.height = Math.round(DESIGN_HEIGHT * this.dpr);
    this.canvas.style.width = `${DESIGN_WIDTH}px`;
    this.canvas.style.height = `${DESIGN_HEIGHT}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private tick(): void {
    this.draw();
    requestAnimationFrame(() => this.tick());
  }

  private draw(): void {
    const g = this.ctx;
    g.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.view.drawParts(g, 120, 72);
    this.view.drawAssembled(g, 760, 220, this.data);
  }
}
