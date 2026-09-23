import { boardMetrics, type BoardSettings } from '@/config/board';
import {
  DISSOLVE_MASK,
  DISSOLVE_SEC,
  ICON_FRAC,
  drawDissolvingIcon,
  spawnScale,
} from '@/render/radialDissolve';

const TILE_URLS = [
  '/assets/tiles/tile-00.png',
  '/assets/tiles/tile-01.png',
  '/assets/tiles/tile-02.png',
  '/assets/tiles/tile-03.png',
  '/assets/tiles/tile-04.png',
  '/assets/tiles/tile-05.png',
  '/assets/tiles/tile-06.png',
];

const ATTACK_URL = '/assets/icons/attack.png';
const GOLD_URL = '/assets/icons/gold-mine.png?v=3';
const ICON_BUF = 256;

type Cell = { col: number; row: number };
type PieceKind = 'mark' | 'gold';

/** A few mines, spread across the board, stable for a given size. */
export function goldMineCells(cols: number, rows: number): Cell[] {
  const total = cols * rows;
  if (total <= 0) return [];
  const count = Math.max(2, Math.min(total - 1, Math.round(total / 8)));
  const stride = Math.max(1, Math.floor(total / count));
  const cells: Cell[] = [];
  const used = new Set<string>();
  let n = Math.floor(cols / 2);
  while (cells.length < count && used.size < total) {
    const idx = n % total;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const key = cellKey(col, row);
    if (!used.has(key)) {
      used.add(key);
      cells.push({ col, row });
    }
    n += stride;
  }
  return cells;
}

