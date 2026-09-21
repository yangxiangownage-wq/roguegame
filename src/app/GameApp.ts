import { loadEditorSave, type BoardSettings } from '@/config/board';
import {
  applyDesignStage,
  clientToDesign,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  type DesignFit,
} from '@/config/design';
import { StoneBoard } from '@/render/board';
import { mountBoardInspector } from '@/ui/BoardInspector';

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly board: StoneBoard;
  private readonly settings: BoardSettings;
  private fit: DesignFit;
  private dpr = 1;
  private lastTs = 0;

  private constructor(board: StoneBoard) {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    if (!canvas) throw new Error('#game-canvas missing');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.board = board;
    const save = loadEditorSave();
    this.settings = save.settings;
    const inspector = document.querySelector<HTMLElement>('#board-inspector');
    if (!inspector) throw new Error('#board-inspector missing');
    mountBoardInspector(inspector, this.settings, save);
    this.fit = applyDesignStage();
    this.bindResize();
    this.bindPointer();
  }

  static async create(): Promise<GameApp> {
    const board = await StoneBoard.create();
    const app = new GameApp(board);
    app.onResize();
    requestAnimationFrame((t) => app.tick(t));
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
    this.fit = applyDesignStage('design-root', viewW, viewH);
    this.syncCanvasBuffer();
  }

  private bindPointer(): void {
    const toDesign = (e: PointerEvent) =>
      clientToDesign(e.clientX, e.clientY, this.fit);
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = toDesign(e);
      this.board.pointerDown(p.x, p.y, this.settings);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      const p = toDesign(e);
      this.board.pointerUp(p.x, p.y, this.settings);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = toDesign(e);
      const onTile = this.board.pointerMove(p.x, p.y, this.settings);
      this.canvas.style.cursor = onTile ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('pointercancel', () => {
      this.board.pointerCancel();
      this.canvas.style.cursor = 'default';
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.board.pointerCancel();
      this.canvas.style.cursor = 'default';
    });
  }

  private syncCanvasBuffer(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(DESIGN_WIDTH * this.dpr);
    this.canvas.height = Math.round(DESIGN_HEIGHT * this.dpr);
    this.canvas.style.width = `${DESIGN_WIDTH}px`;
    this.canvas.style.height = `${DESIGN_HEIGHT}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private tick(ts: number): void {
    const dt = this.lastTs === 0 ? 0 : Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.board.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.tick(t));
  }

  private draw(): void {
    this.ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.board.draw(this.ctx, this.settings);
  }
}
