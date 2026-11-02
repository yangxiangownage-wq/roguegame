import type { CardKey } from '@/config/pieces';

export const SHOP_SIZE = 5;
export const SPELL_SLOT = 4;
export const REROLL_COST = 2;
export const WIN_GOLD = 10;
export const START_GOLD = 0;

export type ShopKind = 'unit' | 'spell';
export type ShopOffer = { key: CardKey; price: number; kind: ShopKind };
export type ShopSlot = ShopOffer | null;

export const UNIT_STOCK: readonly ShopOffer[] = [
  { key: 'blade', price: 3, kind: 'unit' },
  { key: 'leap', price: 3, kind: 'unit' },
  { key: 'hook', price: 3, kind: 'unit' },
];

export const SPELL_STOCK: readonly ShopOffer[] = [
  { key: 'ember', price: 2, kind: 'spell' },
  { key: 'hymn', price: 2, kind: 'spell' },
  { key: 'lamp', price: 2, kind: 'spell' },
];

const pick = <T>(pool: readonly T[], random: () => number): T => {
  return pool[Math.floor(random() * pool.length) % pool.length]!;
};

export function rollShop(random: () => number = Math.random): ShopSlot[] {
  const slots: ShopSlot[] = [];
  for (let i = 0; i < SPELL_SLOT; i++) slots.push({ ...pick(UNIT_STOCK, random) });
  slots.push({ ...pick(SPELL_STOCK, random) });
  return slots;
}

export function buyShopSlot(
  slots: ShopSlot[],
  index: number,
  gold: number,
): { ok: boolean; gold: number; offer: ShopOffer | null; message: string } {
  const offer = slots[index];
  if (!offer) return { ok: false, gold, offer: null, message: '这一格已经卖完' };
  if (gold < offer.price) return { ok: false, gold, offer: null, message: `金币不足，需要 ${offer.price} 金` };
  slots[index] = null;
  return { ok: true, gold: gold - offer.price, offer, message: offer.key };
}

export function rerollShop(
  slots: ShopSlot[],
  gold: number,
  random: () => number = Math.random,
): { ok: boolean; gold: number; slots: ShopSlot[]; message: string } {
  if (gold < REROLL_COST) {
    return { ok: false, gold, slots, message: `金币不足，刷新需要 ${REROLL_COST} 金` };
  }
  return { ok: true, gold: gold - REROLL_COST, slots: rollShop(random), message: '货架已换新' };
}
