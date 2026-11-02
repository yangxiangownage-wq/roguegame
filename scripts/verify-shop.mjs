import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/game/shop.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const {
  SPELL_SLOT, SHOP_SIZE, REROLL_COST, rollShop, buyShopSlot, rerollShop, SPELL_STOCK, UNIT_STOCK,
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
  assert.equal(SPELL_SLOT, SHOP_SIZE - 1);
  for (let i = 0; i < SPELL_SLOT; i++) {
    assert.equal(slots[i].kind, 'unit');
    assert(unitKeys.has(slots[i].key));
  }
  assert.equal(slots[SPELL_SLOT].kind, 'spell');
  assert(spellKeys.has(slots[SPELL_SLOT].key));
}

{
  const slots = rollShop(() => 0.1);
  const last = slots[SPELL_SLOT];
  const poor = buyShopSlot(slots, SPELL_SLOT, 0);
  assert.equal(poor.ok, false);
  assert.equal(slots[SPELL_SLOT].key, last.key);
  const bought = buyShopSlot(slots, SPELL_SLOT, last.price);
  assert.equal(bought.ok, true);
  assert.equal(bought.gold, 0);
  assert.equal(slots[SPELL_SLOT], null);
  assert.equal(bought.offer.kind, 'spell');
}

{
  const slots = rollShop(() => 0.2);
  const broke = rerollShop(slots, 1, () => 0.9);
  assert.equal(broke.ok, false);
  const fresh = rerollShop(slots, REROLL_COST, () => 0.81);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.gold, 0);
  assert.equal(fresh.slots[SPELL_SLOT].kind, 'spell');
  assert.equal(fresh.slots.length, SHOP_SIZE);
}

console.log('Shop checks passed: five TFT slots, last slot always a spell, buy, reroll.');
