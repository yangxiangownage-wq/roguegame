export type TalkSide = 'left' | 'right';

export type TalkLine = {
  side: TalkSide;
  name: string;
  text: string;
};

export const TALK_SCRIPT: TalkLine[] = [
  { side: 'right', name: '老者', text: '先别动手。坐下，听我把这一桌的规矩说完。' },
  { side: 'left', name: '你', text: '……我该怎么打？' },
  { side: 'right', name: '老者', text: '把牌放到格子上。牌会留在那里，每回合替你出力。' },
  { side: 'right', name: '老者', text: '鹿角加攻击，盾加护甲。能量用完，就结束回合。' },
  { side: 'left', name: '你', text: '结束之后呢？' },
  { side: 'right', name: '老者', text: '棋盘结算完，你从左边打出去，打的是我这边。挡住来袭，打空生命，这一桌就算你赢。' },
  { side: 'left', name: '你', text: '明白了。' },
  { side: 'right', name: '老者', text: '好。伸手吧。' },
];
