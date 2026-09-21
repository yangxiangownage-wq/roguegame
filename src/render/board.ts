import { boardMetrics, type BoardSettings } from '@/config/board';

const TILE_URLS = [
  '/assets/tiles/tile-00.png',
  '/assets/tiles/tile-01.png',
  '/assets/tiles/tile-02.png',
  '/assets/tiles/tile-03.png',
  '/assets/tiles/tile-04.png',
  '/assets/tiles/tile-05.png',
  '/assets/tiles/tile-06.png',
];

type Cell = { col: number; row: number };

type TileFx = {
  squash: number;
  wantSquash: number;
  popT: number;
  hover: number;
  wantHover: number;
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

  private constructor(private readonly tiles: HTMLImageElement[]) {}

  static async create(): Promise<StoneBoard> {
    const tiles = await Promise.all(TILE_URLS.map(loadImage));
    return new StoneBoard(tiles);
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
    this.fxOf(cell).popT = 0;
  }

  pointerMove(px: number, py: number, s: BoardSettings): void {
    const cell = hitCell(px, py, s);
    if (this.hovered && (!cell || cell.col !== this.hovered.col || cell.row !== this.hovered.row)) {
      this.fxOf(this.hovered).wantHover = 0;
    }
    this.hovered = cell;
    if (cell) this.fxOf(cell).wantHover = 1;
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
      fx = { squash: 0, wantSquash: 0, popT: 99, hover: 0, wantHover: 0 };
      this.fx.set(key, fx);
    }
    return fx;
  }

  private isHot(cell: Cell): boolean {
    const fx = this.fx.get(cellKey(cell.col, cell.row));
    if (!fx) return false;
    return fx.squash > 0.02 || fx.hover > 0.02 || fx.popT < 1;
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
    g.restore();
  }
}
