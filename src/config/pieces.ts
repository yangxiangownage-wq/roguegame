/** Shared by the board and the held placement preview. */
export const PIECE_ART = {
  mark: '/assets/icons/attack.png',
  gold: '/assets/icons/gold-mine.png?v=3',
  slave: '/assets/icons/slave.png',
} as const;
export type PieceKind = keyof typeof PIECE_ART;
