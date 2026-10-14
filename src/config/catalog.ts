export type PersistKind = 'permanent' | 'consume';

export type CatalogCard = {
  id: string;
  title: string;
  cost: number;
  persist: PersistKind;
  description: string;
  art: string;
  attack: number;
  armor: number;
};

export type CatalogSave = {
  cards: CatalogCard[];
  selectedId: string;
  panelX: number;
  panelY: number;
};

export const COST_MIN = 0;
export const COST_MAX = 9;
export const STAT_MIN = 0;
export const STAT_MAX = 99;
export const TITLE_MAX = 8;
export const DESC_MAX = 80;

export const PERSIST_OPTIONS: Array<{ value: PersistKind; label: string; hint: string }> = [
  { value: 'permanent', label: '永久', hint: '每回合结算，一直生效。' },
  { value: 'consume', label: '消耗', hint: '结算一次后失效，卡牌仍占格。' },
];

export const ART_PRESETS: Array<{ label: string; src: string }> = [
  { label: '剑', src: '/assets/icons/attack.png' },
  { label: '英雄', src: '/assets/chars/hero.png' },
  { label: '敌人', src: '/assets/chars/foe.png' },
  { label: '矿工', src: '/assets/chars/slave.png' },
  { label: '金矿', src: '/assets/icons/gold-mine.png?v=3' },
];

const SAVE_KEY = 'roguegame.card-catalog';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function uid(): string {
  return `card_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function persistLabel(kind: PersistKind): string {
  return kind === 'consume' ? '消耗' : '永久';
}

export function createCatalogCard(partial: Partial<CatalogCard> = {}): CatalogCard {
  return {
    id: partial.id ?? uid(),
    title: partial.title ?? '打击',
    cost: clamp(partial.cost ?? 1, COST_MIN, COST_MAX),
    persist: partial.persist === 'consume' ? 'consume' : 'permanent',
    description: partial.description ?? '留在棋盘上；每回合结算给左边 4 点攻击。',
    art: partial.art ?? '/assets/icons/attack.png',
    attack: clamp(partial.attack ?? 4, STAT_MIN, STAT_MAX),
    armor: clamp(partial.armor ?? 0, STAT_MIN, STAT_MAX),
  };
}

export function createDefaultCatalog(): CatalogSave {
  const card = createCatalogCard();
  return {
    cards: [card],
    selectedId: card.id,
    panelX: 1480,
    panelY: 48,
  };
}

function readInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), min, max);
}

function parseCard(raw: unknown): CatalogCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.slice(0, TITLE_MAX) : '打击';
  const description = typeof o.description === 'string' ? o.description.slice(0, DESC_MAX) : '';
  const art = typeof o.art === 'string' ? o.art : '';
  const persist: PersistKind = o.persist === 'consume' ? 'consume' : 'permanent';
  const id = typeof o.id === 'string' && o.id ? o.id : uid();
  return createCatalogCard({
    id,
    title,
    description,
    art,
    persist,
    cost: readInt(o.cost, 1, COST_MIN, COST_MAX),
    attack: readInt(o.attack, 0, STAT_MIN, STAT_MAX),
    armor: readInt(o.armor, 0, STAT_MIN, STAT_MAX),
  });
}

export function loadCatalog(): CatalogSave {
  const fallback = createDefaultCatalog();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const cards = Array.isArray(o.cards)
      ? o.cards.map(parseCard).filter((c): c is CatalogCard => c !== null)
      : [];
    if (!cards.length) return fallback;
    const selectedId =
      typeof o.selectedId === 'string' && cards.some((c) => c.id === o.selectedId)
        ? o.selectedId
        : cards[0]!.id;
    return {
      cards,
      selectedId,
      panelX: readInt(o.panelX, fallback.panelX, 0, 1920),
      panelY: readInt(o.panelY, fallback.panelY, 0, 1080),
    };
  } catch {
    return fallback;
  }
}

export function saveCatalog(save: CatalogSave): void {
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      cards: save.cards,
      selectedId: save.selectedId,
      panelX: save.panelX,
      panelY: save.panelY,
    }),
  );
}

export function selectedCard(save: CatalogSave): CatalogCard {
  return save.cards.find((c) => c.id === save.selectedId) ?? save.cards[0]!;
}

export async function readArtFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const max = 512;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2d canvas unavailable');
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}
