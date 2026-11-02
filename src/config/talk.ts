export type TalkSide = 'left' | 'right';

export type TalkLine = {
  side: TalkSide;
  name: string;
  text: string;
};

export const TALK_SCRIPT: TalkLine[] = [
  { side: 'right', name: '老者', text: '先别动手。坐下，听我把这一桌的规矩说完。' },
  { side: 'left', name: '你', text: '……我该怎么打？' },
  { side: 'right', name: '老者', text: '放到格子上的牌会留下，那就是随从。鹿角打人，盾挡伤害。' },
  { side: 'right', name: '老者', text: '我也会在自己的回合放下随从。空着的邻格，会替它喷出法术。' },
  { side: 'right', name: '老者', text: '用你的随从堵住那些空格，法术就会变少。法术打完就没了，随从一直占着。' },
  { side: 'left', name: '你', text: '明白了。' },
  { side: 'right', name: '老者', text: '好。伸手吧。' },
];
