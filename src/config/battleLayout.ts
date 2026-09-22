import { boardMetrics, type BoardSettings } from './board';

/** Board geometry stays fixed while the hand opens above it as an overlay. */
export function battleLayout(settings: BoardSettings) {
  const m = boardMetrics(settings);
  const scale = Math.min(1, 840 / (m.spanH + 12), 1670 / (m.spanW + 608));
  const centerY = 540;
  const heroTop = centerY + (-250 + settings.heroNudgeY) * scale;
  const heroBottom = centerY + (250 + settings.heroNudgeY) * scale;
  const foeTop = centerY + (-250 + settings.foeNudgeY) * scale;
  const foeBottom = centerY + (250 + settings.foeNudgeY) * scale;
  return {
    scale, centerY,
    boardBottom: centerY + (m.spanH / 2 + settings.boardNudgeY) * scale,
    heroX: 960 - (m.spanW / 2 + 170 - settings.heroNudgeX) * scale,
    foeX: 960 + (m.spanW / 2 + 170 + settings.foeNudgeX) * scale,
    heroTop,
    heroBottom,
    foeTop,
    foeBottom,
    fighterTop: centerY - 250 * scale,
    fighterBottom: centerY + 250 * scale,
  };
}

/** Grid gaps and the area outside the board are deliberately not valid targets. */
export function boardTarget(settings: BoardSettings, x: number, y: number) {
  const layout = battleLayout(settings);
  const m = boardMetrics(settings);
  const bx = (x - 960) / layout.scale + 960 - m.x;
  const by = (y - layout.centerY) / layout.scale + 540 - m.y;
  const col = Math.floor(bx / m.pitch);
  const row = Math.floor(by / m.pitch);
  if (col < 0 || row < 0 || col >= settings.cols || row >= settings.rows || bx - col * m.pitch >= settings.tileSize || by - row * m.pitch >= settings.tileSize) return null;
  return {
    col, row,
    x: 960 + (m.x + col * m.pitch - 960) * layout.scale,
    y: layout.centerY + (m.y + row * m.pitch - 540) * layout.scale,
    size: settings.tileSize * layout.scale,
  };
}

/** The whole tray, including gaps and rim, counts as a board click. */
export function isBoardArea(settings: BoardSettings, x: number, y: number): boolean {
  const m = boardMetrics(settings);
  const { scale, centerY } = battleLayout(settings);
  const halfW = (m.spanW / 2 + settings.trayPad) * scale;
  const halfH = (m.spanH / 2 + settings.trayPad) * scale;
  const cx = 960 + (m.x + m.spanW / 2 - 960) * scale;
  const cy = centerY + (m.y + m.spanH / 2 - 540) * scale;
  return Math.abs(x - cx) <= halfW && Math.abs(y - cy) <= halfH;
}
