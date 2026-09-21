import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/design';

export type BoardSettings = {
  cols: number;
  rows: number;
  tileSize: number;
  tileGap: number;
  trayColor: string;
  trayPad: number;
};

export const TILE_SIZE_MIN = 24;
export const TILE_SIZE_MAX = 280;
export const GRID_MIN = 1;
export const GRID_MAX = 16;
export const GAP_MIN = 0;
export const GAP_MAX = 48;

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
  x: number;
  y: number;
} {
  const pitch = s.tileSize + s.tileGap;
  const spanW = s.cols * s.tileSize + Math.max(0, s.cols - 1) * s.tileGap;
  const spanH = s.rows * s.tileSize + Math.max(0, s.rows - 1) * s.tileGap;
  return {
    pitch,
    spanW,
    spanH,
    x: Math.round((DESIGN_WIDTH - spanW) / 2),
    y: Math.round((DESIGN_HEIGHT - spanH) / 2),
  };
}
