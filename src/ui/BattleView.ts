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
  destination?: { x: number; y: number; scale: number; col: number; row: number };
  landed?: boolean;
  origin?: Pose;
  press: number; release: number;
  state: 'hand' | 'play' | 'discard'; elapsed: number; delay: number;
  layer: number;
};
const ART = { hero: '/assets/chars/hero.png', foe: '/assets/chars/foe.png', sword: '/assets/icons/attack.png', slave: '/assets/chars/slave.png?v=2' };
const DRAW_POSE: Pose = { x: 245, y: 965, angle: -24, scale: 0.32 };
const DISCARD_POSE: Pose = { x: 1590, y: 965, angle: 24, scale: 0.32 };
const PLAY_FLIGHT = 0.36;
const PLAY_SETTLE = 0.12;
const DISCARD_FLIGHT = 0.48;
const DISCARD_STAGGER = 0.04;
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
  private drag: { id: number; pointer: number; x: number; y: number; startX: number; startY: number; moved: boolean; condensed: boolean } | null = null;
  private noticeTimer = 0;
  private resultTimer = 0;
  private turnPause = 0;
  private turnCue: 'none' | 'enemy-strike' | 'player-deal' = 'none';
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
    const placed = def.art === 'slave' ? '奴隶' : '剑标记';
    element.setAttribute('aria-label', `${def.title}，${def.cost} 点能量，向空格放入 1 个${placed}。`);
    element.innerHTML = `<span class="hand-card__art"><img src="${ART[def.art]}" alt="" draggable="false"></span><span class="hand-card__frame"></span><span class="hand-card__cost">${def.cost}</span><span class="hand-card__title">${def.title}</span><span class="hand-card__kind">填格</span><span class="hand-card__description">放入 1 个${placed}。</span>`;
    element.addEventListener('pointerenter', () => { if (this.expanded && !this.drag && this.battle.phase === 'player') this.hover = card.id; });
    element.addEventListener('focus', () => { if (this.expanded && this.battle.phase === 'player') this.hover = card.id; });
    element.addEventListener('blur', () => { if (!this.drag && this.hover === card.id) this.hover = null; });
    element.addEventListener('pointerdown', event => {
      if (!this.expanded || event.button !== 0 || this.battle.phase !== 'player' || !this.pileDialog.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      const p = this.point(event);
      this.drag = { id: card.id, pointer: event.pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false, condensed: false };
      this.selected = this.hover = card.id;
      element.setPointerCapture(event.pointerId);
      this.root.classList.add('is-dragging');
      this.syncDropHighlight();
    });
    element.addEventListener('click', event => {
      if (!this.expanded || event.detail !== 0 || this.nodes.get(card.id)?.state !== 'hand') return;
      this.hover = card.id;
      this.selected = null;
    });
    this.hand.append(element);
    const node: CardNode = { card, element, pose: { ...this.drawPose() }, vx: 0, vy: 0, va: 0, vs: 0, state: 'hand', press: 0, release: 1, elapsed: 0, delay, layer: 0 };
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
    this.syncMinePreview();
    if (!target) return;
    this.placementTarget.style.left = `${target.x}px`;
    this.placementTarget.style.top = `${target.y}px`;
    this.placementTarget.style.width = `${target.size}px`;
    this.placementTarget.style.height = `${target.size}px`;
    const occupied = this.board.hasPiece(target.col, target.row);
    this.placementTarget.classList.toggle('is-invalid', occupied);
    this.placementTarget.classList.toggle('is-valid', !occupied);
    this.placementTarget.textContent = occupied ? '已占用' : '';
  }

  private syncMinePreview(): void {
    const id = this.drag?.id ?? this.selected;
    const card = id === null ? undefined : this.nodes.get(id)?.card;
    const aiming = card !== undefined && CARD_DEFS[card.key].art === 'slave' && this.target !== null && !this.board.hasPiece(this.target.col, this.target.row);
    this.board.setMinePreview(aiming && this.target ? { col: this.target.col, row: this.target.row } : null);
  }

  private syncDropHighlight(): void {
    // Reveal the destination as soon as a card is picked up, even outside the board.
    const holding = this.drag !== null || this.selected !== null;
    this.board.setDropHighlight(holding);
  }

  private pointerMove(event: PointerEvent): void {
    const p = this.point(event);
    if (this.selected !== null && !this.drag) this.previewTarget(p.x, p.y);
    this.syncDropHighlight();
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
    }
    // Hysteresis avoids flickering between card and piece near the pickup position.
    const distance = Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY);
    this.drag.condensed = distance > (this.drag.condensed ? 32 : 60);
    if (this.expanded === this.drag.condensed) this.setExpanded(!this.drag.condensed);
    if (this.drag.condensed) this.previewTarget(p.x, p.y);
    else {
      this.target = null;
      this.placementTarget.hidden = true;
      this.board.setMinePreview(null);
    }
    this.syncDropHighlight();
  }
  private removeVisual(node: CardNode): void {
    node.element.remove();
  }

  private pointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const p = this.point(event);
    this.drag = null;
    this.root.classList.remove('is-dragging');
    this.intent.classList.remove('is-targeted');
    this.board.setDropHighlight(false);
    const node = this.nodes.get(drag.id);
    if (node?.element.hasPointerCapture(event.pointerId)) node.element.releasePointerCapture(event.pointerId);
    if (node) node.release = 0;
    if (drag.moved && !drag.condensed) {
      // Returning to the pickup slot cancels even if the board lies underneath it.
      this.cancel(false);
      this.setExpanded(true);
      this.hover = drag.id;
    } else if (drag.moved) {
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
    this.board.setMinePreview(null);
    this.root.classList.remove('is-dragging');
    this.intent.classList.remove('is-targeted');
    this.board.setDropHighlight(false);
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
    this.board.setMinePreview(null);
    this.root.classList.remove('is-dragging');
    this.intent.classList.remove('is-targeted');
    this.board.setDropHighlight(false);
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
    const piece = CARD_DEFS[node.card.key].art === 'slave' ? 'slave' : 'mark';
    this.board.place(target.col, target.row, this.reduced.matches ? 0 : PLAY_FLIGHT, piece);
    node.origin = { ...node.pose };
    node.element.classList.add('is-playing');
    node.destination = {
      x: target.x + target.size / 2,
      y: target.y + target.size / 2,
      scale: Math.min(0.42, target.size * 0.82 / 300),
      col: target.col,
      row: target.row,
    };
    node.state = 'play';
    node.elapsed = 0;
    node.element.style.pointerEvents = 'none';
    node.element.setAttribute('aria-hidden', 'true');
    this.message(`${result.message}：已放入第 ${target.row + 1} 行、第 ${target.col + 1} 列`);
    this.sync();
    this.setExpanded(true);
  }
  private endTurn(): void {
    if (!this.pileDialog.hidden || !this.result.hidden || this.battle.phase !== 'player' || this.turnCue !== 'none') return;
    this.cancel(false);
    const leaving = [...this.nodes.values()].filter(node => node.state === 'hand');
    leaving.sort((a, b) => this.battle.hand.findIndex(card => card.id === a.card.id) - this.battle.hand.findIndex(card => card.id === b.card.id));
    leaving.forEach((node, i) => {
      // Fly from the visible pose, including a partially collapsed or hovered hand.
      node.origin = { ...node.pose };
      node.vx = node.vy = node.va = node.vs = 0;
      node.state = 'discard';
      node.layer = leaving.length - i;
      node.elapsed = -(leaving.length - 1 - i) * DISCARD_STAGGER;
      node.element.style.pointerEvents = 'none';
      node.element.setAttribute('aria-hidden', 'true');
    });
    this.battle.endTurn();
    this.sync();
    this.message('敌人回合');
    this.turnCue = 'enemy-strike';
    this.turnPause = this.reduced.matches ? 0.05
      : leaving.length ? DISCARD_FLIGHT + (leaving.length - 1) * DISCARD_STAGGER + 0.08 : 0.08;
  }

  private advanceTurnCue(): void {
    if (this.turnCue === 'enemy-strike') {
      const hit = this.battle.strikeEnemy();
      this.turnCue = 'none';
      if (!hit) return;
      const layout = battleLayout(this.settings);
      if (hit.damage > 0) {
        this.float(`-${hit.damage}`, layout.heroX, layout.heroBottom - 72);
        this.message(`缝偶造成 ${hit.damage} 点伤害`);
      } else {
        this.float(`格挡 ${hit.blocked}`, layout.heroX, layout.heroBottom - 72, 'block');
        this.message('格挡了全部伤害');
      }
      this.sync();
      if (this.battle.phase === 'lost') return;
      this.turnCue = 'player-deal';
      this.turnPause = this.reduced.matches ? 0.05 : 0.65;
      return;
    }
    if (this.turnCue === 'player-deal') {
      this.battle.beginPlayerTurn();
      this.setExpanded(true);
      this.sync();
      this.message('你的回合');
      this.turnCue = 'none';
    }
  }

  private float(text: string, x: number, y: number, kind: 'damage' | 'block' = 'damage'): void {
    const el = document.createElement('div');
    el.className = kind === 'block' ? 'battle-float battle-float--block' : 'battle-float';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.append(el);
    if (this.reduced.matches) {
      window.setTimeout(() => el.remove(), 400);
      return;
    }
    el.animate(
      [{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, -56px)' }],
      { duration: 900, easing: 'ease-out', fill: 'forwards' },
    ).finished.then(() => el.remove()).catch(() => el.remove());
  }

  private showResult(): void {
    this.pileDialog.hidden = true;
    this.result.hidden = false;
    const won = this.battle.phase === 'won';
    this.result.innerHTML = `<div class="battle-result__panel"><span>战斗结束</span><h1>${won ? '胜利' : '落幕'}</h1><p>${won ? '缝偶已被击败。' : '夜羽倒下了，再试一次。'}</p><p>经过 ${this.battle.turn} 回合 · 剩余生命 ${this.battle.heroHp} / ${this.battle.heroMaxHp}</p><button>再战一场</button></div>`;
    const restart = this.result.querySelector('button')!;
    restart.addEventListener('click', () => {
      this.cancel(false);
      for (const node of this.nodes.values()) this.removeVisual(node);
      for (const node of this.departing) this.removeVisual(node);
      this.nodes.clear();
      this.departing.length = 0;
      this.resultTimer = 0;
      this.turnPause = 0;
      this.turnCue = 'none';
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

  private drawPose(): Pose {
    const s = this.settings;
    return {
      x: DRAW_POSE.x + s.drawNudgeX,
      y: DRAW_POSE.y + s.drawNudgeY,
      angle: DRAW_POSE.angle,
      scale: DRAW_POSE.scale * s.drawScale / 100,
    };
  }

  private discardPose(): Pose {
    const s = this.settings;
    return {
      x: DISCARD_POSE.x + s.discardNudgeX,
      y: DISCARD_POSE.y + s.discardNudgeY,
      angle: DISCARD_POSE.angle,
      scale: DISCARD_POSE.scale * s.discardScale / 100,
    };
  }

  private layoutHud(): void {
    const s = this.settings;
    this.energy.style.left = `${155 + s.energyNudgeX}px`;
    this.energy.style.top = `${865 + s.energyNudgeY}px`;
    this.energy.style.transform = `scale(${s.energyScale / 100})`;
    this.energy.style.transformOrigin = 'center';
    this.drawPile.style.left = `${280 + s.drawNudgeX}px`;
    this.drawPile.style.top = `${940 + s.drawNudgeY}px`;
    this.drawPile.style.transform = `scale(${0.8 * s.drawScale / 100})`;
    this.drawPile.style.transformOrigin = 'center';
    this.discardPile.style.left = `${1540 + s.discardNudgeX}px`;
    this.discardPile.style.right = 'auto';
    this.discardPile.style.top = `${985 + s.discardNudgeY}px`;
    this.discardPile.style.transform = `scale(${0.65 * s.discardScale / 100})`;
    this.discardPile.style.transformOrigin = 'top center';
    this.end.style.left = `${1513 + s.endNudgeX}px`;
    this.end.style.right = 'auto';
    this.end.style.top = `${916 + s.endNudgeY}px`;
    this.end.style.setProperty('--hud-scale', String(s.endScale / 100));
  }

  update(dt: number): void {
    if (this.resultTimer > 0) { this.resultTimer -= dt; if (this.resultTimer <= 0) this.showResult(); }
    if (this.noticeTimer > 0) { this.noticeTimer -= dt; if (this.noticeTimer <= 0) this.notice.classList.remove('is-visible'); }
    if (this.turnPause > 0) { this.turnPause -= dt; if (this.turnPause <= 0) this.advanceTurnCue(); }
    this.layoutHud();
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
      const dragging = this.drag?.id === id && this.drag.moved;
      const overCell = dragging && this.drag!.condensed && this.target !== null;
      const occupied = overCell && this.board.hasPiece(this.target!.col, this.target!.row);
      node.element.classList.toggle('is-drop-valid', !!overCell && !occupied);
      node.element.classList.toggle('is-drop-invalid', !!overCell && !!occupied);
      if (dragging) target = {
        x: this.drag!.x,
        y: this.drag!.y - 55,
        angle: Math.max(-10, Math.min(10, node.vx * 0.016)),
        scale: overCell ? 0.34 : 0.56,
      };
      node.press += ((pressed ? 1 : 0) - node.press) * (1 - Math.exp(-24 * dt));
      node.release = Math.min(1, node.release + dt / 0.28);
      const rebound = Math.sin(node.release * Math.PI) * (1 - node.release) * 0.065;
      let scripted = false;
      let fold = 0;
      if (node.state === 'play') {
        scripted = true;
        const t = this.reduced.matches ? PLAY_FLIGHT + PLAY_SETTLE : Math.max(0, node.elapsed);
        const origin = node.origin ?? node.pose;
        const destination = node.destination!;
        const travel = Math.min(1, t / PLAY_FLIGHT);
        const u = travel * travel * (3 - 2 * travel);
        const settle = Math.min(1, Math.max(0, t - PLAY_FLIGHT) / PLAY_SETTLE);
        fold = ease(settle);
        target = {
          x: mix(origin.x, destination.x, u),
          y: mix(origin.y, destination.y, u) - Math.sin(travel * Math.PI) * 24,
          angle: mix(origin.angle, 0, u),
          scale: mix(origin.scale, destination.scale, u),
        };
        if (travel >= 1 && !node.landed) {
          this.board.revealPlacedPiece(destination.col, destination.row);
          node.landed = true;
        }
        node.element.style.opacity = String(1 - fold);
        if (t > PLAY_FLIGHT + PLAY_SETTLE) {
          this.removeVisual(node);
          if (this.nodes.get(id) === node) this.nodes.delete(id);
          continue;
        }
      } else if (node.state === 'discard') {
        scripted = true;
        const t = this.reduced.matches ? 1 : Math.max(0, Math.min(1, node.elapsed / DISCARD_FLIGHT));
        const origin = node.origin ?? node.pose;
        const u = ease(t);
        const pile = this.discardPose();
        target = {
          x: mix(origin.x, pile.x, u),
          y: mix(origin.y, pile.y, u) - Math.sin(Math.PI * t) * 42,
          angle: mix(origin.angle, pile.angle, u),
          scale: mix(origin.scale, pile.scale, u),
        };
        // Fade on approach, without waiting for a spring to settle at the pile.
        node.element.style.opacity = String(1 - ease(Math.max(0, (t - 0.7) / 0.3)));
        if (t >= 1) {
          this.removeVisual(node);
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
      node.element.style.transform = `translate3d(${p.x - 100}px, ${p.y - 150}px, 0) rotate(${p.angle}deg) scale(${p.scale * tactileScale * cardScale}) scaleY(${1 - fold * 0.92})`;
      node.element.style.zIndex = String(node.state === 'discard' ? 30 + node.layer : node.state !== 'hand' ? 40 : active ? 30 : index + 1);
      node.element.classList.toggle('is-selected', active && node.state === 'hand');
      node.element.classList.toggle('is-pressed', !!pressed);
      node.element.classList.toggle('is-dragged', this.drag?.id === id);
    }
    for (let i = this.departing.length - 1; i >= 0; i--) {
      if (!this.departing[i]!.element.isConnected) this.departing.splice(i, 1);
    }
  }
}
