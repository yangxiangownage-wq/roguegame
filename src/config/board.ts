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
  /** Pixels to raise the hand. Positive moves the cards up; 0 is the current resting height. */
  handCardY: number;
  /** Fan spacing as a percent of the default gap. Lower packs the cards closer together. */
  handCardSpread: number;
  energyNudgeX: number;
  energyNudgeY: number;
  energyScale: number;
  drawNudgeX: number;
  drawNudgeY: number;
  drawScale: number;
  discardNudgeX: number;
  discardNudgeY: number;
  discardScale: number;
  endNudgeX: number;
  endNudgeY: number;
  endScale: number;
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
export const HAND_LIFT_MIN = -240;
export const HAND_LIFT_MAX = 480;
export const HAND_SPREAD_MIN = 20;
export const HAND_SPREAD_MAX = 200;
export const HUD_SCALE_MIN = 40;
export const HUD_SCALE_MAX = 200;

const SAVE_KEY = 'roguegame.board-editor';

export type EditorSave = {
  settings: BoardSettings;
  panelX: number;
  panelY: number;
  hidden: boolean;
  hudPanelX: number;
  hudPanelY: number;
  hudHidden: boolean;
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
    handCardY: 0,
    handCardSpread: 100,
    energyNudgeX: 0,
    energyNudgeY: 0,
    energyScale: 100,
    drawNudgeX: 0,
    drawNudgeY: 0,
    drawScale: 100,
    discardNudgeX: 0,
    discardNudgeY: 0,
    discardScale: 100,
    endNudgeX: 0,
    endNudgeY: 0,
    endScale: 100,
  };
}

export function defaultEditorSave(): EditorSave {
  return {
    settings: createBoardSettings(),
    panelX: 1524,
    panelY: 96,
    hidden: false,
    hudPanelX: 1148,
    hudPanelY: 96,
    hudHidden: true,
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
    handCardY: readInt(o.handCardY, d.handCardY, HAND_LIFT_MIN, HAND_LIFT_MAX),
    handCardSpread: readInt(o.handCardSpread, d.handCardSpread, HAND_SPREAD_MIN, HAND_SPREAD_MAX),
    energyNudgeX: readInt(o.energyNudgeX, d.energyNudgeX, NUDGE_X_MIN, NUDGE_X_MAX),
    energyNudgeY: readInt(o.energyNudgeY, d.energyNudgeY, NUDGE_Y_MIN, NUDGE_Y_MAX),
    energyScale: readInt(o.energyScale, d.energyScale, HUD_SCALE_MIN, HUD_SCALE_MAX),
    drawNudgeX: readInt(o.drawNudgeX, d.drawNudgeX, NUDGE_X_MIN, NUDGE_X_MAX),
    drawNudgeY: readInt(o.drawNudgeY, d.drawNudgeY, NUDGE_Y_MIN, NUDGE_Y_MAX),
    drawScale: readInt(o.drawScale, d.drawScale, HUD_SCALE_MIN, HUD_SCALE_MAX),
    discardNudgeX: readInt(o.discardNudgeX, d.discardNudgeX, NUDGE_X_MIN, NUDGE_X_MAX),
    discardNudgeY: readInt(o.discardNudgeY, d.discardNudgeY, NUDGE_Y_MIN, NUDGE_Y_MAX),
    discardScale: readInt(o.discardScale, d.discardScale, HUD_SCALE_MIN, HUD_SCALE_MAX),
    endNudgeX: readInt(o.endNudgeX, d.endNudgeX, NUDGE_X_MIN, NUDGE_X_MAX),
    endNudgeY: readInt(o.endNudgeY, d.endNudgeY, NUDGE_Y_MIN, NUDGE_Y_MAX),
    endScale: readInt(o.endScale, d.endScale, HUD_SCALE_MIN, HUD_SCALE_MAX),
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
      hudPanelX: readInt(o.hudPanelX, fallback.hudPanelX, 0, DESIGN_WIDTH),
      hudPanelY: readInt(o.hudPanelY, fallback.hudPanelY, 0, DESIGN_HEIGHT),
      hudHidden: o.hudHidden === undefined ? fallback.hudHidden : Boolean(o.hudHidden),
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
