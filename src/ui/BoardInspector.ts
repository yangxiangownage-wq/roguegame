import {
  GAP_MAX,
  GAP_MIN,
  GRID_MAX,
  GRID_MIN,
  HAND_SCALE_MAX,
  HAND_SCALE_MIN,
  NUDGE_X_MAX,
  NUDGE_X_MIN,
  NUDGE_Y_MAX,
  NUDGE_Y_MIN,
  TILE_SIZE_MAX,
  TILE_SIZE_MIN,
  saveEditorSave,
  type BoardSettings,
  type EditorSave,
} from '@/config/board';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  clientToDesign,
  computeDesignFit,
} from '@/config/design';

type NumericKey =
  | 'tileSize'
  | 'cols'
  | 'rows'
  | 'tileGap'
  | 'boardNudgeX'
  | 'boardNudgeY'
  | 'heroNudgeX'
  | 'heroNudgeY'
  | 'foeNudgeX'
  | 'foeNudgeY'
  | 'handCardScale';

type Field = {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

const FIELDS: Field[] = [
  { key: 'tileSize', label: '格子大小', min: TILE_SIZE_MIN, max: TILE_SIZE_MAX, step: 1 },
  { key: 'cols', label: '列数', min: GRID_MIN, max: GRID_MAX, step: 1 },
  { key: 'rows', label: '行数', min: GRID_MIN, max: GRID_MAX, step: 1 },
  { key: 'tileGap', label: '间距', min: GAP_MIN, max: GAP_MAX, step: 1 },
];

const POSITION_FIELDS: Field[] = [
  { key: 'boardNudgeX', label: '棋盘 X', min: NUDGE_X_MIN, max: NUDGE_X_MAX, step: 1 },
  { key: 'boardNudgeY', label: '棋盘 Y', min: NUDGE_Y_MIN, max: NUDGE_Y_MAX, step: 1 },
  { key: 'heroNudgeX', label: '左卡 X', min: NUDGE_X_MIN, max: NUDGE_X_MAX, step: 1 },
  { key: 'heroNudgeY', label: '左卡 Y', min: NUDGE_Y_MIN, max: NUDGE_Y_MAX, step: 1 },
  { key: 'foeNudgeX', label: '右卡 X', min: NUDGE_X_MIN, max: NUDGE_X_MAX, step: 1 },
  { key: 'foeNudgeY', label: '右卡 Y', min: NUDGE_Y_MIN, max: NUDGE_Y_MAX, step: 1 },
];

const HAND_FIELDS: Field[] = [
  { key: 'handCardScale', label: '尺寸 %', min: HAND_SCALE_MIN, max: HAND_SCALE_MAX, step: 1 },
];

const PANEL_W = 360;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function currentFit() {
  const viewW = window.visualViewport?.width ?? window.innerWidth;
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  return computeDesignFit(viewW, viewH);
}

function payload(settings: BoardSettings, save: EditorSave): string {
  return JSON.stringify({
    cols: settings.cols,
    rows: settings.rows,
    tileSize: settings.tileSize,
    tileGap: settings.tileGap,
    trayColor: settings.trayColor,
    boardNudgeX: settings.boardNudgeX,
    boardNudgeY: settings.boardNudgeY,
    heroNudgeX: settings.heroNudgeX,
    heroNudgeY: settings.heroNudgeY,
    foeNudgeX: settings.foeNudgeX,
    foeNudgeY: settings.foeNudgeY,
    handCardScale: settings.handCardScale,
    panelX: save.panelX,
    panelY: save.panelY,
  });
}

export function mountBoardInspector(
  root: HTMLElement,
  settings: BoardSettings,
  save: EditorSave,
): void {
  root.replaceChildren();
  root.classList.add('inspector');
  root.classList.toggle('is-open', !save.hidden);
  placePanel(root, save.panelX, save.panelY);

  let savedSnap = payload(settings, save);
  let saveTimer = 0;
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '保存';

  const persist = () => {
    save.settings = settings;
    save.hidden = !root.classList.contains('is-open');
    saveEditorSave(save);
    savedSnap = payload(settings, save);
  };

  const markDirty = () => {
    saveBtn.classList.toggle('is-dirty', payload(settings, save) !== savedSnap);
  };

  const tickValue = (el: HTMLElement) => {
    el.classList.remove('is-tick');
    void el.offsetWidth;
    el.classList.add('is-tick');
    window.setTimeout(() => el.classList.remove('is-tick'), 140);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Digit1' && e.code !== 'Numpad1') return;
    if (e.repeat) return;
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    root.classList.toggle('is-open');
  });

  const header = document.createElement('header');
  header.className = 'inspector-head';
  header.textContent = '检视器';
  bindDrag(header, root, save, markDirty);
  root.append(header);

  const section = document.createElement('section');
  section.className = 'inspector-section';
  const title = document.createElement('h2');
  title.textContent = '格子';
  section.append(title);

  const addFields = (parent: HTMLElement, fields: Field[]) => {
    for (const field of fields) {
      const row = document.createElement('div');
      row.className = 'inspector-row';
      const label = document.createElement('span');
      label.className = 'inspector-label';
      label.textContent = field.label;

      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(field.min);
      range.max = String(field.max);
      range.step = String(field.step);
      range.value = String(settings[field.key]);

      const num = document.createElement('input');
      num.type = 'number';
      num.min = String(field.min);
      num.max = String(field.max);
      num.step = String(field.step);
      num.value = String(settings[field.key]);

      const apply = (raw: string, fromSlider: boolean) => {
        const next = clamp(Math.round(Number(raw)), field.min, field.max);
        if (!Number.isFinite(next)) return;
        settings[field.key] = next;
        range.value = String(next);
        num.value = String(next);
        if (fromSlider) tickValue(num);
        markDirty();
      };

      range.addEventListener('input', () => apply(range.value, true));
      num.addEventListener('change', () => apply(num.value, false));
      row.append(label, range, num);
      parent.append(row);
    }
  };

  addFields(section, FIELDS);

  const colorRow = document.createElement('div');
  colorRow.className = 'inspector-row';
  const colorLabel = document.createElement('span');
  colorLabel.className = 'inspector-label';
  colorLabel.textContent = '黑底颜色';
  const color = document.createElement('input');
  color.type = 'color';
  color.value = settings.trayColor;
  const hex = document.createElement('input');
  hex.type = 'text';
  hex.className = 'inspector-hex';
  hex.maxLength = 7;
  hex.value = settings.trayColor;
  const applyColor = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(v)) return;
    settings.trayColor = v;
    color.value = v;
    hex.value = v;
    tickValue(hex);
    markDirty();
  };
  color.addEventListener('input', () => applyColor(color.value));
  hex.addEventListener('change', () => applyColor(hex.value));
  colorRow.append(colorLabel, color, hex);
  section.append(colorRow);

  root.append(section);

  const position = document.createElement('section');
  position.className = 'inspector-section';
  const positionTitle = document.createElement('h2');
  positionTitle.textContent = '位置';
  position.append(positionTitle);
  addFields(position, POSITION_FIELDS);
  root.append(position);

  const hand = document.createElement('section');
  hand.className = 'inspector-section';
  const handTitle = document.createElement('h2');
  handTitle.textContent = '手牌';
  hand.append(handTitle);
  addFields(hand, HAND_FIELDS);
  root.append(hand);

  const actions = document.createElement('div');
  actions.className = 'inspector-actions';
  saveBtn.addEventListener('click', () => {
    persist();
    markDirty();
    saveBtn.classList.add('is-saved');
    saveBtn.textContent = '已保存';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveBtn.classList.remove('is-saved');
      saveBtn.textContent = '保存';
    }, 900);
  });
  actions.append(saveBtn);
  root.append(actions);
}

function placePanel(root: HTMLElement, x: number, y: number): void {
  const h = Math.max(root.offsetHeight, 80);
  const nx = clamp(x, 0, DESIGN_WIDTH - PANEL_W);
  const ny = clamp(y, 0, DESIGN_HEIGHT - h);
  root.style.left = `${nx}px`;
  root.style.top = `${ny}px`;
}

function bindDrag(
  handle: HTMLElement,
  root: HTMLElement,
  save: EditorSave,
  onMoved: () => void,
): void {
  let dragging = false;
  let originX = 0;
  let originY = 0;
  let startX = 0;
  let startY = 0;

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    handle.classList.add('is-dragging');
    root.classList.add('is-dragging');
    const p = clientToDesign(e.clientX, e.clientY, currentFit());
    startX = p.x;
    startY = p.y;
    originX = save.panelX;
    originY = save.panelY;
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = clientToDesign(e.clientX, e.clientY, currentFit());
    const x = originX + (p.x - startX);
    const y = originY + (p.y - startY);
    placePanel(root, x, y);
    save.panelX = parseFloat(root.style.left);
    save.panelY = parseFloat(root.style.top);
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    root.classList.remove('is-dragging');
    onMoved();
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}
