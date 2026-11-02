import { TALK_SCRIPT, type TalkSide } from '@/config/talk';
import './talk.css';

const CHAR_MS = 36; // typewriter cadence

export class TalkView {
  private readonly root = document.createElement('section');
  private readonly left = document.createElement('figure');
  private readonly right = document.createElement('figure');
  private readonly subtitle = document.createElement('div');
  private readonly nameEl = document.createElement('div');
  private readonly textEl = document.createElement('p');
  private readonly hint = document.createElement('div');
  private index = 0;
  private locked = false;
  private open = true;
  private fullText = '';
  private typed = 0;
  private typeClock = 0;
  private lastTypeTs = 0;
  private typing = false;
  private typeRaf = 0;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly onKey = (event: KeyboardEvent) => this.keyDown(event);
  private readonly tickType = (ts: number) => this.onTypeFrame(ts);

  constructor(private readonly onDone: () => void) {
    this.root.className = 'talk-scene';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '开场谈话');
    this.left.className = 'talk-actor talk-actor--left';
    this.right.className = 'talk-actor talk-actor--right';
    this.left.append(portrait('/assets/chars/druid.png', '你'));
    this.right.append(portrait('/assets/chars/elder.png', '老者'));
    this.subtitle.className = 'talk-subtitle';
    this.nameEl.className = 'talk-subtitle__name';
    this.textEl.className = 'talk-subtitle__text';
    this.textEl.setAttribute('aria-live', 'polite');
    this.hint.className = 'talk-subtitle__hint';
    this.subtitle.append(this.nameEl, this.textEl, this.hint);
    this.root.append(this.left, this.right, this.subtitle);
    this.root.addEventListener('click', () => this.advance());
    window.addEventListener('keydown', this.onKey);
    const stage = document.getElementById('design-root')!;
    stage.classList.add('is-talking');
    stage.append(this.root);
    this.showLine(TALK_SCRIPT[0]!.side, true);
  }

  isOpen(): boolean {
    return this.open;
  }

  private actor(side: TalkSide): HTMLElement {
    return side === 'left' ? this.left : this.right;
  }

  private showLine(side: TalkSide, first: boolean): void {
    const line = TALK_SCRIPT[this.index]!;
    this.nameEl.textContent = line.name;
    this.hint.textContent = this.index >= TALK_SCRIPT.length - 1 ? '点击开始' : '点击继续';
    this.startText(line.text);
    if (first) this.enter(side);
  }

  private enter(side: TalkSide): void {
    const show = () => this.actor(side).classList.add('is-on');
    if (this.reduced.matches) {
      show();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(show));
  }

  private startText(text: string): void {
    this.stopTyping();
    this.fullText = text;
    this.typed = 0;
    this.typeClock = 0;
    this.textEl.textContent = '';
    this.hint.classList.remove('is-in');
    requestAnimationFrame(() => this.hint.classList.add('is-in'));
    this.typing = true;
    this.lastTypeTs = performance.now();
    this.typeRaf = requestAnimationFrame(this.tickType);
  }

  private onTypeFrame(ts: number): void {
    if (!this.typing) return;
    this.typeClock += Math.min(64, ts - this.lastTypeTs);
    this.lastTypeTs = ts;
    while (this.typeClock >= CHAR_MS && this.typed < this.fullText.length) {
      this.typeClock -= CHAR_MS;
      this.typed += 1;
    }
    this.textEl.textContent = this.fullText.slice(0, this.typed);
    if (this.typed >= this.fullText.length) {
      this.typing = false;
      return;
    }
    this.typeRaf = requestAnimationFrame(this.tickType);
  }

  private revealText(): void {
    this.stopTyping();
    this.typed = this.fullText.length;
    this.textEl.textContent = this.fullText;
    this.hint.classList.add('is-in');
  }

  private stopTyping(): void {
    this.typing = false;
    if (this.typeRaf) cancelAnimationFrame(this.typeRaf);
    this.typeRaf = 0;
  }

  private advance(): void {
    if (!this.open || this.locked) return;
    if (this.typing) {
      this.revealText();
      return;
    }
    if (this.index >= TALK_SCRIPT.length - 1) {
      this.close();
      return;
    }
    const from = TALK_SCRIPT[this.index]!.side;
    this.index += 1;
    const to = TALK_SCRIPT[this.index]!.side;
    this.showLine(to, false);
    if (from === to) return;
    this.actor(from).classList.remove('is-on');
    this.actor(to).classList.add('is-on');
  }

  private close(): void {
    if (!this.open || this.locked) return;
    this.locked = true;
    this.stopTyping();
    this.left.classList.remove('is-on');
    this.right.classList.remove('is-on');
    const finish = () => {
      if (!this.open) return;
      this.open = false;
      window.removeEventListener('keydown', this.onKey);
      document.getElementById('design-root')?.classList.remove('is-talking');
      this.root.remove();
      this.onDone();
    };
    if (this.reduced.matches) {
      finish();
      return;
    }
    this.root.classList.add('is-leaving');
    window.setTimeout(finish, 420);
  }

  private keyDown(event: KeyboardEvent): void {
    if (!this.open) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) this.advance();
    }
  }
}

function portrait(src: string, alt: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  return img;
}
