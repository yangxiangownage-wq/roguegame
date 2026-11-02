import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/game/battle.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { Battle, CARD_DEFS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const DECK_SIZE = 10;
const fresh = () => new Battle(() => 0.4);
const cardId = (b, key) => b.hand.find(c => c.key === key).id;
const keysOf = cards => cards.map(c => c.key);
const conserved = b => {
  const cards = [...b.hand, ...b.drawPile, ...b.discardPile, ...b.exhaustPile];
  assert.equal(cards.length, DECK_SIZE, 'deck size is conserved');
  assert.equal(new Set(cards.map(c => c.id)).size, DECK_SIZE, 'no duplicate instances');
  assert(cards.every(c => c.key === 'blade' || c.key === 'leap'), 'first fight only antlers and shield');
  assert.equal(b.exhaustPile.length, 0);
  assert(b.energy >= 0 && b.heroHp >= 0 && b.foeHp >= 0);
};
{
  const b = fresh();
  assert.equal(b.hand.length, 5);
  assert.equal(b.drawPile.length, 5);
  assert.deepEqual(keysOf(b.hand), ['blade', 'leap', 'blade', 'leap', 'blade']);
  assert.equal(CARD_DEFS.blade.title, '鹿角');
  assert.equal(CARD_DEFS.leap.title, '盾');
  assert.deepEqual(CARD_DEFS.blade.keywords, ['permanent']);
  assert.deepEqual(CARD_DEFS.leap.keywords, ['permanent']);
  const id = cardId(b, 'blade');
  assert.equal(b.play(id).damage, 4);
  assert.equal(b.foeHp, 32);
  assert.equal(b.energy, 2);
  assert.equal(b.hand.length, 4);
  assert.equal(b.play(id).ok, false, 'cannot play one instance twice');
  b.energy = 0;
  const snapshot = JSON.stringify(b);
  assert.equal(b.play(cardId(b, 'leap')).ok, false);
  assert.equal(JSON.stringify(b), snapshot, 'insufficient energy never mutates state');
  conserved(b);
}
{
  const b = fresh();
  b.play(cardId(b, 'leap'));
  assert.equal(b.block, 4);
  assert.equal(b.nextEnergy, 0);
  assert(b.endTurn());
  assert.equal(b.endTurn(), false);
  assert.equal(b.hand.length, 0);
  assert.deepEqual(b.resolveEnemy(), { damage: 2, blocked: 4, intentDamage: 6, boardDamage: 0 });
  assert.equal(b.energy, 3);
  assert.equal(b.block, 0);
  assert.equal(b.heroHp, 18);
  assert.equal(b.intent, 8);
  assert.equal(b.units.some(unit => unit.owner === 'enemy'), false, 'first fight does not spawn board threats');
  assert.equal(b.resolveEnemy(), null, 'enemy only acts once per end turn');
  conserved(b);
}
{
  const b = fresh();
  b.play(cardId(b, 'leap'));
  b.endTurn();
  assert.deepEqual(b.resolveEnemy(), { damage: 2, blocked: 4, intentDamage: 6, boardDamage: 0 });
  assert.equal(b.heroHp, 18);
  b.draw(100);
  assert.equal(b.hand.length, 10, 'hand limit');
  conserved(b);
}
{
  const b = fresh();
  while (b.phase === 'player') { b.endTurn(); b.resolveEnemy(); conserved(b); }
  assert.equal(b.phase, 'lost');
  assert.equal(b.heroHp, 0);
  assert.equal(b.endTurn(), false);
  b.reset();
  assert.equal(b.phase, 'player');
  assert.equal(b.heroHp, 20);
  assert.equal(b.discardPile.length, 0);
  assert.deepEqual(keysOf(b.hand), ['blade', 'leap', 'blade', 'leap', 'blade']);
}
{
  const b = fresh();
  b.foeHp = 4;
  b.play(cardId(b, 'blade'));
  assert.equal(b.phase, 'won');
  assert.equal(b.foeHp, 0);
  assert.equal(b.endTurn(), false);
  assert.equal(b.play(b.hand[0].id).ok, false);
  conserved(b);
}
for (let seed = 1; seed <= 80; seed++) {
  let randomState = seed;
  const random = () => ((randomState = Math.imul(randomState, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  const b = new Battle(random);
  let plays = 0;
  while (b.phase === 'player' && plays < 300) {
    const playable = b.hand.filter(c => CARD_DEFS[c.key].cost <= b.energy);
    if (playable.length && random() > 0.15) {
      assert(b.play(playable[Math.floor(random() * playable.length)].id).ok);
      plays++;
    } else { b.endTurn(); b.resolveEnemy(); }
    conserved(b);
  }
  assert(['won', 'lost'].includes(b.phase), 'combat reaches a terminal state');
}
console.log('Battle checks passed: antlers/shield only, energy, block, turns, reshuffle, hand limit, win/loss/reset, 80 simulated combats.');
{
  const b = fresh();
  const snapshot = { hero: b.heroHp, foe: b.foeHp, block: b.block };
  const id = cardId(b, 'blade');
  assert(b.placeCard(id).ok);
  assert.equal(b.hand.length, 4, 'placement consumes one card');
  assert.equal(b.energy, 2);
  assert.deepEqual({ hero: b.heroHp, foe: b.foeHp, block: b.block }, snapshot, 'placement never triggers direct combat');
  assert.equal(b.placeCard(id).ok, false);
  assert(b.placeCard(cardId(b, 'leap')).ok);
  assert.equal(b.placeCard(cardId(b, 'leap')).ok, true);
  assert.equal(b.energy, 0);
  assert.equal(b.placeCard(cardId(b, 'blade')).ok, false);
  const settlement = b.endTurn();
  assert.equal(settlement.damage, 4);
  assert.equal(settlement.armor, 8);
  assert.equal(b.foeHp, 32);
  assert.equal(b.block, 8);
  assert(b.nextPlacementTurn() === false, 'endTurn already left the player phase');
  conserved(b);
}
{
  const b = fresh();
  const snapshot = { hero: b.heroHp, foe: b.foeHp, block: b.block };
  assert(b.placeCard(cardId(b, 'blade')).ok);
  assert(b.placeCard(cardId(b, 'leap')).ok);
  assert(b.nextPlacementTurn());
  assert.equal(b.hand.length, 5);
  assert.equal(b.energy, 3);
  assert.equal(b.turn, 2);
  assert.deepEqual({ hero: b.heroHp, foe: b.foeHp, block: b.block }, snapshot, 'refill never attacks either fighter');
  conserved(b);
}
console.log('Placement checks passed: spend, duplicate prevention, energy, refill, no direct damage.');
{
  const b = new Battle(() => 0.4);
  b.reset(['ember', 'hymn', 'lamp', 'blade', 'leap'], true);
  assert.equal(CARD_DEFS.ember.kind, '法术');
  const ember = b.placeCard(cardId(b, 'ember'));
  assert.equal(ember.ok, true);
  assert.equal(ember.spell, true);
  assert.equal(b.units.length, 0);
  assert.equal(b.foeHp, 28);
  assert.equal(b.exhaustPile.length, 1);
  assert.equal(b.placeCard(cardId(b, 'hymn')).ok, true);
  assert.equal(b.block, 8);
  assert.equal(b.placeCard(cardId(b, 'lamp')).ok, true);
  assert.equal(b.nextEnergy, 1);
  assert.equal(b.exhaustPile.length, 3);
  assert.equal(b.hand.length, 2);
}
console.log('Spell checks passed: instant resolve, no board piece, exhaust pile.');
