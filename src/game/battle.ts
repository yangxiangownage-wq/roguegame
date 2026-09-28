import type { BoardUnit, CardKey, PieceKind } from '@/config/pieces';
export type { CardKey } from '@/config/pieces';
export type CardDefinition = {
  title: string; cost: number; kind: '攻击' | '技能';
  description: string[]; damage?: number; block?: number; draw?: number;
  energy?: number; nextEnergy?: number; comboDraw?: boolean;
  boardKind: Exclude<PieceKind, 'gold'>; boardDamage?: number; boardArmor?: number; boardEnergy?: number; mines?: boolean;
  art: 'hero' | 'foe' | 'sword' | 'slave'; tone: string;
};
export const CARD_DEFS: Record<CardKey, CardDefinition> = {
  blade: { title: '飞刃', cost: 1, kind: '攻击', description: ['留在棋盘上；每回合结算造成 4 点伤害。'], damage: 4, boardKind: 'mark', boardDamage: 4, art: 'sword', tone: 'crimson' },
  leap: { title: '跃起', cost: 1, kind: '技能', description: ['留在棋盘上；每回合结算获得 4 点护甲。'], block: 4, boardKind: 'guard', boardArmor: 4, art: 'hero', tone: 'teal' },
  slash: { title: '海盗斩击', cost: 2, kind: '攻击', description: ['留在棋盘上；每回合结算造成 8 点伤害。'], damage: 8, boardKind: 'mark', boardDamage: 8, art: 'foe', tone: 'crimson' },
  mist: { title: '雾影步', cost: 0, kind: '技能', description: ['留在棋盘上；每回合结算获得 6 点护甲，', '并为下回合储备 1 点能量。'], block: 6, nextEnergy: 1, boardKind: 'energy', boardArmor: 6, boardEnergy: 1, art: 'hero', tone: 'teal' },
  hook: { title: '钩掠', cost: 1, kind: '攻击', description: ['留在棋盘上；每回合结算造成 5 点伤害，', '并为下回合储备 1 点能量。'], damage: 5, boardKind: 'mark', boardDamage: 5, boardEnergy: 1, art: 'sword', tone: 'amber' },
  slave: { title: '矿工', cost: 1, kind: '技能', description: ['留在棋盘上；相邻金矿时首次开采，', '永久增加 1 点能量上限。'], boardKind: 'slave', mines: true, art: 'slave', tone: 'crimson' },
};
export type BattleCard = { id: number; key: CardKey };
export type Phase = 'player' | 'enemy' | 'won' | 'lost';
export type PlayResult = { ok: boolean; message: string; damage: number; block: number };
export type BoardSettlement = { damage: number; armor: number; energy: number; mined: number; minedIds: number[]; unitIds: number[]; victory: boolean };
const STARTING_DECK: CardKey[] = ['slave', 'blade', 'leap', 'slash', 'mist', 'hook', 'blade', 'leap', 'slash', 'blade', 'leap', 'slash', 'hook'];

/** Pure combat state. Animation timing lives in BattleView, never in the rules. */
export class Battle {
  hand: BattleCard[] = [];
  drawPile: BattleCard[] = [];
  discardPile: BattleCard[] = [];
  heroHp = 20;
  readonly heroMaxHp = 20;
  foeHp = 36;
  readonly foeMaxHp = 36;
  block = 0;
  energy = 3;
  turnEnergy = 3;
  energyCap = 3;
  nextEnergy = 0;
  turn = 1;
  attacksPlayed = 0;
  readonly units: BoardUnit[] = [];
  phase: Phase = 'player';
  revision = 0;
  private cols = 5;
  private rows = 5;
  private mines: Array<{ col: number; row: number }> = [];
  private nextUnitId = 1000;
  constructor(private readonly random: () => number = Math.random) { this.reset(); }

