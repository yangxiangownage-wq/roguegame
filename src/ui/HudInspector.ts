import {
  HUD_SCALE_MAX,
  HUD_SCALE_MIN,
  NUDGE_X_MAX,
  NUDGE_X_MIN,
  NUDGE_Y_MAX,
  NUDGE_Y_MIN,
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
  | 'energyNudgeX'
  | 'energyNudgeY'
  | 'energyScale'
  | 'drawNudgeX'
  | 'drawNudgeY'
  | 'drawScale'
  | 'discardNudgeX'
  | 'discardNudgeY'
  | 'discardScale'
  | 'endNudgeX'
  | 'endNudgeY'
  | 'endScale';

type Field = {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

const ENERGY_FIELDS: Field[] = [
  { key: 'energyNudgeX', label: 'X', min: NUDGE_X_MIN, max: NUDGE_X_MAX, step: 1 },
  { key: 'energyNudgeY', label: 'Y', min: NUDGE_Y_MIN, max: NUDGE_Y_MAX, step: 1 },
  { key: 'energyScale', label: '尺寸 %', min: HUD_SCALE_MIN, max: HUD_SCALE_MAX, step: 1 },
];

const DRAW_FIELDS: Field[] = [
  { key: 'drawNudgeX', label: 'X', min: NUDGE_X_MIN, max: NUDGE_X_MAX, step: 1 },
  { key: 'drawNudgeY', label: 'Y', min: NUDGE_Y_MIN, max: NUDGE_Y_MAX, step: 1 },
  { key: 'drawScale', label: '尺寸 %', min: HUD_SCALE_MIN, max: HUD_SCALE_MAX, step: 1 },
];

const DISCARD_FIELDS: Field[] = [
  { key: 'discardNudgeX', label: 'X', min: NUDGE_X_MIN, max: NUDGE_X_MAX, step: 1 },
  { key: 'discardNudgeY', label: 'Y', min: NUDGE_Y_MIN, max: NUDGE_Y_MAX, step: 1 },
  { key: 'discardScale', label: '尺寸 %', min: HUD_SCALE_MIN, max: HUD_SCALE_MAX, step: 1 },
];

const END_FIELDS: Field[] = [
  { key: 'endNudgeX', label: 'X', min: NUDGE_X_MIN, max: NUDGE_X_MAX, step: 1 },
  { key: 'endNudgeY', label: 'Y', min: NUDGE_Y_MIN, max: NUDGE_Y_MAX, step: 1 },
  { key: 'endScale', label: '尺寸 %', min: HUD_SCALE_MIN, max: HUD_SCALE_MAX, step: 1 },
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
    energyNudgeX: settings.energyNudgeX,
    energyNudgeY: settings.energyNudgeY,
    energyScale: settings.energyScale,
    drawNudgeX: settings.drawNudgeX,
    drawNudgeY: settings.drawNudgeY,
    drawScale: settings.drawScale,
    discardNudgeX: settings.discardNudgeX,
    discardNudgeY: settings.discardNudgeY,
    discardScale: settings.discardScale,
    endNudgeX: settings.endNudgeX,
    endNudgeY: settings.endNudgeY,
    endScale: settings.endScale,
    hudPanelX: save.hudPanelX,
    hudPanelY: save.hudPanelY,
  });
}

export function mountHudInspector(
  root: HTMLElement,
  settings: BoardSettings,
  save: EditorSave,
): void {
  root.replaceChildren();
  root.classList.add('inspector');
  root.classList.toggle('is-open', !save.hudHidden);
  placePanel(root, save.hudPanelX, save.hudPanelY);

  let savedSnap = payload(settings, save);
  let saveTimer = 0;
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '保存';

  const persist = () => {
    save.settings = settings;
    save.hudHidden = !root.classList.contains('is-open');
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
    if (e.code !== 'Digit2' && e.code !== 'Numpad2') return;
    if (e.repeat) return;
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    root.classList.toggle('is-open');
  });

  const header = document.createElement('header');
  header.className = 'inspector-head';
  header.textContent = '战斗 UI';
  bindDrag(header, root, save, markDirty);
  root.append(header);

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

  const addSection = (titleText: string, fields: Field[]) => {
    const section = document.createElement('section');
    section.className = 'inspector-section';
    const title = document.createElement('h2');
    title.textContent = titleText;
    section.append(title);
    addFields(section, fields);
    root.append(section);
  };

  addSection('能量', ENERGY_FIELDS);
  addSection('抽牌堆', DRAW_FIELDS);
  addSection('弃牌堆', DISCARD_FIELDS);
  addSection('结束回合', END_FIELDS);

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
    originX = save.hudPanelX;
    originY = save.hudPanelY;
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = clientToDesign(e.clientX, e.clientY, currentFit());
    const x = originX + (p.x - startX);
    const y = originY + (p.y - startY);
    placePanel(root, x, y);
    save.hudPanelX = parseFloat(root.style.left);
    save.hudPanelY = parseFloat(root.style.top);
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
