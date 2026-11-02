/** Slay the Spire-style glossary tags shown in gold on the card face. */
export const KEYWORD_IDS = ['permanent', 'consume', 'spell'] as const;
export type KeywordId = (typeof KEYWORD_IDS)[number];

export type KeywordDef = {
  id: KeywordId;
  label: string;
  hint: string;
};

export const KEYWORDS: Record<KeywordId, KeywordDef> = {
  permanent: {
    id: 'permanent',
    label: '永久',
    hint: '这张牌留在棋盘上，每回合都结算。',
  },
  consume: {
    id: 'consume',
    label: '消耗',
    hint: '结算一次后失效，仍占一格。',
  },
  spell: {
    id: 'spell',
    label: '法术',
    hint: '打出后立刻生效，不留在棋盘上。本场不会洗回抽牌堆。',
  },
};

export function isKeywordId(value: unknown): value is KeywordId {
  return value === 'permanent' || value === 'consume' || value === 'spell';
}

export function keywordList(ids: readonly KeywordId[] | undefined): KeywordDef[] {
  return (ids ?? []).map((id) => KEYWORDS[id]);
}

export function keywordMarkup(ids: readonly KeywordId[] | undefined): string {
  return keywordList(ids)
    .map(
      (keyword) =>
        `<span class="card-keyword card-keyword--${keyword.id}" data-keyword="${keyword.id}">${keyword.label}</span>`,
    )
    .join('');
}

export function keywordLabels(ids: readonly KeywordId[] | undefined): string {
  return keywordList(ids)
    .map((keyword) => keyword.label)
    .join('，');
}