  get intent(): number { return [6, 8, 10][(this.turn - 1) % 3]!; }
  reset(): void {
    this.heroHp = this.heroMaxHp;
    this.foeHp = this.foeMaxHp;
    this.block = this.nextEnergy = this.attacksPlayed = 0;
    this.energyCap = 3;
    this.energy = this.turnEnergy = this.energyCap + this.nextEnergy;
    this.nextEnergy = 0;
    this.turn = 1;
    this.units.splice(0);
    this.nextUnitId = 1000;
    this.phase = 'player';
    this.discardPile = [];
    // A readable first hand teaches all five mechanics; subsequent draws are shuffled.
    const deck = STARTING_DECK.map((key, id) => ({ id, key }));
    this.hand = deck.slice(0, 5);
    this.drawPile = this.shuffle(deck.slice(5));
    this.revision++;
  }
  configureBoard(cols: number, rows: number, mines: Array<{ col: number; row: number }>): void {
    this.cols = cols;
    this.rows = rows;
    this.mines = mines.map(cell => ({ ...cell }));
  }
  private shuffle(cards: BattleCard[]): BattleCard[] {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j]!, cards[i]!];
    }
    return cards;
  }
  draw(count: number): void {
    for (let i = 0; i < count && this.hand.length < 10; i++) {
      if (!this.drawPile.length) this.drawPile = this.shuffle(this.discardPile.splice(0));
      const card = this.drawPile.pop();
      if (!card) break;
      this.hand.push(card);
    }
  }
  /** Placement prototype: spending a card must not trigger direct combat effects. */
  placeCard(id: number, col?: number, row?: number): { ok: boolean; message: string; unit?: BoardUnit } {
    const index = this.hand.findIndex(card => card.id === id);
    if (this.phase !== 'player' || index < 0) return { ok: false, message: '现在不能放置' };
    const card = this.hand[index]!;
    const def = CARD_DEFS[card.key];
    if (this.energy < def.cost) return { ok: false, message: `能量不足，需要 ${def.cost} 点能量` };
    const cell = this.firstOpenCell(col, row);
    if (!cell) return { ok: false, message: '棋盘没有空位' };
    this.energy -= def.cost;
    this.hand.splice(index, 1);
    this.discardPile.push(card);
    const unit: BoardUnit = {
      id: this.nextUnitId++, owner: 'player', kind: def.boardKind,
      col: cell.col, row: cell.row, source: card.key,
      attack: def.boardDamage ?? 0, armor: def.boardArmor ?? 0, energy: def.boardEnergy ?? 0,
      mined: false,
    };
    this.units.push(unit);
    this.revision++;
    return { ok: true, message: def.title, unit };
  }

  private firstOpenCell(col?: number, row?: number): { col: number; row: number } | null {
    const occupied = (c: number, r: number) => this.units.some(unit => unit.col === c && unit.row === r)
      || this.mines.some(mine => mine.col === c && mine.row === r);
    if (col !== undefined && row !== undefined) {
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows || occupied(col, row)) return null;
      return { col, row };
    }
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (!occupied(c, r)) return { col: c, row: r };
    }
    return null;
  }

  /** Resolve every persistent player unit together at the end of the player's turn. */
  settleBoard(): BoardSettlement {
    let damage = 0;
    let armor = 0;
    let energy = 0;
    let mined = 0;
    const minedIds: number[] = [];
    const unitIds: number[] = [];
    for (const unit of this.units) {
      if (unit.owner !== 'player') continue;
      unitIds.push(unit.id);
      damage += unit.attack ?? 0;
      armor += unit.armor ?? 0;
      energy += unit.energy ?? 0;
      if (unit.kind === 'slave' && !unit.mined && this.adjacentToMine(unit.col, unit.row)) {
        unit.mined = true;
        mined++;
        minedIds.push(unit.id);
      }
    }
    this.foeHp = Math.max(0, this.foeHp - damage);
    this.block += armor;
    this.nextEnergy += energy;
    this.energyCap += mined;
    this.revision++;
    return { damage, armor, energy, mined, minedIds, unitIds, victory: this.foeHp <= 0 };
  }

  private adjacentToMine(col: number, row: number): boolean {
    return this.mines.some(mine => Math.abs(mine.col - col) + Math.abs(mine.row - row) === 1);
  }

  /** Refill the placement hand; board resolution rules are not yet defined. */
  nextPlacementTurn(): boolean {
    if (this.phase !== 'player') return false;
    this.discardPile.push(...this.hand.splice(0));
    this.turn++;
    this.energy = this.turnEnergy = this.energyCap + this.nextEnergy;
    this.nextEnergy = 0;
    this.draw(5);
    this.revision++;
    return true;
  }

  play(id: number): PlayResult {
    const index = this.hand.findIndex(card => card.id === id);
    if (this.phase !== 'player' || index < 0) return { ok: false, message: '现在不能出牌', damage: 0, block: 0 };
    const card = this.hand[index]!;
    const def = CARD_DEFS[card.key];
    if (this.energy < def.cost) return { ok: false, message: `能量不足，需要 ${def.cost} 点能量`, damage: 0, block: 0 };
    this.energy -= def.cost;
    this.hand.splice(index, 1);
    const damage = Math.min(this.foeHp, def.damage ?? 0);
    this.foeHp -= damage;
    this.block += def.block ?? 0;
    this.energy += def.energy ?? 0;
    this.nextEnergy += def.nextEnergy ?? 0;
    const draws = (def.draw ?? 0) + (def.comboDraw && this.attacksPlayed > 0 ? 1 : 0);
    if (def.kind === '攻击') this.attacksPlayed++;
    // The played card enters discard AFTER its draw effect, avoiding self-redraw.
    if (this.foeHp > 0) this.draw(draws);
    this.discardPile.push(card);
    if (this.foeHp === 0) this.phase = 'won';
    this.revision++;
    return { ok: true, message: def.title, damage, block: def.block ?? 0 };
  }
  endTurn(minedEnergy = 0): BoardSettlement | false {
    if (this.phase !== 'player') return false;
    const settlement = this.settleBoard();
    // Keep the old optional argument useful for callers from the original combat prototype.
    const legacyMines = Math.max(0, Math.floor(minedEnergy));
    if (legacyMines) this.energyCap += legacyMines;
    this.discardPile.push(...this.hand.splice(0));
    this.phase = this.foeHp <= 0 ? 'won' : 'enemy';
    this.revision++;
    return legacyMines ? { ...settlement, mined: settlement.mined + legacyMines } : settlement;
  }
  strikeEnemy(): { damage: number; blocked: number; intentDamage: number; boardDamage: number } | null {
    if (this.phase !== 'enemy') return null;
    const boardDamage = this.units.filter(unit => unit.owner === 'enemy').reduce((sum, unit) => sum + (unit.attack ?? 0), 0);
    const incoming = this.intent + boardDamage;
    const blocked = Math.min(this.block, incoming);
    const damage = Math.min(this.heroHp, incoming - blocked);
    this.heroHp -= damage;
    this.block = 0;
    for (let i = this.units.length - 1; i >= 0; i--) if (this.units[i]!.owner === 'enemy') this.units.splice(i, 1);
    if (this.heroHp <= 0) this.phase = 'lost';
    this.revision++;
    return { damage, blocked, intentDamage: this.intent, boardDamage };
  }

  beginPlayerTurn(): boolean {
    if (this.phase !== 'enemy' || this.heroHp <= 0) return false;
    this.turn++;
    this.energy = this.turnEnergy = this.energyCap + this.nextEnergy;
    this.nextEnergy = this.attacksPlayed = 0;
    this.phase = 'player';
    this.draw(5);
    const cell = this.firstOpenCell();
    if (cell) this.units.push({ id: this.nextUnitId++, owner: 'enemy', kind: 'threat', col: cell.col, row: cell.row, attack: 2 });
    this.revision++;
    return true;
  }

  resolveEnemy(): { damage: number; blocked: number } | null {
    const hit = this.strikeEnemy();
    if (hit && this.phase === 'enemy') this.beginPlayerTurn();
    return hit;
  }
}
