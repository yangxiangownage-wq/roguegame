/** Shared by the board and the held placement preview. */
export const PIECE_ART = {
  mark: '/assets/chars/antlers.png?v=1',
  gold: '/assets/chars/coin-bag.png?v=1',
  slave: '/assets/chars/coin-bag.png?v=1',
  guard: '/assets/chars/iron-shield.png?v=1',
  energy: '/assets/chars/coin-bag.png?v=1',
  threat: '/assets/chars/foe.png',
  imp: '/assets/chars/druid-token.png?v=1',
} as const;
export type PieceKind = keyof typeof PIECE_ART;
export type CardKey = 'blade' | 'leap' | 'slash' | 'mist' | 'hook' | 'slave' | 'imp';
export const STANDING_PIECES: ReadonlySet<PieceKind> = new Set();
export type BoardUnit = {
  id: number;
  owner: 'player' | 'enemy';
  kind: Exclude<PieceKind, 'gold'>;
  col: number;
  row: number;
  source?: CardKey;
  attack?: number;
  armor?: number;
  energy?: number;
  mined?: boolean;
};
