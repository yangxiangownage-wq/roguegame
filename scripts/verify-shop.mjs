import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/game/shop.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const {
  UNIT_SLOT, SHOP_SIZE, SPELL_COUNT, REROLL_COST, rollShop, buyShopSlot, rerollShop, SPELL_STOCK, UNIT_STOCK,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const spellKeys = new Set(SPELL_STOCK.map(item => item.key));
const unitKeys = new Set(UNIT_STOCK.map(item => item.key));

for (let n = 0; n < 60; n++) {
  let state = n + 1;
  const random = () => {
    state = Math.imul(state, 1664525) + 1013904223 >>> 0;
    return state / 2 ** 32;
  };
  const slots = rollShop(random);
  assert.equal(slots.length, SHOP_SIZE);
  assert.equal(UNIT_SLOT, SHOP_SIZE - 1);
  assert.equal(SPELL_COUNT, 3);
  const seen = new Set();
  for (let i = 0; i < SPELL_COUNT; i++) {
    assert.equal(slots[i].kind, 'spell');
    assert(spellKeys.has(slots[i].key));
    seen.add(slots[i].key);
  }
  assert.equal(seen.size, SPELL_COUNT);
  assert.equal(slots[UNIT_SLOT].kind, 'unit');
  assert(unitKeys.has(slots[UNIT_SLOT].key));
}

{
  const slots = rollShop(() => 0.1);
  const last = slots[UNIT_SLOT];
  const poor = buyShopSlot(slots, UNIT_SLOT, 0);
  assert.equal(poor.ok, false);
  assert.equal(slots[UNIT_SLOT].key, last.key);
  const bought = buyShopSlot(slots, UNIT_SLOT, last.price);
  assert.equal(bought.ok, true);
  assert.equal(bought.gold, 0);
  assert.equal(slots[UNIT_SLOT], null);
  assert.equal(bought.offer.kind, 'unit');
}

{
  const slots = rollShop(() => 0.2);
  const broke = rerollShop(slots, 1, () => 0.9);
  assert.equal(broke.ok, false);
  const fresh = rerollShop(slots, REROLL_COST, () => 0.81);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.gold, 0);
  assert.equal(fresh.slots[UNIT_SLOT].kind, 'unit');
  assert.equal(fresh.slots.length, SHOP_SIZE);
  assert.equal(fresh.slots.filter(slot => slot.kind === 'spell').length, SPELL_COUNT);
}

console.log('Shop checks passed: four slots, three unique spells then one minion, buy, reroll.');
