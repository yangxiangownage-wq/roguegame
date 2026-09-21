import { boardMetrics, type BoardSettings } from '@/config/board';

export const CARD_W = 268;
export const CARD_H = 520;
const CARD_GAP = 36;

type FighterDef = {
  src: string;
  name: string;
  atk: number;
  hp: number;
  maxHp: number;
  inner: string;
  atkColor: string;
};

const FIGHTERS: FighterDef[] = [
  {
    src: '/assets/chars/hero.png',
    name: '夜羽',
    atk: 13,
    hp: 20,
    maxHp: 20,
    inner: '#2a5560',
    atkColor: '#3ecf8a',
  },
  {
    src: '/assets/chars/foe.png',
    name: '缝偶',
    atk: 8,
    hp: 5,
    maxHp: 20,
    inner: '#7a3430',
    atkColor: '#e25a4a',
  },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
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

export class FighterCards {
  private constructor(private readonly portraits: HTMLImageElement[]) {}

  static async create(): Promise<FighterCards> {
    const portraits = await Promise.all(FIGHTERS.map((f) => loadImage(f.src)));
    return new FighterCards(portraits);
  }

  draw(g: CanvasRenderingContext2D, s: BoardSettings): void {
    const m = boardMetrics(s);
    const y = Math.round(m.y + (m.spanH - CARD_H) / 2);
    const leftX = m.x - CARD_GAP - CARD_W;
    const rightX = m.x + m.spanW + CARD_GAP;
    this.drawCard(g, leftX, y, 0);
    this.drawCard(g, rightX, y, 1);
  }

  private drawCard(g: CanvasRenderingContext2D, x: number, y: number, i: number): void {
    const f = FIGHTERS[i]!;
    const portrait = this.portraits[i]!;
    const w = CARD_W;
    const h = CARD_H;

    roundRect(g, x, y, w, h, 18);
    g.fillStyle = '#1c1410';
    g.fill();
    g.strokeStyle = '#c4a05a';
    g.lineWidth = 3;
    g.stroke();

    const inset = 10;
    roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, 12);
    g.fillStyle = f.inner;
    g.fill();

    const portX = x + 18;
    const portY = y + 72;
    const portW = w - 36;
    const portH = 340;
    g.save();
    roundRect(g, portX, portY, portW, portH, 8);
    g.clip();
    const iw = portrait.naturalWidth;
    const ih = portrait.naturalHeight;
    const scale = Math.max(portW / iw, portH / ih) * 1.08;
    const dw = iw * scale;
    const dh = ih * scale;
    g.drawImage(portrait, portX + (portW - dw) / 2, portY + portH - dh + 8, dw, dh);
    g.restore();

    g.fillStyle = f.atkColor;
    g.font = '700 42px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(f.atk), x + w / 2 - 18, y + 42);
    this.drawSword(g, x + w / 2 + 28, y + 42, f.atkColor);

    const barX = x + 22;
    const barY = y + h - 78;
    const barW = w - 44;
    const barH = 28;
    roundRect(g, barX, barY, barW, barH, 6);
    g.fillStyle = '#2a1814';
    g.fill();
    const fillW = Math.max(8, (barW - 4) * (f.hp / f.maxHp));
    roundRect(g, barX + 2, barY + 2, fillW, barH - 4, 5);
    g.fillStyle = '#c4453a';
    g.fill();
    g.fillStyle = '#f4ece0';
    g.font = '700 20px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(f.hp), x + w / 2, barY + barH / 2);

    g.fillStyle = '#ead9b0';
    g.font = '700 22px "PingFang SC", "Hiragino Sans GB", sans-serif';
    g.fillText(f.name, x + w / 2, y + h - 32);
  }

  private drawSword(g: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.7);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -16);
    g.lineTo(6, 4);
    g.lineTo(2, 4);
    g.lineTo(2, 14);
    g.lineTo(-2, 14);
    g.lineTo(-2, 4);
    g.lineTo(-6, 4);
    g.closePath();
    g.fill();
    g.restore();
  }
}
