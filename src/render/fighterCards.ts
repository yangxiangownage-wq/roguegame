import type { Battle } from '@/game/battle';
import { boardMetrics, type BoardSettings } from '@/config/board';

export const CARD_W = 268;
export const CARD_H = 500;
const CARD_GAP = 36;

/** Bleed beneath the opaque gold rim so filtering cannot reveal the stage. */
const INNER = { x: 0.025, y: 0.01, w: 0.95, h: 0.98 };

type FighterDef = {
  src: string;
  name: string;
  atk: number;
  statLabel?: string;
  hp: number;
  maxHp: number;
  inner: string;
};

const FIGHTERS: FighterDef[] = [
  {
    src: '/assets/chars/hero.png',
    name: '夜羽',
    atk: 13,
    hp: 20,
    maxHp: 20,
    inner: '#34423d',
  },
  {
    src: '/assets/chars/foe.png',
    name: '缝偶',
    atk: 8,
    hp: 5,
    maxHp: 20,
    inner: '#58352e',
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

// Preserve the stage's painted art; use quiet, antique-gold HUD typography.
const LABEL_FONT = '"PingFang SC", "Hiragino Sans GB", sans-serif';
const GOLD = '#b49156';
const IVORY = '#f4e6c9';

export class FighterCards {
  private readonly cards: HTMLCanvasElement[] = [];
  private readonly fighters = FIGHTERS.map(f => ({ ...f }));
  private battleRevision = -1;
  private constructor(
    private readonly portraits: HTMLImageElement[],
    private readonly frame: HTMLImageElement,
  ) {
    // The portraits and stats are static: rasterize once at the maximum stage DPR.
    for (let i = 0; i < FIGHTERS.length; i++) {
      const card = document.createElement('canvas');
      card.width = CARD_W * 2;
      card.height = CARD_H * 2;
      const context = card.getContext('2d');
      if (!context) throw new Error('fighter canvas unavailable');
      context.scale(2, 2);
      this.drawCard(context, 0, 0, i);
      this.cards.push(card);
    }
  }

  static async create(): Promise<FighterCards> {
    const [portraits, frame] = await Promise.all([
      Promise.all(FIGHTERS.map((f) => loadImage(f.src))),
      loadImage('/assets/ui/card-frame.png'),
    ]);
    return new FighterCards(portraits, frame);
  }

  setBattle(battle: Battle): void {
    if (this.battleRevision === battle.revision) return;
    this.battleRevision = battle.revision;
    Object.assign(this.fighters[0]!, { hp: battle.heroHp, maxHp: battle.heroMaxHp, atk: battle.block, statLabel: '格挡' });
    Object.assign(this.fighters[1]!, { hp: battle.foeHp, maxHp: battle.foeMaxHp, atk: battle.intent, statLabel: '攻击' });
    for (let i = 0; i < this.cards.length; i++) {
      const canvas = this.cards[i]!;
      const g = canvas.getContext('2d')!;
      g.clearRect(0, 0, CARD_W, CARD_H);
      this.drawCard(g, 0, 0, i);
    }
  }

  draw(g: CanvasRenderingContext2D, s: BoardSettings): void {
    const m = boardMetrics(s);
    const baseY = Math.round(m.originY + (m.spanH - CARD_H) / 2);
    const leftX = m.originX - CARD_GAP - CARD_W + s.heroNudgeX;
    const rightX = m.originX + m.spanW + CARD_GAP + s.foeNudgeX;
    g.save();
    g.shadowColor = 'rgba(12, 5, 7, 0.6)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 12;
    g.drawImage(this.cards[0]!, leftX, baseY + s.heroNudgeY, CARD_W, CARD_H);
    g.drawImage(this.cards[1]!, rightX, baseY + s.foeNudgeY, CARD_W, CARD_H);
    g.restore();
  }

  private drawCard(g: CanvasRenderingContext2D, x: number, y: number, i: number): void {
    const f = this.fighters[i]!;
    const portrait = this.portraits[i]!;
    const w = CARD_W;
    const h = CARD_H;
    const ix = x + w * INNER.x;
    const iy = y + h * INNER.y;
    const iw = w * INNER.w;
    const ih = h * INNER.h;

    g.save();
    roundRect(g, ix, iy, iw, ih, 18);
    g.clip();

    const backdrop = g.createRadialGradient(x + w * 0.5, y + 130, 12, x + w * 0.5, y + 190, 290);
    backdrop.addColorStop(0, f.inner);
    backdrop.addColorStop(1, '#151311');
    g.fillStyle = backdrop;
    g.fillRect(ix, iy, iw, ih);

    // Cover the portrait window; the frame masks the edges, the footer masks the bust.
    const portraitHeight = 376;
    const scale = Math.max(iw / portrait.naturalWidth, portraitHeight / portrait.naturalHeight);
    const dw = portrait.naturalWidth * scale;
    const dh = portrait.naturalHeight * scale;
    g.drawImage(portrait, x + (w - dw) / 2, iy + 4, dw, dh);

    const fade = g.createLinearGradient(0, y + 282, 0, y + 382);
    fade.addColorStop(0, 'rgba(23, 18, 17, 0)');
    fade.addColorStop(0.7, 'rgba(23, 18, 17, 0.88)');
    fade.addColorStop(1, '#171211');
    g.fillStyle = fade;
    g.fillRect(ix, y + 282, iw, 100);
    g.fillStyle = '#171211';
    g.fillRect(ix, y + 382, iw, h - 382);

    // Name and attack share a baseline, outside the portrait's focal area.
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = IVORY;
    g.font = `600 26px ${LABEL_FONT}`;
    g.fillText(f.name, x + 30, y + 372);
    g.fillStyle = '#bcaa8b';
    g.font = `500 12px ${LABEL_FONT}`;
    g.fillText(f.statLabel ?? '攻击', x + 170, y + 374);
    g.textAlign = 'right';
    g.fillStyle = IVORY;
    g.font = '600 27px Georgia, serif';
    g.fillText(String(f.atk), x + w - 30, y + 373);

    const rule = g.createLinearGradient(x + 30, 0, x + w - 30, 0);
    rule.addColorStop(0, '#5c4931');
    rule.addColorStop(0.5, GOLD);
    rule.addColorStop(1, '#5c4931');
    g.fillStyle = rule;
    g.fillRect(x + 30, y + 398, w - 60, 1);

    const hp = Math.max(0, Math.min(f.hp, f.maxHp));
    const ratio = f.maxHp > 0 ? hp / f.maxHp : 0;
    const low = ratio > 0 && ratio <= 0.25;
    g.textAlign = 'left';
    g.fillStyle = low ? '#e9a08b' : '#bcaa8b';
    g.font = `500 13px ${LABEL_FONT}`;
    g.fillText(low ? '生命 · 濒危' : '生命', x + 30, y + 418);
    g.textAlign = 'right';
    g.fillStyle = IVORY;
    g.font = '600 18px Georgia, serif';
    g.fillText(`${hp} / ${f.maxHp}`, x + w - 30, y + 418);

    const barX = x + 30;
    const barY = y + 437;
    const barW = w - 60;
    const barH = 16;
    roundRect(g, barX, barY, barW, barH, 4);
    g.fillStyle = '#0e0d0c';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = '#846740';
    g.stroke();
    // Clip the fill so zero HP is truly empty and tiny values remain proportional.
    g.save();
    roundRect(g, barX + 3, barY + 3, barW - 6, barH - 6, 2);
    g.clip();
    const fill = g.createLinearGradient(0, barY + 3, 0, barY + barH - 3);
    fill.addColorStop(0, low ? '#e88465' : '#c96550');
    fill.addColorStop(0.45, low ? '#c54b38' : '#a73f35');
    fill.addColorStop(1, '#6f2527');
    g.fillStyle = fill;
    g.fillRect(barX + 3, barY + 3, (barW - 6) * ratio, barH - 6);
    g.fillStyle = 'rgba(22, 12, 12, 0.5)';
    for (let n = 1; n < 4; n++) {
      g.fillRect(barX + 3 + (barW - 6) * n / 4, barY + 3, 1, barH - 6);
    }
    g.restore();
    g.restore();

    // Keep the existing ornamental frame, with a restrained brass tint.
    g.save();
    g.filter = 'saturate(0.62)';
    g.drawImage(this.frame, x, y, w, h);
    g.restore();
  }
}
