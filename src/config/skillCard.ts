export type SkillCardData = {
  cost: number;
  tag: string;
  title: string;
};

export const COST_MIN = 0;
export const COST_MAX = 9;

export const TAG_OPTIONS = ['攻击', '技能'] as const;

export function createSkillCard(): SkillCardData {
  return {
    cost: 1,
    tag: '攻击',
    title: '打击',
  };
}

/** Preview size in design pixels (matches frame PNG ratio). */
export const CARD_W = 400;
export const CARD_H = 606;

/** Layout as fractions of the drawn card. */
export const CARD_LAYOUT = {
  costX: -0.012,
  costY: -0.008,
  costSize: 0.2,
  tagY: 0.618,
  tagW: 0.3,
  titleY: 0.152,
} as const;
