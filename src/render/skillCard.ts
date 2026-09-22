import {
  CARD_H,
  CARD_LAYOUT,
  CARD_W,
  type SkillCardData,
} from '@/config/skillCard';

const FRAME_URL = '/assets/cards/frame.png';
const COST_URL = '/assets/cards/cost.png';
const TAG_URL = '/assets/cards/tag.png';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export class SkillCardView {
  private constructor(
    private readonly frame: HTMLImageElement,
    private readonly cost: HTMLImageElement,
    private readonly tag: HTMLImageElement,
  ) {}

  static async create(): Promise<SkillCardView> {
    const [frame, cost, tag] = await Promise.all([
      loadImage(FRAME_URL),
      loadImage(COST_URL),
      loadImage(TAG_URL),
    ]);
    return new SkillCardView(frame, cost, tag);
  }

  drawAssembled(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    data: SkillCardData,
    w = CARD_W,
    h = CARD_H,
  ): void {
    g.drawImage(this.frame, x, y, w, h);

    const L = CARD_LAYOUT;
    const costS = w * L.costSize;
    const cx = x + w * L.costX;
    const cy = y + h * L.costY;
    g.drawImage(this.cost, cx, cy, costS, costS);
    g.fillStyle = '#f4e6c8';
    g.font = `700 ${Math.round(costS * 0.52)}px "Iowan Old Style", "Songti SC", serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(data.cost), cx + costS / 2, cy + costS / 2 + 1);

    g.fillStyle = '#3a2a18';
    g.font = `700 ${Math.round(w * 0.072)}px "PingFang SC", "Hiragino Sans GB", sans-serif`;
    g.fillText(data.title, x + w / 2, y + h * L.titleY);

    const tagW = w * L.tagW;
    const tagH = tagW * (this.tag.naturalHeight / this.tag.naturalWidth);
    const tx = x + (w - tagW) / 2;
    const ty = y + h * L.tagY;
    g.drawImage(this.tag, tx, ty, tagW, tagH);
    g.fillStyle = '#f0e6c8';
    g.font = `700 ${Math.round(tagH * 0.42)}px "PingFang SC", "Hiragino Sans GB", sans-serif`;
    g.fillText(data.tag, tx + tagW / 2, ty + tagH / 2 + 1);
  }

  drawParts(g: CanvasRenderingContext2D, x: number, y: number): void {
    const colW = 220;
    g.fillStyle = '#ead9b0';
    g.font = '700 22px "PingFang SC", "Hiragino Sans GB", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';

    const frameH = colW * (this.frame.naturalHeight / this.frame.naturalWidth);
    g.fillText('边框', x + colW / 2, y);
    g.drawImage(this.frame, x, y + 32, colW, frameH);

    const costY = y + 48 + frameH;
    const costS = 96;
    g.fillText('费用', x + colW / 2, costY);
    g.drawImage(this.cost, x + (colW - costS) / 2, costY + 32, costS, costS);

    const tagY = costY + 32 + costS + 28;
    const tagW = 180;
    const tagH = tagW * (this.tag.naturalHeight / this.tag.naturalWidth);
    g.fillText('词条', x + colW / 2, tagY);
    g.drawImage(this.tag, x + (colW - tagW) / 2, tagY + 32, tagW, tagH);
  }
}
