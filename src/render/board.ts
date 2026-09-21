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

export class StoneBoard {
  private constructor(private readonly tiles: HTMLImageElement[]) {}

  static async create(): Promise<StoneBoard> {
    const tiles = await Promise.all(TILE_URLS.map(loadImage));
    return new StoneBoard(tiles);
  }

  draw(g: CanvasRenderingContext2D, s: BoardSettings): void {
    const { pitch, spanW, spanH, x: ox, y: oy } = boardMetrics(s);
    const pad = s.trayPad;
    roundRect(g, ox - pad, oy - pad, spanW + pad * 2, spanH + pad * 2, 10);
    g.fillStyle = s.trayColor;
    g.fill();

    const radius = s.tileSize * 0.11;
    const n = this.tiles.length;
    for (let row = 0; row < s.rows; row++) {
      for (let col = 0; col < s.cols; col++) {
        const tile = this.tiles[tileId(row, col, n)]!;
        const tx = ox + col * pitch;
        const ty = oy + row * pitch;
        g.save();
        roundRect(g, tx, ty, s.tileSize, s.tileSize, radius);
        g.clip();
        g.drawImage(tile, tx, ty, s.tileSize, s.tileSize);
        g.restore();
      }
    }
  }
}
