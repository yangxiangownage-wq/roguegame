import { Battle, CARD_DEFS, type BattleCard } from '@/game/battle';
import type { StoneBoard } from '@/render/board';
import { battleLayout, boardTarget, isBoardArea } from '@/config/battleLayout';
import { clientToDesign, computeDesignFit } from '@/config/design';
import type { BoardSettings } from '@/config/board';
import './battle.css';

type Pose = { x: number; y: number; angle: number; scale: number };
type CardNode = {
  card: BattleCard; element: HTMLButtonElement; pose: Pose;
  vx: number; vy: number; va: number; vs: number;
  destination?: { x: number; y: number };
  origin?: Pose;
  press: number; release: number;
  state: 'hand' | 'play' | 'discard'; elapsed: number; delay: number;
};
const ART = { hero: '/assets/chars/hero.png', foe: '/assets/chars/foe.png', sword: '/assets/icons/attack.png', slave: '/assets/chars/slave.png' };
const DRAW_POSE: Pose = { x: 245, y: 965, angle: -24, scale: 0.32 };
const DISCARD_POSE: Pose = { x: 1590, y: 965, angle: 24, scale: 0.32 };
const PLAY_FLIGHT = 0.34;
const DISCARD_SETTLE = 0.72;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export class BattleView {
  readonly battle = new Battle();
  private readonly root = document.createElement('section');
  private readonly hand = document.createElement('div');
  private readonly placementTarget = document.createElement('div');
  private target: ReturnType<typeof boardTarget> = null;
  private readonly handToggle = document.createElement('button');
  private readonly handSurface = document.createElement('div');
  private expanded = true;
  private readonly energy = document.createElement('div');
  private readonly end = document.createElement('button');
  private readonly drawPile = document.createElement('button');
  private readonly discardPile = document.createElement('button');
  private readonly intent = document.createElement('div');
  private readonly guard = document.createElement('div');
  private readonly turn = document.createElement('div');
  private readonly notice = document.createElement('div');
  private readonly live = document.createElement('div');
  private readonly result = document.createElement('div');
  private readonly pileDialog = document.createElement('div');
  private readonly nodes = new Map<number, CardNode>();
  /** Exit flights whose card id was drawn again before the animation finished. */
  private readonly departing: CardNode[] = [];
  private hover: number | null = null;
  private selected: number | null = null;
  private drag: { id: number; pointer: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  private noticeTimer = 0;
  private resultTimer = 0;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly settings: BoardSettings, private readonly board: StoneBoard) {
    this.root.className = 'battle-ui';
    this.root.setAttribute('aria-label', '卡牌战斗');
    this.hand.className = 'battle-hand';
    this.placementTarget.className = 'battle-placement-target';
    this.placementTarget.hidden = true;
    this.hand.id = 'battle-hand';
    this.handToggle.className = 'battle-hand-toggle';
    this.handToggle.setAttribute('aria-controls', this.hand.id);
    this.handToggle.addEventListener('click', () => this.toggleHand());
    this.handSurface.className = 'battle-hand-surface';
    this.handSurface.setAttribute('aria-hidden', 'true');
    this.hand.setAttribute('aria-label', '手牌');
    this.energy.className = 'battle-energy';
    this.end.className = 'battle-end';
    this.end.textContent = '结束回合';
    this.end.title = '结束回合（E）';
    this.end.addEventListener('click', () => this.endTurn());
    this.drawPile.className = 'battle-pile battle-pile--draw';
    this.discardPile.className = 'battle-pile battle-pile--discard';
    this.drawPile.addEventListener('click', () => this.showPile('draw'));
    this.discardPile.addEventListener('click', () => this.showPile('discard'));
    this.intent.className = 'battle-intent';
    this.guard.className = 'battle-guard';
    this.turn.className = 'battle-turn';
    this.notice.className = 'battle-notice';
    this.live.className = 'battle-sr-only';
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    this.result.className = 'battle-result';
    this.result.hidden = true;
    this.result.setAttribute('role', 'dialog');
    this.result.setAttribute('aria-modal', 'true');
    this.result.setAttribute('aria-label', '战斗结果');
    this.pileDialog.className = 'battle-pile-dialog';
    this.pileDialog.hidden = true;
    this.pileDialog.setAttribute('role', 'dialog');
    this.pileDialog.setAttribute('aria-modal', 'true');
    this.root.append(this.turn, this.intent, this.guard, this.energy, this.drawPile, this.discardPile, this.end, this.handSurface, this.hand, this.placementTarget, this.handToggle, this.notice, this.live, this.result, this.pileDialog);
    document.getElementById('design-root')!.append(this.root);
    window.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.drag || !this.pileDialog.hidden || !this.result.hidden) return;
      // Canvas clicks are already routed through GameApp; controls retain their actions.
      if (event.target instanceof Element && event.target.closest('canvas, button, input, select, textarea, .inspector, [role="dialog"]')) return;
      const p = this.point(event);
      this.targetClick(p.x, p.y);
    });
    window.addEventListener('pointermove', event => this.pointerMove(event));
    this.root.addEventListener('pointerup', event => this.pointerUp(event));
    this.root.addEventListener('pointercancel', () => this.cancel());
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('keydown', event => this.keyDown(event));
    this.sync();
    this.message('点击棋盘或背景切换手牌，选牌后点击空格放置');
  }

  private toggleHand(): void {
    const next = !this.expanded;
    this.cancel();
    this.setExpanded(next);
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.root.classList.toggle('is-hand-open', expanded);
    this.handToggle.setAttribute('aria-expanded', String(expanded));
    this.handToggle.textContent = `${expanded ? '收起手牌' : '展开手牌'} · ${this.battle.hand.length} 张`;
    this.handSurface.style.pointerEvents = expanded ? 'auto' : 'none';
    if (!expanded && this.hand.contains(document.activeElement)) this.handToggle.focus({ preventScroll: true });
    for (const node of this.nodes.values()) {
      const interactive = expanded && node.state === 'hand' && this.battle.phase === 'player';
      node.element.tabIndex = interactive ? 0 : -1;
      node.element.setAttribute('aria-hidden', String(!interactive));
      // Preserve the captured card's pointer stream while withdrawing the rest.
      if (!interactive && this.drag?.id !== node.card.id) node.element.style.pointerEvents = 'none';
    }
  }

  private point(event: PointerEvent) { return clientToDesign(event.clientX, event.clientY, computeDesignFit()); }
  private message(text: string): void {
    this.notice.textContent = text;
    this.live.textContent = text;
    this.noticeTimer = 4;
    this.notice.classList.add('is-visible');
  }
  private createNode(card: BattleCard, delay: number): CardNode {
    const def = CARD_DEFS[card.key];
    const element = document.createElement('button');
    element.className = `hand-card hand-card--${def.tone}`;
    element.dataset.cardId = String(card.id);
    element.style.pointerEvents = 'none';
    element.setAttribute('aria-label', `${def.title}，${def.cost} 点能量，向空格放入 1 个剑标记。`);
    element.innerHTML = `<span class="hand-card__art"><img src="${ART[def.art]}" alt="" draggable="false"></span><span class="hand-card__frame"></span><span class="hand-card__cost">${def.cost}</span><span class="hand-card__title">${def.title}</span><span class="hand-card__kind">填格</span><span class="hand-card__description">放入 1 个剑标记。</span>`;
    element.addEventListener('pointerenter', () => { if (this.expanded && !this.drag && this.battle.phase === 'player') this.hover = card.id; });
    element.addEventListener('focus', () => { if (this.expanded && this.battle.phase === 'player') this.hover = card.id; });
    element.addEventListener('blur', () => { if (!this.drag && this.hover === card.id) this.hover = null; });
    element.addEventListener('pointerdown', event => {
      if (!this.expanded || event.button !== 0 || this.battle.phase !== 'player' || !this.pileDialog.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      const p = this.point(event);
      this.drag = { id: card.id, pointer: event.pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false };
      this.selected = this.hover = card.id;
      element.setPointerCapture(event.pointerId);
      this.root.classList.add('is-dragging');
    });
    element.addEventListener('click', event => {
      if (!this.expanded || event.detail !== 0 || this.nodes.get(card.id)?.state !== 'hand') return;
      this.hover = card.id;
      this.selected = null;
    });
    this.hand.append(element);
    const node: CardNode = { card, element, pose: { ...DRAW_POSE }, vx: 0, vy: 0, va: 0, vs: 0, state: 'hand', press: 0, release: 1, elapsed: 0, delay };
    this.nodes.set(card.id, node);
    return node;
  }

  private sync(): void {
    const b = this.battle;
    let index = 0;
    for (const card of b.hand) {
      const previous = this.nodes.get(card.id);
      // The same card can be drawn again while its discard flight is still playing.
      if (previous && previous.state !== 'hand') {
        this.departing.push(previous);
        this.nodes.delete(card.id);
      }
      if (!this.nodes.has(card.id)) this.createNode(card, index++ * 0.075);
    }
    for (const node of this.nodes.values()) {
      const def = CARD_DEFS[node.card.key];
      const unavailable = b.energy < def.cost;
      node.element.classList.toggle('is-unaffordable', unavailable);
      node.element.setAttribute('aria-disabled', String(b.phase !== 'player' || unavailable));
      node.element.tabIndex = this.expanded && b.phase === 'player' && node.state === 'hand' ? 0 : -1;
    }
    this.setExpanded(this.expanded);
    this.energy.innerHTML = `<strong>${b.energy}<small> / ${b.turnEnergy}</small></strong><span>能量${b.nextEnergy ? ` · 下回合 +${b.nextEnergy}` : ''}</span>`;
    this.energy.setAttribute('aria-label', `剩余 ${b.energy} 点能量`);
    this.drawPile.innerHTML = `<span class="battle-pile__back"></span><strong>${b.drawPile.length}</strong><span>抽牌堆</span>`;
    this.discardPile.innerHTML = `<span class="battle-pile__back"></span><strong>${b.discardPile.length}</strong><span>弃牌堆</span>`;
    this.drawPile.setAttribute('aria-label', `查看抽牌堆，${b.drawPile.length} 张`);
    this.discardPile.setAttribute('aria-label', `查看弃牌堆，${b.discardPile.length} 张`);
    this.end.disabled = b.phase !== 'player';
    this.end.textContent = b.phase === 'enemy' ? '敌人行动中' : '结束回合';
    this.turn.innerHTML = `<span>第 ${b.turn} 回合</span><small>${b.phase === 'player' ? '你的回合' : b.phase === 'enemy' ? '敌人回合' : '战斗结束'}</small>`;
    this.intent.innerHTML = `<span>攻击意图</span><strong>${b.intent}</strong><small>伤害</small>`;
    this.guard.textContent = `格挡 ${b.block}`;
    this.guard.classList.toggle('is-active', b.block > 0);
    if (b.phase === 'won' || b.phase === 'lost') this.resultTimer = 0.65;
  }

  private canDrop(id: number, x: number, y: number): boolean {
    const target = boardTarget(this.settings, x, y);
    return this.nodes.has(id) && target !== null && !this.board.hasPiece(target.col, target.row);
  }
  private previewTarget(x: number, y: number): void {
    this.target = boardTarget(this.settings, x, y);
    const target = this.target;
    this.placementTarget.hidden = target === null;
    if (!target) return;
    this.placementTarget.style.left = `${target.x}px`;
    this.placementTarget.style.top = `${target.y}px`;
    this.placementTarget.style.width = `${target.size}px`;
    this.placementTarget.style.height = `${target.size}px`;
    const occupied = this.board.hasPiece(target.col, target.row);
    this.placementTarget.classList.toggle('is-invalid', occupied);
    this.placementTarget.textContent = occupied ? '已占用' : '放置';
  }
  private pointerMove(event: PointerEvent): void {
    const p = this.point(event);
    if (this.selected !== null) this.previewTarget(p.x, p.y);
    if (!this.drag) {
      if (!this.expanded || this.battle.phase !== 'player' || !this.pileDialog.hidden || !this.result.hidden) return;
      const count = this.battle.hand.length;
      const spread = this.handSpread(count);
      const index = Math.round((p.x - 960) / spread + (count - 1) / 2);
      const overCard = event.target instanceof Element && !!event.target.closest('.hand-card');
      if ((p.y > 720 || overCard) && p.y < 1080 && index >= 0 && index < count) this.hover = this.battle.hand[index]!.id;
      else this.hover = null;
      return;
    }
    if (event.pointerId !== this.drag.pointer) return;
    Object.assign(this.drag, p);
    if (!this.drag.moved && Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY) > 10) {
      this.drag.moved = true;
      this.setExpanded(false);
    }
    this.previewTarget(p.x, p.y);
  }
  private pointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const p = this.point(event);
    this.drag = null;
    this.root.classList.remove('is-dragging');
    this.intent.classList.remove('is-targeted');
    const node = this.nodes.get(drag.id);
    if (node?.element.hasPointerCapture(event.pointerId)) node.element.releasePointerCapture(event.pointerId);
    if (node) node.release = 0;
    if (drag.moved) {
      if (this.canDrop(drag.id, p.x, p.y)) this.play(drag.id, p.x, p.y);
      else this.rejectPlacement(drag.id, '请放入空格，已占用的格子不能重复放置');
    } else {
      this.selected = null;
      this.hover = drag.id;
    }
  }

  /** Failed placement returns the card to its fan slot and brings the hand back. */
  private rejectPlacement(_id: number, message: string): void {
    const drag = this.drag;
    this.drag = null;
    if (drag) {
      const element = this.nodes.get(drag.id)?.element;
      if (element?.hasPointerCapture(drag.pointer)) element.releasePointerCapture(drag.pointer);
    }
    this.hover = this.selected = null;
    this.target = null;
    this.placementTarget.hidden = true;
    this.root.classList.remove('is-dragging');
    this.intent.classList.remove('is-targeted');
    this.setExpanded(true);
    this.message(message);
  }

  private cancel(collapseHand = true): void {
    const drag = this.drag;
    this.drag = null;
    if (drag) {
      const element = this.nodes.get(drag.id)?.element;
      if (element?.hasPointerCapture(drag.pointer)) element.releasePointerCapture(drag.pointer);
    }
    this.hover = this.selected = null;
    if (collapseHand) this.setExpanded(false);
    this.target = null;
    this.placementTarget.hidden = true;
    this.root.classList.remove('is-dragging');
    this.intent.classList.remove('is-targeted');
  }

  /** Placement consumes the click before the board handles ordinary hover feedback. */
  targetClick(x: number, y: number): boolean {
    if (x < 0 || x > 1920 || y < 0 || y > 1080 || !this.pileDialog.hidden || !this.result.hidden) return false;
    if (!isBoardArea(this.settings, x, y)) {
      this.toggleHand();
      return true;
    }
    if (this.selected === null) this.toggleHand();
    else if (this.canDrop(this.selected, x, y)) this.play(this.selected, x, y);
    else this.rejectPlacement(this.selected, '请放入空格，已占用的格子不能重复放置');
    return true;
  }
  private play(id: number, x: number, y: number): void {
    const node = this.nodes.get(id);
    if (!node || node.state !== 'hand') return;
    const target = boardTarget(this.settings, x, y);
    if (!target || this.board.hasPiece(target.col, target.row)) {
      this.rejectPlacement(id, '请放入空格，已占用的格子不能重复放置');
      return;
    }
    const result = this.battle.placeCard(id);
    if (!result.ok) {
      this.rejectPlacement(id, result.message);
      node.element.animate([{ translate: '-8px 0' }, { translate: '7px 0' }, { translate: '0 0' }], { duration: this.reduced.matches ? 1 : 240 });
      return;
    }
    // Clear the pending target without tucking the rest of the hand.
    this.cancel(false);
    // Reserve the cell immediately; reveal it exactly when the card lands.
    this.board.place(target.col, target.row, this.reduced.matches ? 0 : PLAY_FLIGHT);
    node.origin = { ...node.pose };
    node.element.classList.add('is-playing');
    node.destination = { x: target.x + target.size / 2, y: target.y + target.size / 2 };
    node.state = 'play';
    node.elapsed = 0;
    node.element.style.pointerEvents = 'none';
    node.element.setAttribute('aria-hidden', 'true');
    this.message(`${result.message}：已放入第 ${target.row + 1} 行、第 ${target.col + 1} 列`);
    this.sync();
    this.setExpanded(true);
  }
  private endTurn(): void {
    if (!this.pileDialog.hidden || !this.result.hidden || this.battle.phase !== 'player') return;
    // Drop a pending placement, but keep the hand open so the new cards fan out.
    this.cancel(false);
    const leaving = [...this.nodes.values()].filter(node => node.state === 'hand');
    leaving.sort((a, b) => this.battle.hand.findIndex(card => card.id === a.card.id) - this.battle.hand.findIndex(card => card.id === b.card.id));
    leaving.forEach((node, i) => {
      // A tucked hand sits below the stage, so the flight would never be seen.
      const tucked = node.pose.y > 1000;
      const origin = tucked ? this.fanPose(i, leaving.length) : node.pose;
      node.origin = { ...origin };
      if (tucked) node.pose = { ...origin };
      node.vx = node.vy = node.va = node.vs = 0;
      node.state = 'discard';
      node.elapsed = -i * 0.075;
      node.element.style.pointerEvents = 'none';
      node.element.setAttribute('aria-hidden', 'true');
    });
    this.battle.nextPlacementTurn();
    this.setExpanded(true);
    this.message('手牌和能量已补充，棋盘内容保留');
    this.sync();
  }

  private showResult(): void {
    this.pileDialog.hidden = true;
    this.result.hidden = false;
    const won = this.battle.phase === 'won';
    this.result.innerHTML = `<div class="battle-result__panel"><span>战斗结束</span><h1>${won ? '胜利' : '落幕'}</h1><p>${won ? '缝偶已被击败。' : '夜羽倒下了，再试一次。'}</p><p>经过 ${this.battle.turn} 回合 · 剩余生命 ${this.battle.heroHp} / ${this.battle.heroMaxHp}</p><button>再战一场</button></div>`;
    const restart = this.result.querySelector('button')!;
    restart.addEventListener('click', () => {
      this.cancel(false);
      for (const node of this.nodes.values()) node.element.remove();
      for (const node of this.departing) node.element.remove();
      this.nodes.clear();
      this.departing.length = 0;
      this.resultTimer = 0;
      this.battle.reset();
      this.result.hidden = true;
      this.setExpanded(true);
      this.sync();
      this.message('新的战斗开始');
      this.end.focus();
    });
    restart.focus();
  }
  private showPile(kind: 'draw' | 'discard'): void {
    this.cancel();
    const pile = kind === 'draw' ? this.battle.drawPile : this.battle.discardPile;
    const counts = new Map<string, number>();
    for (const card of pile) { const title = CARD_DEFS[card.key].title; counts.set(title, (counts.get(title) ?? 0) + 1); }
    this.pileDialog.hidden = false;
    this.pileDialog.setAttribute('aria-label', kind === 'draw' ? '抽牌堆' : '弃牌堆');
    this.pileDialog.innerHTML = `<div><h2>${kind === 'draw' ? '抽牌堆' : '弃牌堆'} · ${pile.length} 张</h2><p>${kind === 'draw' ? '仅显示组成，抽取顺序随机。' : '抽牌堆耗尽时，这些牌会洗回抽牌堆。'}</p><ul>${[...counts.entries()].map(([title, count]) => `<li><span>${title}</span><strong>× ${count}</strong></li>`).join('') || '<li>暂无卡牌</li>'}</ul><button>返回战斗</button></div>`;
    const close = this.pileDialog.querySelector('button')!;
    close.addEventListener('click', () => { this.pileDialog.hidden = true; (kind === 'draw' ? this.drawPile : this.discardPile).focus(); });
    close.focus();
  }
  private keyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, .inspector')) return;
    if (!this.result.hidden || !this.pileDialog.hidden) {
      if (event.key === 'Escape' && !this.pileDialog.hidden) { this.pileDialog.hidden = true; this.drawPile.focus(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        (!this.result.hidden ? this.result : this.pileDialog).querySelector('button')?.focus();
      }
      return;
    }
    if (event.key === 'Escape') this.cancel();
    if (event.key.toLowerCase() === 'e' && !event.repeat) { event.preventDefault(); this.endTurn(); }
    if (event.key === 'Enter' && this.selected !== null && this.target && !event.repeat) { event.preventDefault(); this.play(this.selected, this.target.x + 1, this.target.y + 1); }
  }

  private handSpread(count: number): number {
    const base = Math.min(170, 1000 / Math.max(1, count - 1));
    return base * (this.settings.handCardSpread / 100);
  }

  private fanPose(index: number, count: number): Pose {
    const offset = index - (count - 1) / 2;
    const spread = this.handSpread(count);
    return {
      x: 960 + offset * spread,
      y: 860 + Math.abs(offset) * 6 - this.settings.handCardY,
      angle: offset * 3,
      scale: 1,
    };
  }

  update(dt: number): void {
    if (this.resultTimer > 0) { this.resultTimer -= dt; if (this.resultTimer <= 0) this.showResult(); }
    if (this.noticeTimer > 0) { this.noticeTimer -= dt; if (this.noticeTimer <= 0) this.notice.classList.remove('is-visible'); }
    const layout = battleLayout(this.settings);
    this.intent.style.left = `${layout.foeX}px`;
    this.intent.style.top = `${layout.foeTop - 52}px`;
    this.guard.style.left = `${layout.heroX}px`;
    this.guard.style.top = `${layout.heroBottom + 16}px`;
    // Transparent target extends across the portrait, while its text sits above it.
    this.intent.style.setProperty('--target-height', `${layout.foeBottom - layout.foeTop + 100}px`);
    this.intent.hidden = true;
    this.guard.hidden = true;
    const actors = [...this.nodes.values(), ...this.departing];
    for (const node of actors) {
      const id = node.card.id;
      node.elapsed += dt;
      const index = this.battle.hand.findIndex(card => card.id === id);
      const offset = index - (this.battle.hand.length - 1) / 2;
      const spread = this.handSpread(this.battle.hand.length);
      const lift = this.settings.handCardY;
      const active = id === this.hover || id === this.selected;
      const hoverIndex = this.hover === null ? -1 : this.battle.hand.findIndex(card => card.id === this.hover);
      const pressed = this.drag?.id === id && !this.drag.moved;
      let target: Pose = { x: 960 + offset * spread, y: (this.expanded ? 860 + Math.abs(offset) * 6 : 1230) - lift, angle: offset * 3, scale: this.expanded ? 1 : 0.72 };
      if (this.expanded && hoverIndex >= 0 && id !== this.hover) target.x += Math.sign(index - hoverIndex) * 24 * (this.settings.handCardSpread / 100);
      if (this.expanded && (id === this.hover || pressed)) target = { ...target, y: 813 - lift, angle: 0, scale: 1.08 };
      if (this.drag?.id === id && this.drag.moved) target = { x: this.drag.x, y: this.drag.y - 55, angle: Math.max(-12, Math.min(12, node.vx * 0.018)), scale: 0.65 };
      node.press += ((pressed ? 1 : 0) - node.press) * (1 - Math.exp(-24 * dt));
      node.release = Math.min(1, node.release + dt / 0.28);
      const rebound = Math.sin(node.release * Math.PI) * (1 - node.release) * 0.065;
      let scripted = false;
      if (node.state === 'play') {
        scripted = true;
        const t = this.reduced.matches ? 1 : Math.max(0, node.elapsed);
        const origin = node.origin ?? node.pose;
        const destination = node.destination!;
        const travel = Math.min(1, t / PLAY_FLIGHT);
        const u = travel * travel * (3 - 2 * travel);
        const settle = Math.min(1, Math.max(0, t - PLAY_FLIGHT) / 0.18);
        target = {
          x: mix(origin.x, destination.x, u),
          y: mix(origin.y, destination.y, u) - Math.sin(travel * Math.PI) * 65,
          angle: mix(origin.angle, 0, u),
          scale: mix(origin.scale, 0.24, u) * (1 - settle * 0.3),
        };
        node.element.style.opacity = String(1 - ease(settle));
        node.element.style.setProperty('--play-flash', String(Math.sin(travel * Math.PI) * 0.32));
        if (t > PLAY_FLIGHT + 0.18) {
          node.element.remove();
          if (this.nodes.get(id) === node) this.nodes.delete(id);
          continue;
        }
      } else if (node.state === 'discard') {
        const t = this.reduced.matches ? 1 : Math.max(0, node.elapsed);
        target = node.elapsed < 0 ? (node.origin ?? node.pose) : DISCARD_POSE;
        node.element.style.opacity = String(1 - ease(Math.max(0, Math.min(1, (t - 0.45) / 0.25))));
        if (t > DISCARD_SETTLE) {
          node.element.remove();
          if (this.nodes.get(id) === node) this.nodes.delete(id);
          continue;
        }
      } else {
        node.element.style.opacity = node.elapsed < node.delay ? '0' : '1';
        node.element.style.pointerEvents = node.elapsed > node.delay + 0.3 && this.battle.phase === 'player' && (this.expanded || this.drag?.id === id) ? 'auto' : 'none';
        if (node.elapsed < node.delay) continue;
      }
      // Stable, damped spring with small substeps: smooth even after a slow frame.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const step = dt / steps;
      for (let k = 0; k < steps; k++) {
        for (const [key, velocity] of [['x', 'vx'], ['y', 'vy'], ['angle', 'va'], ['scale', 'vs']] as const) {
          if (this.reduced.matches || scripted) { node.pose[key] = target[key]; node[velocity] = 0; }
          else {
            const dragging = this.drag?.id === id;
            const stiffness = dragging ? 460 : 260;
            const damping = dragging ? 32 : 25;
            node[velocity] += ((target[key] - node.pose[key]) * stiffness - node[velocity] * damping) * step;
            node.pose[key] += node[velocity] * step;
          }
        }
      }
      const p = node.pose;
      const tactileScale = this.reduced.matches || scripted ? 1 : 1 - node.press * 0.08 + rebound;
      const cardScale = this.settings.handCardScale / 100;
      node.element.style.transform = `translate3d(${p.x - 100}px, ${p.y - 150}px, 0) rotate(${p.angle}deg) scale(${p.scale * tactileScale * cardScale})`;
      node.element.style.zIndex = String(node.state !== 'hand' ? 40 : active ? 30 : index + 1);
      node.element.classList.toggle('is-selected', active && node.state === 'hand');
      node.element.classList.toggle('is-pressed', !!pressed);
      node.element.classList.toggle('is-dragged', this.drag?.id === id);
    }
    for (let i = this.departing.length - 1; i >= 0; i--) {
      if (!this.departing[i]!.element.isConnected) this.departing.splice(i, 1);
    }
  }
}
