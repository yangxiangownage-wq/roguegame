import { loadEditorSave, type BoardSettings } from '@/config/board';
import {
  applyDesignStage,
  clientToDesign,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  type DesignFit,
} from '@/config/design';
import { StoneBoard } from '@/render/board';
import { FighterCards } from '@/render/fighterCards';
import { BattleView } from '@/ui/BattleView';
import { battleLayout } from '@/config/battleLayout';
import { mountBoardInspector } from '@/ui/BoardInspector';

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly board: StoneBoard;
  private readonly fighters: FighterCards;
  private readonly settings: BoardSettings;
  private readonly battleView: BattleView;
  private fit: DesignFit;
  private dpr = 1;
  private lastTs = 0;

  private constructor(board: StoneBoard, fighters: FighterCards) {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    if (!canvas) throw new Error('#game-canvas missing');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.board = board;
    this.fighters = fighters;
    const save = loadEditorSave();
    this.settings = save.settings;
    const inspector = document.querySelector<HTMLElement>('#board-inspector');
    if (!inspector) throw new Error('#board-inspector missing');
    mountBoardInspector(inspector, this.settings, { ...save, hidden: true });
    this.board.seedGold(this.settings.cols, this.settings.rows);
    this.battleView = new BattleView(this.settings, this.board);
    this.fit = applyDesignStage();
    this.bindResize();
    this.bindPointer();
  }

  static async create(): Promise<GameApp> {
    const [board, fighters] = await Promise.all([StoneBoard.create(), FighterCards.create()]);
    const app = new GameApp(board, fighters);
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
    const toDesign = (e: PointerEvent) => clientToDesign(e.clientX, e.clientY, this.fit);
    const toBoard = (p: { x: number; y: number }) => {
      const layout = battleLayout(this.settings);
      return { x: (p.x - 960) / layout.scale + 960, y: (p.y - layout.centerY) / layout.scale + 540 };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const design = toDesign(e);
      if (this.battleView.targetClick(design.x, design.y)) { this.board.pointerCancel(); return; }
      const p = toBoard(design);
      this.board.pointerDown(p.x, p.y, this.settings);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      const p = toBoard(toDesign(e));
      this.board.pointerUp(p.x, p.y, this.settings);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = toBoard(toDesign(e));
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
    this.battleView.update(dt);
    this.fighters.setBattle(this.battleView.battle);
    this.draw();
    requestAnimationFrame((t) => this.tick(t));
  }

  private draw(): void {
    this.ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    const layout = battleLayout(this.settings);
    this.ctx.save();
    this.ctx.translate(960, layout.centerY);
    this.ctx.scale(layout.scale, layout.scale);
    this.ctx.translate(-960, -540);
    this.board.draw(this.ctx, this.settings);
    this.fighters.draw(this.ctx, this.settings);
    this.ctx.restore();
  }
}
