export type CardKey = 'blade' | 'leap' | 'slash' | 'mist' | 'hook' | 'slave';
export type CardDefinition = {
  title: string; cost: number; kind: '攻击' | '技能';
  description: string[]; damage?: number; block?: number; draw?: number;
  energy?: number; nextEnergy?: number; comboDraw?: boolean;
  art: 'hero' | 'foe' | 'sword' | 'slave'; tone: string;
};
export const CARD_DEFS: Record<CardKey, CardDefinition> = {
  blade: { title: '飞刃', cost: 1, kind: '攻击', description: ['造成 4 点伤害。', '抽 1 张牌。'], damage: 4, draw: 1, art: 'sword', tone: 'crimson' },
  leap: { title: '跃起', cost: 1, kind: '技能', description: ['获得 4 点格挡。', '抽 1 张牌。'], block: 4, draw: 1, art: 'hero', tone: 'teal' },
  slash: { title: '海盗斩击', cost: 2, kind: '攻击', description: ['造成 8 点伤害。', '本回合打出过其他攻击牌，', '则抽 1 张牌。'], damage: 8, comboDraw: true, art: 'foe', tone: 'crimson' },
  mist: { title: '雾影步', cost: 0, kind: '技能', description: ['获得 6 点格挡。', '下回合额外获得 1 点能量。'], block: 6, nextEnergy: 1, art: 'hero', tone: 'teal' },
  hook: { title: '钩掠', cost: 1, kind: '攻击', description: ['造成 5 点伤害。', '获得 1 点能量。'], damage: 5, energy: 1, art: 'sword', tone: 'amber' },
  slave: { title: '奴隶', cost: 1, kind: '技能', description: ['放入 1 个奴隶。', '回合结束时，若相邻金矿则挖矿，能量上限 +1。'], art: 'slave', tone: 'crimson' },
};
export type BattleCard = { id: number; key: CardKey };
export type Phase = 'player' | 'enemy' | 'won' | 'lost';
export type PlayResult = { ok: boolean; message: string; damage: number; block: number };
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
  phase: Phase = 'player';
  revision = 0;
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
    this.phase = 'player';
    this.discardPile = [];
    // A readable first hand teaches all five mechanics; subsequent draws are shuffled.
    const deck = STARTING_DECK.map((key, id) => ({ id, key }));
    this.hand = deck.slice(0, 5);
    this.drawPile = this.shuffle(deck.slice(5));
    this.revision++;
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
  placeCard(id: number): { ok: boolean; message: string } {
    const index = this.hand.findIndex(card => card.id === id);
    if (this.phase !== 'player' || index < 0) return { ok: false, message: '现在不能放置' };
    const card = this.hand[index]!;
    const def = CARD_DEFS[card.key];
    if (this.energy < def.cost) return { ok: false, message: `能量不足，需要 ${def.cost} 点能量` };
    this.energy -= def.cost;
    this.hand.splice(index, 1);
    this.discardPile.push(card);
    this.revision++;
    return { ok: true, message: def.title };
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
  endTurn(minedEnergy = 0): boolean {
    if (this.phase !== 'player') return false;
    this.energyCap += Math.max(0, Math.floor(minedEnergy));
    this.discardPile.push(...this.hand.splice(0));
    this.phase = 'enemy';
    this.revision++;
    return true;
  }
  strikeEnemy(): { damage: number; blocked: number } | null {
    if (this.phase !== 'enemy') return null;
    const blocked = Math.min(this.block, this.intent);
    const damage = Math.min(this.heroHp, this.intent - blocked);
    this.heroHp -= damage;
    this.block = 0;
    if (this.heroHp <= 0) this.phase = 'lost';
    this.revision++;
    return { damage, blocked };
  }

  beginPlayerTurn(): boolean {
    if (this.phase !== 'enemy' || this.heroHp <= 0) return false;
    this.turn++;
    this.energy = this.turnEnergy = this.energyCap + this.nextEnergy;
    this.nextEnergy = this.attacksPlayed = 0;
    this.phase = 'player';
    this.draw(5);
    this.revision++;
    return true;
  }

  resolveEnemy(): { damage: number; blocked: number } | null {
    const hit = this.strikeEnemy();
    if (hit && this.phase === 'enemy') this.beginPlayerTurn();
    return hit;
  }
}