type TileFx = {
  squash: number;
  wantSquash: number;
  popT: number;
  hover: number;
  wantHover: number;
  iconOn: boolean;
  kind: PieceKind;
  iconT: number;
  iconDelay: number;
  iconSeed: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function tileId(row: number, col: number, n: number): number {
  return (row * 3 + col * 2) % n;
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function hitCell(px: number, py: number, s: BoardSettings): Cell | null {
  const m = boardMetrics(s);
  const x = px - m.x;
  const y = py - m.y;
  if (x < 0 || y < 0) return null;
  const col = Math.floor(x / m.pitch);
  const row = Math.floor(y / m.pitch);
  if (col < 0 || col >= s.cols || row < 0 || row >= s.rows) return null;
  const lx = x - col * m.pitch;
  const ly = y - row * m.pitch;
  if (lx > s.tileSize || ly > s.tileSize) return null;
  return { col, row };
}

export class StoneBoard {
  private readonly fx = new Map<string, TileFx>();
  private pressed: Cell | null = null;
  private hovered: Cell | null = null;
  private readonly mask: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private readonly iconBuf: HTMLCanvasElement;
  private readonly iconBufCtx: CanvasRenderingContext2D;

  private constructor(
    private readonly tiles: HTMLImageElement[],
    private readonly attackIcon: HTMLImageElement,
    private readonly goldIcon: HTMLImageElement,
  ) {
    this.mask = document.createElement('canvas');
    this.mask.width = DISSOLVE_MASK;
    this.mask.height = DISSOLVE_MASK;
    const maskCtx = this.mask.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) throw new Error('2d mask canvas unavailable');
    this.maskCtx = maskCtx;
    this.iconBuf = document.createElement('canvas');
    this.iconBuf.width = ICON_BUF;
    this.iconBuf.height = ICON_BUF;
    const iconBufCtx = this.iconBuf.getContext('2d');
    if (!iconBufCtx) throw new Error('2d icon buffer unavailable');
    this.iconBufCtx = iconBufCtx;
  }

  static async create(): Promise<StoneBoard> {
    const [tiles, attackIcon, goldIcon] = await Promise.all([
      Promise.all(TILE_URLS.map(loadImage)),
      loadImage(ATTACK_URL),
      loadImage(GOLD_URL),
    ]);
    return new StoneBoard(tiles, attackIcon, goldIcon);
  }

  pointerDown(px: number, py: number, s: BoardSettings): void {
    const cell = hitCell(px, py, s);
    if (this.pressed) this.fxOf(this.pressed).wantSquash = 0;
    this.pressed = cell;
    if (cell) this.fxOf(cell).wantSquash = 1;
  }

  pointerUp(px: number, py: number, s: BoardSettings): void {
    const cell = hitCell(px, py, s);
    const was = this.pressed;
    this.pressed = null;
    if (was) this.fxOf(was).wantSquash = 0;
    if (!cell || !was || cell.col !== was.col || cell.row !== was.row) return;
    // Clicking a cell is only feedback. Contents are supplied by played cards.
    this.fxOf(cell).popT = 0;
  }

  hasPiece(col: number, row: number): boolean {
    return this.fx.get(cellKey(col, row))?.iconOn ?? false;
  }

  place(col: number, row: number, delay = 0): void {
    this.setPiece(col, row, 'mark', delay);
  }

  /** Gold mines are already on the board when the battle opens. */
  seedGold(cols: number, rows: number): void {
    for (const cell of goldMineCells(cols, rows)) {
      this.setPiece(cell.col, cell.row, 'gold', 0);
      const fx = this.fxOf(cell);
      fx.iconT = 1;
      fx.popT = 99;
    }
  }

  private setPiece(col: number, row: number, kind: PieceKind, delay: number): void {
    const fx = this.fxOf({ col, row });
    fx.iconOn = true;
    fx.kind = kind;
    fx.iconT = 0;
    fx.iconDelay = delay;
    fx.iconSeed = row * 12.9898 + col * 78.233;
    fx.popT = delay > 0 ? 99 : 0;
  }

  pointerMove(px: number, py: number, s: BoardSettings): boolean {
    const cell = hitCell(px, py, s);
    if (this.hovered && (!cell || cell.col !== this.hovered.col || cell.row !== this.hovered.row)) {
      this.fxOf(this.hovered).wantHover = 0;
    }
    this.hovered = cell;
    if (cell) this.fxOf(cell).wantHover = 1;
    return cell !== null;
  }

  pointerCancel(): void {
    if (this.pressed) this.fxOf(this.pressed).wantSquash = 0;
    this.pressed = null;
    if (this.hovered) this.fxOf(this.hovered).wantHover = 0;
    this.hovered = null;
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-14 * dt);
    const hk = 1 - Math.exp(-12 * dt);
    for (const fx of this.fx.values()) {
      fx.squash += (fx.wantSquash - fx.squash) * k;
      fx.hover += (fx.wantHover - fx.hover) * hk;
      fx.popT += dt / 0.28;
      if (!fx.iconOn) continue;
      if (fx.iconDelay > 0) {
        fx.iconDelay -= dt;
        if (fx.iconDelay >= 0) continue;
        fx.popT = 0;
        fx.iconT += -fx.iconDelay / DISSOLVE_SEC;
        fx.iconDelay = 0;
      } else {
        fx.iconT += dt / DISSOLVE_SEC;
      }
    }
  }

  draw(g: CanvasRenderingContext2D, s: BoardSettings): void {
    const { pitch, spanW, spanH, x: ox, y: oy } = boardMetrics(s);
    const pad = s.trayPad;
    roundRect(g, ox - pad, oy - pad, spanW + pad * 2, spanH + pad * 2, 10);
    g.fillStyle = s.trayColor;
    g.fill();

    const rest: Cell[] = [];
    const popping: Cell[] = [];
    for (let row = 0; row < s.rows; row++) {
      for (let col = 0; col < s.cols; col++) {
        const cell = { col, row };
        if (this.isHot(cell)) popping.push(cell);
        else rest.push(cell);
      }
    }
    for (const cell of rest) this.drawTile(g, s, ox, oy, pitch, cell);
    for (const cell of popping) this.drawTile(g, s, ox, oy, pitch, cell);
  }

  private fxOf(cell: Cell): TileFx {
    const key = cellKey(cell.col, cell.row);
    let fx = this.fx.get(key);
    if (!fx) {
      fx = {
        squash: 0,
        wantSquash: 0,
        popT: 99,
        hover: 0,
        wantHover: 0,
        iconOn: false,
        kind: 'mark',
        iconT: 0,
        iconDelay: 0,
        iconSeed: 0,
      };
      this.fx.set(key, fx);
    }
    return fx;
  }

  private isHot(cell: Cell): boolean {
    const fx = this.fx.get(cellKey(cell.col, cell.row));
    if (!fx) return false;
    return (
      fx.squash > 0.02 ||
      fx.hover > 0.02 ||
      fx.popT < 1 ||
      (fx.iconOn && fx.iconT < 1)
    );
  }

  private popScale(t: number): number {
    if (t >= 1) return 1;
    return 1 + 0.045 * (1 - t) * (1 - t) * (4 * t);
  }

  private drawTile(
    g: CanvasRenderingContext2D,
    s: BoardSettings,
    ox: number,
    oy: number,
    pitch: number,
    cell: Cell,
  ): void {
    const tile = this.tiles[tileId(cell.row, cell.col, this.tiles.length)]!;
    const tx = ox + cell.col * pitch;
    const ty = oy + cell.row * pitch;
    const size = s.tileSize;
    const radius = size * 0.11;
    const fx = this.fx.get(cellKey(cell.col, cell.row));
    const squash = fx?.squash ?? 0;
    const pop = this.popScale(fx?.popT ?? 99);
    const scale = (1 - squash * 0.08) * pop;
    const hover = fx?.hover ?? 0;

    g.save();
    g.translate(tx + size / 2, ty + size / 2);
    g.scale(scale, scale);
    g.translate(-size / 2, -size / 2);
    roundRect(g, 0, 0, size, size, radius);
    g.clip();
    g.drawImage(tile, 0, 0, size, size);
    if (hover > 0.01) {
      g.fillStyle = `rgba(255,255,255,${0.42 * hover})`;
      g.fillRect(0, 0, size, size);
    }
    this.drawAttackIcon(g, size, fx);
    g.restore();
  }

  private drawAttackIcon(
    g: CanvasRenderingContext2D,
    size: number,
    fx: TileFx | undefined,
  ): void {
    if (!fx?.iconOn) return;
    const t = fx.iconT;
    if (t <= 0) return;
    const iconSize = size * ICON_FRAC;
    const sc = spawnScale(t);
    g.save();
    g.translate(size / 2, size / 2);
    g.scale(sc, sc);
    g.translate(-iconSize / 2, -iconSize / 2);
    drawDissolvingIcon(
      g,
      fx.kind === 'gold' ? this.goldIcon : this.attackIcon,
      iconSize,
      t,
      fx.iconSeed,
      this.mask,
      this.maskCtx,
      this.iconBuf,
      this.iconBufCtx,
    );
    g.restore();
  }
}
