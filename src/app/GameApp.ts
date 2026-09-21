import { loadEditorSave, type BoardSettings } from '@/config/board';
import {
  applyDesignStage,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
} from '@/config/design';
import { StoneBoard } from '@/render/board';
import { mountBoardInspector } from '@/ui/BoardInspector';

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly board: StoneBoard;
  private readonly settings: BoardSettings;
  private dpr = 1;

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
    applyDesignStage();
    this.bindResize();
  }

  static async create(): Promise<GameApp> {
    const board = await StoneBoard.create();
    const app = new GameApp(board);
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
    this.ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.board.draw(this.ctx, this.settings);
  }
}
