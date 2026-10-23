/** Shared by the board and the held placement preview. */
export const PIECE_ART = {
  mark: '/assets/icons/attack.png',
  gold: '/assets/icons/gold-mine.png?v=3',
  slave: '/assets/icons/slave.png',
  guard: '/assets/icons/slave.png',
  energy: '/assets/icons/gold-mine.png?v=3',
  threat: '/assets/chars/foe.png',
  imp: '/assets/chars/imp.png?v=1',
} as const;
export type PieceKind = keyof typeof PIECE_ART;
export type CardKey = 'blade' | 'leap' | 'slash' | 'mist' | 'hook' | 'slave' | 'imp';
export const STANDING_PIECES: ReadonlySet<PieceKind> = new Set(['imp']);
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
