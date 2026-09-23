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

function addRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  addRoundRect(g, x, y, w, h, r);
}

/** Arc-length sampling keeps the enchanted threads continuous around corners. */
function rimPoint(distance: number, w: number, h: number, radius: number): { x: number; y: number; nx: number; ny: number } {
  const r = Math.min(radius, w / 2, h / 2);
  const arc = Math.PI * r / 2;
  const perimeter = 2 * (w + h - 4 * r) + 4 * arc;
  let d = ((distance % perimeter) + perimeter) % perimeter;
  const lengths = [w - 2 * r, h - 2 * r, w - 2 * r, h - 2 * r];
  const starts = [[r, 0], [w, r], [w - r, h], [0, h - r]];
  const centers = [[w - r, r], [w - r, h - r], [r, h - r], [r, r]];
  for (let side = 0; side < 4; side++) {
    const angle = side * Math.PI / 2;
    const nx = Math.sin(angle);
    const ny = -Math.cos(angle);
    if (d <= lengths[side]!) return {
      x: starts[side]![0]! + Math.cos(angle) * d,
      y: starts[side]![1]! + Math.sin(angle) * d, nx, ny,
    };
    d -= lengths[side]!;
    if (d <= arc) {
      const a = angle - Math.PI / 2 + d / r;
      return { x: centers[side]![0]! + Math.cos(a) * r, y: centers[side]![1]! + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
    }
    d -= arc;
  }
  return { x: r, y: 0, nx: 0, ny: -1 };
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
  private wantDropGlow = 0;
  private dropGlow = 0;
  private dropSpin = 0;
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

  /** Warm gold rim and a subtle traveling reflection while a card is held over the tray. */
  setDropHighlight(on: boolean): void {
    this.wantDropGlow = on ? 1 : 0;
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
    this.dropGlow += (this.wantDropGlow - this.dropGlow) * hk;
    if (this.dropGlow > 0.01) this.dropSpin = (this.dropSpin + dt * 0.32) % (Math.PI * 2);
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
    this.drawDropGlow(g, s, ox, oy, spanW, spanH);
  }

  private drawDropGlow(
    g: CanvasRenderingContext2D,
    s: BoardSettings,
    ox: number,
    oy: number,
    spanW: number,
    spanH: number,
  ): void {
    const glow = this.dropGlow;
    if (glow < 0.01) return;
    const pad = s.trayPad;
    const x = ox - pad;
    const y = oy - pad;
    const w = spanW + pad * 2;
    const h = spanH + pad * 2;
    const time = this.dropSpin;
    const breath = 0.88 + 0.12 * Math.sin(time * 6);
    const perimeter = 2 * (w + h - 40) + 20 * Math.PI;
    const samples = Math.ceil(perimeter / 5);
    const points = Array.from({ length: samples }, (_, i) => rimPoint(i / samples * perimeter, w, h, 10));
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.lineJoin = 'round';

    // All energy is outside the tray; the playable surface stays legible.
    g.save();
    g.beginPath();
    g.rect(x - 72, y - 72, w + 144, h + 144);
    addRoundRect(g, x, y, w, h, 10);
    g.clip('evenodd');
    for (let spread = 52; spread >= 4; spread -= 4) {
      g.globalAlpha = glow * breath * 0.11 * Math.pow(1 - spread / 60, 1.4);
      g.strokeStyle = spread > 24 ? '#dc6315' : '#ffb62e';
      g.lineWidth = spread * 2;
      roundRect(g, x, y, w, h, 10);
      g.stroke();
    }

    // Filled, irregular ribbons produce a flame silhouette rather than neon wires.
    for (let layer = 0; layer < 3; layer++) {
      g.beginPath();
      for (let i = 0; i < samples; i++) {
        const phase = i / samples * Math.PI * 2;
        const p = points[i]!;
        const wave = Math.sin(phase * 19 - time * 10 + layer * 1.8);
        const fine = Math.sin(phase * 37 + time * 14);
        const crest = Math.pow(0.5 + 0.5 * Math.sin(phase * 7 - time * 4), 3);
        const offset = (8 + 7 * wave + 3 * fine + 22 * crest) * (1 - layer * 0.27);
        const px = x + p.x + p.nx * Math.max(2, offset);
        const py = y + p.y + p.ny * Math.max(2, offset);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      addRoundRect(g, x, y, w, h, 10);
      g.fillStyle = ['#e97814', '#ffb62f', '#ffe394'][layer]!;
      g.globalAlpha = glow * breath * [0.24, 0.3, 0.42][layer]!;
      g.fill('evenodd');
    }

    // Bright traveling crests have a soft body and a thin gold core.
    const sheen = g.createConicGradient(time, x + w / 2, y + h / 2);
    for (const [stop, alpha] of [[0, 0.12], [0.14, 0.3], [0.22, 1], [0.3, 0.12], [0.64, 0.3], [0.72, 1], [0.8, 0.12], [1, 0.12]]) {
      sheen.addColorStop(stop!, `rgba(255, 225, 143, ${alpha})`);
    }
    g.beginPath();
    for (let i = 0; i <= samples; i++) {
      const phase = i / samples * Math.PI * 2;
      const p = points[i % samples]!;
      const offset = 5 + 2.5 * Math.sin(phase * 13 - time * 8) + 1.5 * Math.sin(phase * 29 + time * 6);
      const px = x + p.x + p.nx * offset;
      const py = y + p.y + p.ny * offset;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.strokeStyle = sheen;
    g.globalAlpha = glow * 0.35;
    g.lineWidth = 9;
    g.stroke();
    g.globalAlpha = glow;
    g.lineWidth = 1.8;
    g.stroke();

    // Deterministic embers drift away from the boundary and fade before wrapping.
    const emberCount = Math.min(64, Math.ceil(perimeter / 48));
    for (let i = 0; i < emberCount; i++) {
      const seed = i * 2.399963;
      const life = ((time / (Math.PI * 2) * 6 + i * 0.618034) % 1);
      const p = rimPoint(i / emberCount * perimeter + Math.sin(seed) * 28, w, h, 10);
      const drift = 9 + life * (24 + 20 * (0.5 + 0.5 * Math.sin(seed)));
      const tangent = Math.sin(life * 5 + seed) * 7;
      const px = x + p.x + p.nx * drift - p.ny * tangent;
      const py = y + p.y + p.ny * drift + p.nx * tangent;
      g.globalAlpha = glow * Math.sin(life * Math.PI) * 0.8;
      g.fillStyle = '#ffcb64';
      g.beginPath();
      g.ellipse(px, py, 1.2, 2.8 * (1 - life) + 0.5, seed, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // The original thin metal edge remains visible under the spell.
    g.globalAlpha = glow;
    g.strokeStyle = '#f6cd78';
    g.lineWidth = 1.7;
    roundRect(g, x, y, w, h, 10);
    g.stroke();

    const sealSize = Math.min(13, w / 8, h / 8);
    for (const [cx, cy] of [[x - 5, y - 5], [x + w + 5, y - 5], [x + w + 5, y + h + 5], [x - 5, y + h + 5]]) {
      g.save();
      g.translate(cx!, cy!);
      const aura = g.createRadialGradient(0, 0, 1, 0, 0, sealSize * 3);
      aura.addColorStop(0, 'rgba(255, 219, 126, 0.8)');
      aura.addColorStop(0.3, 'rgba(255, 166, 38, 0.4)');
      aura.addColorStop(1, 'rgba(240, 107, 16, 0)');
      g.globalAlpha = glow * breath;
      g.fillStyle = aura;
      g.fillRect(-sealSize * 3, -sealSize * 3, sealSize * 6, sealSize * 6);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#573018';
      g.strokeStyle = '#ffdb86';
      g.lineWidth = 1.5;
      g.fillRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
      g.strokeRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
      g.beginPath();
      g.arc(0, 0, sealSize, time * 2, time * 2 + Math.PI * 0.7);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, sealSize, time * 2 + Math.PI, time * 2 + Math.PI * 1.7);
      g.stroke();
      g.fillStyle = '#fff0b6';
      g.fillRect(-2, -2, 4, 4);
      g.restore();
    }
    g.restore();
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
