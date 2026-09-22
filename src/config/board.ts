import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/design';

export type BoardSettings = {
  cols: number;
  rows: number;
  tileSize: number;
  tileGap: number;
  trayColor: string;
  trayPad: number;
  /** Design-pixel shift of the board from its centered origin. */
  boardNudgeX: number;
  boardNudgeY: number;
  /** Design-pixel shift of each fighter card from its slot beside the centered board. */
  heroNudgeX: number;
  heroNudgeY: number;
  foeNudgeX: number;
  foeNudgeY: number;
  /** Hand-card size as a percent of the 200×300 base. 100 keeps the current look. */
  handCardScale: number;
};

export const TILE_SIZE_MIN = 24;
export const TILE_SIZE_MAX = 280;
export const GRID_MIN = 1;
export const GRID_MAX = 16;
export const GAP_MIN = 0;
export const GAP_MAX = 48;
export const NUDGE_X_MIN = -960;
export const NUDGE_X_MAX = 960;
export const NUDGE_Y_MIN = -540;
export const NUDGE_Y_MAX = 540;
export const HAND_SCALE_MIN = 40;
export const HAND_SCALE_MAX = 200;

const SAVE_KEY = 'roguegame.board-editor';

export type EditorSave = {
  settings: BoardSettings;
  panelX: number;
  panelY: number;
  hidden: boolean;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function createBoardSettings(): BoardSettings {
  return {
    cols: 5,
    rows: 5,
    tileSize: 126,
    tileGap: 10,
    trayColor: '#1a120e',
    trayPad: 5,
    boardNudgeX: 0,
    boardNudgeY: 0,
    heroNudgeX: 0,
    heroNudgeY: 0,
    foeNudgeX: 0,
    foeNudgeY: 0,
    handCardScale: 100,
  };
}

export function defaultEditorSave(): EditorSave {
  return {
    settings: createBoardSettings(),
    panelX: 1524,
    panelY: 96,
    hidden: false,
  };
}

function readInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function parseSettings(raw: unknown): BoardSettings {
  const d = createBoardSettings();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const color = typeof o.trayColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.trayColor)
    ? o.trayColor.toLowerCase()
    : d.trayColor;
  return {
    cols: readInt(o.cols, d.cols, GRID_MIN, GRID_MAX),
    rows: readInt(o.rows, d.rows, GRID_MIN, GRID_MAX),
    tileSize: readInt(o.tileSize, d.tileSize, TILE_SIZE_MIN, TILE_SIZE_MAX),
    tileGap: readInt(o.tileGap, d.tileGap, GAP_MIN, GAP_MAX),
    trayColor: color,
    trayPad: d.trayPad,
    boardNudgeX: readInt(o.boardNudgeX, d.boardNudgeX, NUDGE_X_MIN, NUDGE_X_MAX),
    boardNudgeY: readInt(o.boardNudgeY, d.boardNudgeY, NUDGE_Y_MIN, NUDGE_Y_MAX),
    heroNudgeX: readInt(o.heroNudgeX, d.heroNudgeX, NUDGE_X_MIN, NUDGE_X_MAX),
    heroNudgeY: readInt(o.heroNudgeY, d.heroNudgeY, NUDGE_Y_MIN, NUDGE_Y_MAX),
    foeNudgeX: readInt(o.foeNudgeX, d.foeNudgeX, NUDGE_X_MIN, NUDGE_X_MAX),
    foeNudgeY: readInt(o.foeNudgeY, d.foeNudgeY, NUDGE_Y_MIN, NUDGE_Y_MAX),
    handCardScale: readInt(o.handCardScale, d.handCardScale, HAND_SCALE_MIN, HAND_SCALE_MAX),
  };
}

export function loadEditorSave(): EditorSave {
  const fallback = defaultEditorSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      settings: parseSettings(o.settings),
      panelX: readInt(o.panelX, fallback.panelX, 0, DESIGN_WIDTH),
      panelY: readInt(o.panelY, fallback.panelY, 0, DESIGN_HEIGHT),
      hidden: Boolean(o.hidden),
    };
  } catch {
    return fallback;
  }
}

export function saveEditorSave(data: EditorSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function boardMetrics(s: BoardSettings): {
  pitch: number;
  spanW: number;
  spanH: number;
  /** Centered origin, before the board nudge. Fighter slots hang off this. */
  originX: number;
  originY: number;
  x: number;
  y: number;
} {
  const pitch = s.tileSize + s.tileGap;
  const spanW = s.cols * s.tileSize + Math.max(0, s.cols - 1) * s.tileGap;
  const spanH = s.rows * s.tileSize + Math.max(0, s.rows - 1) * s.tileGap;
  const originX = Math.round((DESIGN_WIDTH - spanW) / 2);
  const originY = Math.round((DESIGN_HEIGHT - spanH) / 2);
  return {
    pitch,
    spanW,
    spanH,
    originX,
    originY,
    x: originX + s.boardNudgeX,
    y: originY + s.boardNudgeY,
  };
}
