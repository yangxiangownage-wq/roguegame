/** Shared by the board and the held placement preview. */
export const PIECE_ART = {
  mark: '/assets/tiles/face-antlers.png?v=2',
  gold: '/assets/tiles/face-bag.png?v=2',
  slave: '/assets/tiles/face-bag.png?v=2',
  guard: '/assets/tiles/face-shield.png?v=2',
  energy: '/assets/tiles/face-shield.png?v=2',
  threat: '/assets/chars/foe.png',
  imp: '/assets/tiles/face-unit.png?v=2',
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
