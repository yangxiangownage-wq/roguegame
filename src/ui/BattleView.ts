import { Battle, CARD_DEFS, type BattleCard, type BoardSettlement } from '@/game/battle';
import type { StoneBoard } from '@/render/board';
import type { FighterCards } from '@/render/fighterCards';
import { battleLayout, boardCellCenter, boardTarget, isBoardArea } from '@/config/battleLayout';
import { clientToDesign, computeDesignFit } from '@/config/design';
import type { BoardSettings } from '@/config/board';
import './battle.css';

type Pose = { x: number; y: number; angle: number; scale: number };
type ScoreKind = 'attack' | 'armor' | 'energy' | 'mine';
type ScorePart = { kind: ScoreKind; value: number };
type SettlementDisplay = { attack: number; armor: number; foeHp: number; nextEnergy: number; energyCap: number };
type CardNode = {
  card: BattleCard; element: HTMLButtonElement; pose: Pose;
  vx: number; vy: number; va: number; vs: number;
  destination?: { x: number; y: number; scale: number; col: number; row: number };
  landed?: boolean; landing?: boolean; dealt?: boolean;
  origin?: Pose;
  press: number; release: number;
  state: 'hand' | 'play' | 'discard'; elapsed: number; delay: number;
  layer: number;
};
const ART = { hero: '/assets/chars/hero.png', foe: '/assets/chars/foe.png', sword: '/assets/icons/attack.png', slave: '/assets/chars/slave.png?v=2' };
const PILE_BUTTON = { width: 100, height: 125, backWidth: 62, backHeight: 89 };
const DRAW_PILE = { left: 280, top: 940, scale: 0.8 };
const DISCARD_PILE = { left: 1540, top: 985, scale: 0.65 };
const PLAY_FLIGHT = 0.34;
const PLAY_SETTLE = 0.14;
const DISCARD_FLIGHT = 0.42;
const DISCARD_STAGGER = 0.035;
const DEAL_FLIGHT = 0.34;
const DEAL_LAND = 0.1;
const DEAL_STAGGER = 0.04;
const SETTLEMENT_SCORE_DURATION = 460;
const SETTLEMENT_IMPACT = 0.065;
const CARD_SPRING_STIFFNESS = 260;
const CARD_SPRING_DAMPING = 25;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const springResponse = (time: number) => {
  const omega = Math.sqrt(CARD_SPRING_STIFFNESS);
  const dampingRatio = CARD_SPRING_DAMPING / (2 * omega);
  const dampedOmega = omega * Math.sqrt(1 - dampingRatio * dampingRatio);
  return 1 - Math.exp(-dampingRatio * omega * time) * (
    Math.cos(dampedOmega * time) + dampingRatio / Math.sqrt(1 - dampingRatio * dampingRatio) * Math.sin(dampedOmega * time)
  );
};
const dealProgress = (progress: number) => springResponse(progress * DEAL_FLIGHT) / springResponse(DEAL_FLIGHT);

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
  private readonly settlement = document.createElement('div');
  private readonly notice = document.createElement('div');
  private readonly live = document.createElement('div');
  private readonly result = document.createElement('div');
  private readonly pileDialog = document.createElement('div');
  private readonly nodes = new Map<number, CardNode>();
  /** Exit flights whose card id was drawn again before the animation finished. */
  private readonly departing: CardNode[] = [];
  private hover: number | null = null;
  private selected: number | null = null;
  private placementAnimating = false;
  private drag: { id: number; pointer: number; x: number; y: number; startX: number; startY: number; moved: boolean; condensed: boolean } | null = null;
  private noticeTimer = 0;
  private resultTimer = 0;
  private combatAnimating = false;
  private settlementDisplay: SettlementDisplay | null = null;
  private settlementCues: Array<{ at: number; run: () => void }> = [];
  private settlementElapsed = 0;
  private settlementHold = 0;
  private turnPause = 0;
  private revealBeforeDiscard = 0;
  private turnCue: 'none' | 'enemy-strike' | 'player-deal' = 'none';
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private readonly settings: BoardSettings,
    private readonly board: StoneBoard,
    private readonly fighters: FighterCards,
  ) {
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
    this.settlement.className = 'battle-settlement';
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
    this.root.append(this.turn, this.settlement, this.intent, this.guard, this.energy, this.drawPile, this.discardPile, this.end, this.handSurface, this.hand, this.placementTarget, this.handToggle, this.notice, this.live, this.result, this.pileDialog);
    document.getElementById('design-root')!.append(this.root);
    this.battle.configureBoard(settings.cols, settings.rows, board.getGoldCells());
    this.board.syncUnits(this.battle.units);
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
    if (this.placementAnimating || this.revealBeforeDiscard > 0 || this.isDealing()) return;
    const next = !this.expanded;
    this.cancel();
    this.setExpanded(next);
  }

  private setExpanded(expanded: boolean): void {
    if (!expanded && (this.revealBeforeDiscard > 0 || this.isDealing())) expanded = true;
    this.expanded = expanded;
    this.root.classList.toggle('is-hand-open', expanded);
    this.handToggle.setAttribute('aria-expanded', String(expanded));
    this.handToggle.disabled = this.placementAnimating || this.revealBeforeDiscard > 0 || this.isDealing();
    this.handToggle.textContent = `${expanded ? '收起手牌' : '展开手牌'} · ${this.battle.hand.length} 张`;
    this.handSurface.style.pointerEvents = expanded ? 'auto' : 'none';
    if (!expanded && this.hand.contains(document.activeElement)) this.handToggle.focus({ preventScroll: true });
    this.syncCardInteractivity();
  }

  private syncCardInteractivity(): void {
    const dealing = this.isDealing();
    for (const node of this.nodes.values()) {
      const ready = this.reduced.matches || node.elapsed >= node.delay + DEAL_FLIGHT + DEAL_LAND;
      const interactive = this.expanded && !dealing && ready && this.revealBeforeDiscard === 0 && node.state === 'hand' && this.battle.phase === 'player';
      node.element.tabIndex = interactive ? 0 : -1;
      node.element.setAttribute('aria-hidden', String(!interactive));
      // Preserve the captured card's pointer stream while withdrawing the rest.
      if (!interactive && this.drag?.id !== node.card.id) node.element.style.pointerEvents = 'none';
      else if (interactive) node.element.style.pointerEvents = 'auto';
    }
  }

  private isDealing(): boolean {
    if (this.reduced.matches) return false;
    return [...this.nodes.values()].some(node =>
      node.state === 'hand' && node.elapsed < node.delay + DEAL_FLIGHT + DEAL_LAND,
    );
  }

  private point(event: PointerEvent) { return clientToDesign(event.clientX, event.clientY, computeDesignFit()); }
  private message(text: string): void {
    this.notice.textContent = text;
    this.live.textContent = text;
    this.noticeTimer = 4;
    this.notice.classList.add('is-visible');
  }
  private insufficientEnergy(id: number, cost: number, announce = true): void {
    const node = this.nodes.get(id);
    this.hover = id;
    if (announce) this.message(`能量不足，需要 ${cost} 点能量`);
    if (this.reduced.matches) return;
    node?.element.animate(
      [
        { translate: '0 0' },
        { translate: '-6px 0' },
        { translate: '5px 0' },
        { translate: '-3px 0' },
        { translate: '0 0' },
      ],
      { duration: 260, easing: 'ease-out' },
    );
    node?.element.querySelector<HTMLElement>('.hand-card__cost')?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'ease-out' },
    );
    this.energy.animate(
      [
        {
          filter: 'brightness(1)',
          boxShadow: 'inset 0 0 0 5px #191b17, inset 0 0 0 6px #79623e, 0 12px 24px #150b12aa',
        },
        {
          filter: 'brightness(1.2)',
          boxShadow: 'inset 0 0 0 5px #191b17, inset 0 0 0 6px #d87565, 0 0 24px #d8756566',
        },
        {
          filter: 'brightness(1)',
          boxShadow: 'inset 0 0 0 5px #191b17, inset 0 0 0 6px #79623e, 0 12px 24px #150b12aa',
        },
      ],
      { duration: 380, easing: 'ease-out' },
    );
  }
  private createNode(card: BattleCard, delay: number): CardNode {
    const def = CARD_DEFS[card.key];
    const element = document.createElement('button');
    element.className = `hand-card hand-card--${def.tone}`;
    element.dataset.cardId = String(card.id);
    element.style.pointerEvents = 'none';
    const placed = def.mines ? '矿工' : def.boardKind === 'guard' ? '护卫' : def.boardKind === 'energy' ? '雾影' : '攻击单位';
    element.setAttribute('aria-label', `${def.title}，${def.cost} 点能量，放置${placed}。${def.description.join(' ')}`);
    element.innerHTML = `<span class="hand-card__art"><img src="${ART[def.art]}" alt="" draggable="false"></span><span class="hand-card__frame"></span><span class="hand-card__cost">${def.cost}</span><span class="hand-card__title">${def.title}</span><span class="hand-card__kind">${def.kind}</span><span class="hand-card__description">${def.description.join('<br>')}</span>`;
    element.addEventListener('pointerenter', () => { if (this.expanded && !this.isDealing() && !this.drag && this.battle.phase === 'player') this.hover = card.id; });
    element.addEventListener('focus', () => { if (this.expanded && !this.isDealing() && this.battle.phase === 'player') this.hover = card.id; });
    element.addEventListener('blur', () => { if (!this.drag && this.hover === card.id) this.hover = null; });
    element.addEventListener('pointerdown', event => {
      if (!this.expanded || this.revealBeforeDiscard > 0 || event.button !== 0 || this.battle.phase !== 'player' || !this.pileDialog.hidden) return;
      if (this.battle.energy < def.cost) {
        event.preventDefault();
        event.stopPropagation();
        this.insufficientEnergy(card.id, def.cost);
        return;
      }
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
      if (this.battle.energy < def.cost) {
        this.insufficientEnergy(card.id, def.cost);
        return;
      }
      this.hover = card.id;
      this.selected = null;
    });
    this.hand.append(element);
    const origin = this.drawPose();
    const node: CardNode = { card, element, pose: { ...origin }, origin: { ...origin }, vx: 0, vy: 0, va: 0, vs: 0, state: 'hand', press: 0, release: 1, elapsed: 0, delay, layer: 0 };
    this.nodes.set(card.id, node);
    return node;
  }

  private sync(): void {
    const b = this.battle;
    this.board.syncUnits(b.units);
    let index = 0;
    for (const card of b.hand) {
      const previous = this.nodes.get(card.id);
      // The same card can be drawn again while its discard flight is still playing.
      if (previous && previous.state !== 'hand') {
        this.departing.push(previous);
        this.nodes.delete(card.id);
      }
      if (!this.nodes.has(card.id)) this.createNode(card, index++ * DEAL_STAGGER);
    }
    for (const node of this.nodes.values()) {
      const def = CARD_DEFS[node.card.key];
      const unavailable = b.energy < def.cost;
      node.element.classList.toggle('is-unaffordable', unavailable);
      node.element.setAttribute('aria-disabled', String(b.phase !== 'player' || unavailable));
      node.element.title = unavailable ? `能量不足，需要 ${def.cost} 点能量` : '';
      node.element.setAttribute('aria-label', `${def.title}，${def.cost} 点能量。${def.description.join(' ')}${unavailable ? `能量不足，需要 ${def.cost} 点能量。` : ''}`);
      node.element.tabIndex = this.expanded && b.phase === 'player' && node.state === 'hand' ? 0 : -1;
    }
    this.setExpanded(this.expanded);
    this.syncEnergyHud();
    this.drawPile.innerHTML = `<span class="battle-pile__back"></span><strong>${b.drawPile.length}</strong><span>抽牌堆</span>`;
    this.discardPile.innerHTML = `<span class="battle-pile__back"></span><strong>${b.discardPile.length}</strong><span>弃牌堆</span>`;
    this.drawPile.setAttribute('aria-label', `查看抽牌堆，${b.drawPile.length} 张`);
    this.discardPile.setAttribute('aria-label', `查看弃牌堆，${b.discardPile.length} 张`);
    this.end.disabled = b.phase !== 'player' || this.placementAnimating || this.revealBeforeDiscard > 0 || this.isDealing();
    this.syncTurnHud();
    const boardThreat = b.units.filter(unit => unit.owner === 'enemy').reduce((total, unit) => total + (unit.attack ?? 0), 0);
    this.intent.innerHTML = `<span>来袭伤害</span><strong>${b.intent + boardThreat}</strong>${boardThreat ? `<small>本体 ${b.intent} · 棋盘 +${boardThreat}</small>` : '<small>敌方意图</small>'}`;
    this.intent.hidden = b.phase === 'won' || b.phase === 'lost';
    this.syncGuardHud();
    if ((b.phase === 'won' || b.phase === 'lost') && !this.settlementCues.length && !this.combatAnimating) this.resultTimer = 0.65;
  }

  private syncEnergyHud(): void {
    const b = this.battle;
    const nextEnergy = this.settlementDisplay?.nextEnergy ?? b.nextEnergy;
    const energyCap = this.settlementDisplay?.energyCap ?? b.energyCap;
    this.energy.innerHTML = `<strong>${b.energy}<small> / ${b.turnEnergy}</small></strong><span>上限 ${energyCap}${nextEnergy ? ` · 下回合 +${nextEnergy}` : ''}</span>`;
    this.energy.setAttribute('aria-label', `剩余 ${b.energy} 点能量，本回合上限 ${b.turnEnergy}，永久能量上限 ${energyCap}${nextEnergy ? `，下回合储备 ${nextEnergy} 点` : ''}`);
  }

  private syncGuardHud(): void {
    const armor = this.settlementDisplay?.armor ?? this.battle.block;
    this.guard.textContent = `护甲 ${armor}`;
    this.guard.classList.toggle('is-active', armor > 0);
    this.guard.hidden = armor <= 0;
  }

  private syncTurnHud(): void {
    const b = this.battle;
    const settling = this.settlementCues.length > 0;
    this.end.textContent = this.combatAnimating ? '我方攻击中' : settling ? '棋盘结算中' : b.phase === 'enemy' ? '敌人行动中' : b.phase === 'player' ? '结束回合' : '战斗结束';
    this.turn.innerHTML = `<span>第 ${b.turn} 回合</span><small>${this.combatAnimating ? '我方攻击' : settling ? '棋盘结算' : b.phase === 'player' ? '你的回合' : b.phase === 'enemy' ? '敌人回合' : '战斗结束'}</small>`;
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
    const aiming = card !== undefined && CARD_DEFS[card.key].mines === true && this.target !== null && !this.board.hasPiece(this.target.col, this.target.row);
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
      if (!this.expanded || this.isDealing() || this.battle.phase !== 'player' || !this.pileDialog.hidden || !this.result.hidden) {
        if (this.isDealing()) this.hover = null;
        return;
      }
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
    // Keep a wide dead zone so small pointer movements near the board rim do not
    // repeatedly expand and tuck the hand.
    const distance = Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY);
    if (!this.drag.condensed && distance >= 72) {
      this.drag.condensed = true;
      this.setExpanded(false);
    } else if (this.drag.condensed && distance <= 18) {
      this.drag.condensed = false;
      this.setExpanded(true);
    }
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
    if (this.placementAnimating || this.revealBeforeDiscard > 0) return true;
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
    const result = this.battle.placeCard(id, target.col, target.row);
    if (!result.ok) {
      this.rejectPlacement(id, result.message);
      if (result.message.startsWith('能量不足')) this.insufficientEnergy(id, CARD_DEFS[node.card.key].cost, false);
      else if (!this.reduced.matches) node.element.animate([{ translate: '-8px 0' }, { translate: '7px 0' }, { translate: '0 0' }], { duration: 240 });
      return;
    }
    // Clear the pending target without tucking the rest of the hand.
    this.cancel(false);
    // Reserve the cell immediately; reveal it exactly when the card lands.
    this.board.syncUnits(this.battle.units, this.reduced.matches ? 0 : PLAY_FLIGHT);
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
    this.placementAnimating = true;
    this.root.classList.add('is-placement-animating');
    this.handToggle.disabled = true;
    node.element.style.pointerEvents = 'none';
    node.element.setAttribute('aria-hidden', 'true');
    this.message(`${result.message}：已放入第 ${target.row + 1} 行、第 ${target.col + 1} 列`);
    this.sync();
  }
  private endTurn(): void {
    if (this.placementAnimating || this.revealBeforeDiscard > 0 || this.isDealing() || !this.pileDialog.hidden || !this.result.hidden || this.battle.phase !== 'player' || this.turnCue !== 'none') return;
    this.cancel(false);
    const leaving = [...this.nodes.values()].filter(node => node.state === 'hand');
    if (!this.expanded && leaving.length && !this.reduced.matches) {
      // Bring tucked cards back into view before asking them to fly to discard.
      this.revealBeforeDiscard = DEAL_FLIGHT;
      this.setExpanded(true);
      this.end.disabled = true;
      return;
    }
    this.finishEndTurn(leaving);
  }

  private finishEndTurn(leaving = [...this.nodes.values()].filter(node => node.state === 'hand')): void {
    if (this.battle.phase !== 'player') return;
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
    const armorBeforeSettlement = this.battle.block;
    const foeHpBeforeSettlement = this.battle.foeHp;
    const nextEnergyBeforeSettlement = this.battle.nextEnergy;
    const energyCapBeforeSettlement = this.battle.energyCap;
    const settlement = this.battle.endTurn();
    if (!settlement) return;
    const totals = [
      { label: '本回合伤害', value: settlement.damage, sign: '+', className: 'attack' },
      { label: '获得护甲', value: settlement.armor, sign: '+', className: 'armor' },
      { label: '储备能量', value: settlement.energy, sign: '+', className: 'energy' },
      { label: '能量上限', value: settlement.mined, sign: '+', className: 'mine' },
    ].filter(item => item.value > 0);
    this.settlement.style.setProperty('--settlement-columns', String(Math.max(1, totals.length)));
    this.settlement.innerHTML = totals.length
      ? `<div class="battle-settlement__heading">棋盘结算</div><div class="battle-settlement__stats">${totals.map(item => `<div class="battle-settlement__stat battle-settlement__${item.className}"><small>${item.label}</small><strong>${item.sign}<span data-score="${item.className}" data-target="${item.value}">0</span></strong></div>`).join('')}</div>`
      : '<div class="battle-settlement__heading">棋盘结算</div><div class="battle-settlement__empty">棋盘暂无产出</div>';
    this.settlement.classList.add('is-scoring', 'is-visible');
    this.noticeTimer = 0;
    this.notice.classList.remove('is-visible');
    if (this.reduced.matches) {
      for (const counter of this.settlement.querySelectorAll<HTMLElement>('[data-score]')) {
        counter.textContent = counter.dataset.target ?? '0';
      }
    }
    const settlementDuration = this.animateBoardSettlement(
      settlement,
      armorBeforeSettlement,
      foeHpBeforeSettlement,
      nextEnergyBeforeSettlement,
      energyCapBeforeSettlement,
    );
    this.settlementHold = settlementDuration + 0.72;
    this.sync();
    this.resultTimer = 0;
    this.turnCue = 'none';
    this.live.textContent = `棋盘结算：伤害 ${settlement.damage}，护甲 ${settlement.armor}，储能 ${settlement.energy}`;
    this.turnPause = this.reduced.matches ? 0.05
      : leaving.length ? DISCARD_FLIGHT + (leaving.length - 1) * DISCARD_STAGGER + 0.08 : 0.08;
  }

  private animateBoardSettlement(
    settlement: BoardSettlement,
    armor: number,
    foeHp: number,
    nextEnergy: number,
    energyCap: number,
  ): number {
    this.settlementCues = [];
    this.settlementElapsed = 0;
    // Keep enemy health at its pre-settlement value until the portrait makes contact.
    this.settlementDisplay = this.reduced.matches
      ? { attack: settlement.damage, armor: this.battle.block, foeHp, nextEnergy: this.battle.nextEnergy, energyCap: this.battle.energyCap }
      : { attack: 0, armor, foeHp, nextEnergy, energyCap };
    this.fighters.setSettlementPreview(this.settlementDisplay);
    if (this.reduced.matches) {
      this.settlementCues.push({ at: 0.18, run: () => this.finishBoardSettlement(settlement) });
      return 0.18;
    }
    const mined = new Set(settlement.minedIds);
    const sources = this.battle.units
      .filter(unit => unit.owner === 'player' && settlement.unitIds.includes(unit.id))
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map(unit => {
        const parts: ScorePart[] = [];
        if (unit.attack) parts.push({ kind: 'attack', value: unit.attack });
        if (unit.armor) parts.push({ kind: 'armor', value: unit.armor });
        if (unit.energy) parts.push({ kind: 'energy', value: unit.energy });
        if (mined.has(unit.id)) parts.push({ kind: 'mine', value: 1 });
        return { unit, parts };
      }).filter(source => source.parts.length > 0);
    if (!sources.length) {
      this.settlementCues.push({ at: 0.24, run: () => this.finishBoardSettlement(settlement) });
      return 0.24;
    }

    // One clock controls the source pulse, score impact and turn transition.
    const heading = this.settlement.querySelector<HTMLElement>('.battle-settlement__heading');
    if (heading) heading.textContent = `棋盘结算 · 0 / ${sources.length}`;
    // Keep individual cells readable, compressing the cadence on a crowded board.
    const step = Math.max(0.06, Math.min(0.145, 1 / Math.max(1, sources.length - 1)));
    const lead = 0.09;
    sources.forEach(({ unit, parts }, index) => {
      const at = lead + index * step;
      this.settlementCues.push({ at, run: () => {
        this.board.pulseSettlement([unit.id]);
        this.popSettlementScore(parts, unit.col, unit.row, unit.id);
      }});
      this.settlementCues.push({ at: at + SETTLEMENT_IMPACT, run: () => {
        const running = this.settlementDisplay;
        if (!running) return;
        for (const part of parts) {
          const counter = this.settlement.querySelector<HTMLElement>(`[data-score="${part.kind}"]`);
          if (counter) this.incrementSettlementScore(counter, part.value);
          if (part.kind === 'attack') running.attack += part.value;
          if (part.kind === 'armor') running.armor += part.value;
          if (part.kind === 'energy') running.nextEnergy += part.value;
          if (part.kind === 'mine') running.energyCap += part.value;
        }
        this.fighters.setSettlementPreview({ ...running });
        this.syncGuardHud();
        this.syncEnergyHud();
        if (heading) heading.textContent = `棋盘结算 · ${index + 1} / ${sources.length}`;
      }});
    });
    const duration = lead + (sources.length - 1) * step + SETTLEMENT_SCORE_DURATION / 1000;
    this.settlementCues.push({ at: duration, run: () => this.finishBoardSettlement(settlement) });
    this.settlementCues.sort((a, b) => a.at - b.at);
    return duration;
  }

  private finishBoardSettlement(settlement: BoardSettlement): void {
    this.settlement.classList.remove('is-scoring');
    const heading = this.settlement.querySelector<HTMLElement>('.battle-settlement__heading');
    if (heading) heading.textContent = '本回合合计';
    const complete = () => {
      this.combatAnimating = false;
      this.settlementDisplay = null;
      this.fighters.setSettlementPreview(null);
      this.syncGuardHud();
      this.syncEnergyHud();
      this.syncTurnHud();
      if (settlement.victory) {
        this.resultTimer = 0.26;
        this.live.textContent = `造成 ${settlement.damage} 点伤害，击败缝偶`;
      } else {
        this.turnCue = 'enemy-strike';
        this.turnPause = Math.max(this.turnPause, 0.16);
      }
    };
    if (settlement.damage <= 0) {
      complete();
      return;
    }
    this.combatAnimating = true;
    this.syncTurnHud();
    const duration = this.fighters.playStrike({
      damage: settlement.damage,
      reducedMotion: this.reduced.matches,
      onImpact: () => {
        if (this.settlementDisplay) {
          this.settlementDisplay.foeHp = this.battle.foeHp;
          this.fighters.setSettlementPreview({ ...this.settlementDisplay });
        }
        this.live.textContent = `夜羽击中缝偶，造成 ${settlement.damage} 点伤害`;
      },
      onComplete: complete,
    });
    this.settlementHold = duration + 0.3;
  }

  private updateSettlement(dt: number): void {
    if (this.settlementCues.length) {
      this.settlementElapsed += dt;
      while (this.settlementCues.length && this.settlementCues[0]!.at <= this.settlementElapsed) {
        this.settlementCues.shift()!.run();
      }
    }
    if (this.settlementHold > 0) {
      this.settlementHold -= dt;
      if (this.settlementHold <= 0) this.settlement.classList.remove('is-visible', 'is-scoring');
    }
  }

  private popSettlementScore(parts: ScorePart[], col: number, row: number, unitId: number): void {
    const center = boardCellCenter(this.settings, col, row);
    const scale = battleLayout(this.settings).scale * Math.min(1.1, this.settings.tileSize / 126);
    const labels = { attack: '伤害', armor: '护甲', energy: '储能', mine: '上限' };
    const score = document.createElement('div');
    score.className = 'battle-score';
    score.dataset.unitId = String(unitId);
    score.style.left = `${center.x}px`;
    score.style.top = `${center.y - 10 * scale}px`;
    score.style.setProperty('--score-scale', String(scale));
    // A unit with two effects gets two aligned rows in ONE popup, never overlapping popups.
    score.innerHTML = `<div class="battle-score__body">${parts.map(part => `<div class="battle-score__row battle-score--${part.kind}"><strong>+${part.value}</strong><span class="battle-score__unit">分</span><span class="battle-score__kind">${labels[part.kind]}</span></div>`).join('')}</div>`;
    this.root.append(score);
    const body = score.firstElementChild!;
    const animation = body.animate([
      { opacity: 0, transform: 'translateY(8px) scale(.82, .72)', offset: 0, easing: 'cubic-bezier(.12,.8,.24,1)' },
      { opacity: 1, transform: 'translateY(-8px) scale(1.12, 1.16)', offset: 0.14, easing: 'cubic-bezier(.2,.75,.3,1)' },
      { opacity: 1, transform: 'translateY(-6px) scale(1)', offset: 0.3 },
      { opacity: 1, transform: 'translateY(-10px) scale(1)', offset: 0.72, easing: 'cubic-bezier(.4,0,.8,.5)' },
      { opacity: 0, transform: 'translateY(-32px) scale(.98)', offset: 1 },
    ], { duration: SETTLEMENT_SCORE_DURATION, fill: 'both' });
    animation.finished.then(() => score.remove()).catch(() => score.remove());
  }

  private incrementSettlementScore(counter: HTMLElement, amount: number): void {
    counter.textContent = String(Number(counter.textContent ?? 0) + amount);
    const number = counter.parentElement;
    if (!number || this.reduced.matches) return;
    for (const animation of number.getAnimations()) animation.cancel();
    number.animate([
      { transform: 'translateY(-2px) scale(1.14)', filter: 'brightness(1.25)' },
      { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
    ], { duration: 145, easing: 'cubic-bezier(.16,.85,.25,1)' });
  }

  private advanceTurnCue(): void {
    if (this.turnCue === 'enemy-strike') {
      const hit = this.battle.strikeEnemy();
      this.turnCue = 'none';
      if (!hit) return;
      this.board.syncUnits(this.battle.units);
      const layout = battleLayout(this.settings);
      if (hit.damage > 0) {
        this.float(`-${hit.damage}`, layout.heroX, layout.heroBottom - 72);
        this.message(`缝偶造成 ${hit.damage} 点伤害`);
      } else {
        this.float(`格挡 ${hit.blocked}`, layout.heroX, layout.heroBottom - 72, 'block');
        this.message('护甲挡住了全部伤害');
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
      this.settlementCues = [];
      this.settlementElapsed = this.settlementHold = 0;
      for (const score of this.root.querySelectorAll('.battle-score')) {
        for (const animation of score.getAnimations({ subtree: true })) animation.cancel();
        score.remove();
      }
      this.fighters.cancelStrike();
      this.combatAnimating = false;
      this.fighters.setSettlementPreview(null);
      this.settlementDisplay = null;
      this.settlement.classList.remove('is-visible', 'is-scoring');
      this.resultTimer = 0;
      this.revealBeforeDiscard = 0;
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
    if (this.revealBeforeDiscard > 0) return;
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
    const scale = DRAW_PILE.scale * s.drawScale / 100;
    const backCenterY = PILE_BUTTON.backHeight / 2;
    return {
      x: DRAW_PILE.left + s.drawNudgeX + PILE_BUTTON.width / 2,
      y: DRAW_PILE.top + s.drawNudgeY + PILE_BUTTON.height / 2 + (backCenterY - PILE_BUTTON.height / 2) * scale,
      angle: -10,
      scale: scale * PILE_BUTTON.backWidth / 200,
    };
  }

  private discardPose(): Pose {
    const s = this.settings;
    const scale = DISCARD_PILE.scale * s.discardScale / 100;
    return {
      x: DISCARD_PILE.left + s.discardNudgeX + PILE_BUTTON.width / 2,
      y: DISCARD_PILE.top + s.discardNudgeY + PILE_BUTTON.backHeight / 2 * scale,
      angle: 10,
      scale: scale * PILE_BUTTON.backWidth / 200,
    };
  }

  private layoutHud(): void {
    const s = this.settings;
    this.energy.style.left = `${155 + s.energyNudgeX}px`;
    this.energy.style.top = `${865 + s.energyNudgeY}px`;
    this.energy.style.transform = `scale(${s.energyScale / 100})`;
    this.energy.style.transformOrigin = 'center';
    this.drawPile.style.left = `${DRAW_PILE.left + s.drawNudgeX}px`;
    this.drawPile.style.top = `${DRAW_PILE.top + s.drawNudgeY}px`;
    this.drawPile.style.transform = `scale(${DRAW_PILE.scale * s.drawScale / 100})`;
    this.drawPile.style.transformOrigin = 'center';
    this.discardPile.style.left = `${DISCARD_PILE.left + s.discardNudgeX}px`;
    this.discardPile.style.right = 'auto';
    this.discardPile.style.top = `${DISCARD_PILE.top + s.discardNudgeY}px`;
    this.discardPile.style.transform = `scale(${DISCARD_PILE.scale * s.discardScale / 100})`;
    this.discardPile.style.transformOrigin = 'top center';
    this.end.style.left = `${1513 + s.endNudgeX}px`;
    this.end.style.right = 'auto';
    this.end.style.top = `${916 + s.endNudgeY}px`;
    this.end.style.setProperty('--hud-scale', String(s.endScale / 100));
  }

  update(dt: number): void {
    this.updateSettlement(dt);
    if (this.resultTimer > 0) { this.resultTimer -= dt; if (this.resultTimer <= 0) this.showResult(); }
    if (this.noticeTimer > 0) { this.noticeTimer -= dt; if (this.noticeTimer <= 0) this.notice.classList.remove('is-visible'); }
    if (this.revealBeforeDiscard > 0) {
      this.revealBeforeDiscard -= dt;
      if (this.revealBeforeDiscard <= 0) {
        this.revealBeforeDiscard = 0;
        this.finishEndTurn();
      }
    }
    this.turnPause = Math.max(0, this.turnPause - dt);
    if (this.turnPause === 0 && this.turnCue !== 'none' && !this.settlementCues.length && !this.combatAnimating) this.advanceTurnCue();
    this.layoutHud();
    const layout = battleLayout(this.settings);
    this.intent.style.left = `${layout.foeX}px`;
    this.intent.style.top = `${layout.foeTop - 52}px`;
    this.guard.style.left = `${layout.heroX}px`;
    this.guard.style.top = `${layout.heroBottom + 16}px`;
    // Transparent target extends across the portrait, while its text sits above it.
    this.intent.style.setProperty('--target-height', `${layout.foeBottom - layout.foeTop + 100}px`);
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
        // Keep the card at a steady size while crossing tile edges and gaps.
        // The placement flight handles the final shrink into the destination tile.
        scale: this.drag!.condensed ? 0.48 : 0.56,
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
        const u = ease(travel);
        const settle = Math.min(1, Math.max(0, t - PLAY_FLIGHT) / PLAY_SETTLE);
        fold = ease(settle);
        target = {
          x: mix(origin.x, destination.x, u),
          y: mix(origin.y, destination.y, u) - Math.sin(u * Math.PI) * 24,
          angle: mix(origin.angle, 0, u),
          scale: mix(origin.scale, destination.scale, u),
        };
        if (travel >= 1 && !node.landed) {
          this.board.revealPlacedPiece(destination.col, destination.row);
          node.landed = true;
        }
        node.element.style.opacity = String(1 - fold);
        if (t >= PLAY_FLIGHT + PLAY_SETTLE) {
          this.removeVisual(node);
          if (this.nodes.get(id) === node) this.nodes.delete(id);
          this.placementAnimating = false;
          this.root.classList.remove('is-placement-animating');
          this.handToggle.disabled = false;
          this.end.disabled = this.battle.phase !== 'player';
          this.setExpanded(true);
          continue;
        }
      } else if (node.state === 'discard') {
        const elapsed = this.reduced.matches ? DISCARD_FLIGHT : Math.max(0, node.elapsed);
        const origin = node.origin ?? node.pose;
        const destination = this.discardPose();
        const progress = Math.min(1, elapsed / DISCARD_FLIGHT);
        const u = smooth(progress);
        scripted = true;
        target = node.elapsed < 0 && !this.reduced.matches ? origin : {
          x: mix(origin.x, destination.x, u),
          y: mix(origin.y, destination.y, u) - Math.sin(u * Math.PI) * 20,
          angle: mix(origin.angle, destination.angle, u),
          scale: mix(origin.scale, destination.scale, u),
        };
        node.element.style.opacity = String(1 - ease(Math.max(0, (progress - 0.7) / 0.3)));
        if (progress >= 1) {
          this.removeVisual(node);
          if (this.nodes.get(id) === node) this.nodes.delete(id);
          continue;
        }
      } else {
        const delay = this.reduced.matches ? 0 : node.delay;
        const dealElapsed = node.elapsed - delay;
        node.element.style.opacity = dealElapsed < 0 ? '0' : '1';
        if (dealElapsed < 0) continue;
        if (!this.reduced.matches && !node.dealt) {
          if (dealElapsed < DEAL_FLIGHT) {
            const progress = Math.min(1, dealElapsed / DEAL_FLIGHT);
            const u = dealProgress(progress);
            const origin = node.origin ?? this.drawPose();
            const land = Math.pow(progress, 4);
            scripted = true;
            target = {
              x: mix(origin.x, target.x, u),
              y: mix(origin.y, target.y, u) - Math.sin(progress * Math.PI) * 30 - land * 8,
              angle: mix(origin.angle, target.angle, u) + Math.sin(progress * Math.PI) * 2 + land,
              scale: mix(origin.scale, target.scale, u) + land * target.scale * 0.025,
            };
          } else {
            if (!node.landing) {
              node.landing = true;
              node.pose.x = target.x;
              node.pose.y = target.y - 8;
              node.pose.angle = target.angle + 1;
              node.pose.scale = target.scale * 1.025;
              node.vx = 0;
              node.vy = 90;
              node.va = -9;
              node.vs = -0.14;
            }
            if (dealElapsed >= DEAL_FLIGHT + DEAL_LAND) node.dealt = true;
          }
        }
      }
      // Stable, damped spring with small substeps: smooth even after a slow frame.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const step = dt / steps;
      for (let k = 0; k < steps; k++) {
        for (const [key, velocity] of [['x', 'vx'], ['y', 'vy'], ['angle', 'va'], ['scale', 'vs']] as const) {
          if (this.reduced.matches || scripted) { node.pose[key] = target[key]; node[velocity] = 0; }
          else {
            const dragging = this.drag?.id === id;
            const landing = node.state === 'hand' && node.landing && !node.dealt;
            const stiffness = landing ? 400 : dragging ? 460 : CARD_SPRING_STIFFNESS;
            const damping = landing ? 30 : dragging ? 32 : CARD_SPRING_DAMPING;
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
    this.syncCardInteractivity();
    this.handToggle.disabled = this.placementAnimating || this.revealBeforeDiscard > 0 || this.isDealing();
    this.end.disabled = this.battle.phase !== 'player' || this.placementAnimating || this.revealBeforeDiscard > 0 || this.isDealing();
  }
}
