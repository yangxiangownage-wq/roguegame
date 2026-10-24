import {
  DEFAULT_HIT_FEEL,
  saveHitFeelSave,
  type HitFeel,
  type HitFeelSave,
} from '@/config/hitFeel';
import type { FighterCards } from '@/render/fighterCards';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  clientToDesign,
  computeDesignFit,
} from '@/config/design';

type FieldKey = 'force' | 'forcePerDamage' | 'duration' | 'frequency' | 'previewDamage';

const FIELDS: { key: FieldKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'force', label: '力度', min: 2, max: 36, step: 0.5 },
  { key: 'forcePerDamage', label: '每伤加成', min: 0, max: 4, step: 0.1 },
  { key: 'duration', label: '时间 秒', min: 0.12, max: 1.4, step: 0.01 },
  { key: 'frequency', label: '频率 Hz', min: 2, max: 14, step: 0.1 },
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

export function mountFeelInspector(
  root: HTMLElement,
  feel: HitFeel,
  save: HitFeelSave,
  fighters: FighterCards,
): void {
  root.replaceChildren();
  root.classList.add('inspector');
  placePanel(root, save.panelX, save.panelY);

  let previewDamage = 4;
  let savedSnap = JSON.stringify({ ...feel, panelX: save.panelX, panelY: save.panelY });
  let saveTimer = 0;
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '保存';

  const persist = () => {
    Object.assign(save, feel, {
      panelX: parseFloat(root.style.left) || save.panelX,
      panelY: parseFloat(root.style.top) || save.panelY,
    });
    saveHitFeelSave(save);
    savedSnap = JSON.stringify(save);
  };

  const snapshot = () => JSON.stringify({ ...feel, panelX: save.panelX, panelY: save.panelY });
  const markDirty = () => {
    saveBtn.classList.toggle('is-dirty', snapshot() !== savedSnap);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Digit3' && e.code !== 'Numpad3') return;
    if (e.repeat) return;
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    root.classList.toggle('is-open');
  });

  const header = document.createElement('header');
  header.className = 'inspector-head';
  header.textContent = '撞击手感 · 3';
  bindDrag(header, root, save, markDirty);
  root.append(header);

  const hint = document.createElement('p');
  hint.className = 'inspector-hint';
  hint.textContent = '拖滑条立刻生效。试震动只晃镜头，试打击走完整对撞。';
  root.append(hint);

  const refreshers: Array<() => void> = [];
  const addField = (field: { key: FieldKey; label: string; min: number; max: number; step: number }, read: () => number, write: (n: number) => void) => {
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
    const number = document.createElement('input');
    number.type = 'number';
    number.min = String(field.min);
    number.max = String(field.max);
    number.step = String(field.step);
    const sync = (n: number) => {
      const value = clamp(n, field.min, field.max);
      write(value);
      range.value = String(value);
      number.value = String(value);
      markDirty();
    };
    refreshers.push(() => {
      const value = read();
      range.value = String(value);
      number.value = String(value);
    });
    sync(read());
    range.addEventListener('input', () => sync(Number(range.value)));
    number.addEventListener('change', () => sync(Number(number.value)));
    row.append(label, range, number);
    root.append(row);
  };

  for (const field of FIELDS) {
    addField(field, () => feel[field.key], (n) => {
      feel[field.key] = n;
    });
  }
  addField(
    { key: 'previewDamage', label: '试打伤害', min: 1, max: 10, step: 1 },
    () => previewDamage,
    (n) => { previewDamage = Math.round(n); },
  );

  const actions = document.createElement('div');
  actions.className = 'inspector-actions';
  const shakeBtn = document.createElement('button');
  shakeBtn.type = 'button';
  shakeBtn.textContent = '试震动';
  shakeBtn.addEventListener('click', () => fighters.previewShake(previewDamage));
  const strikeBtn = document.createElement('button');
  strikeBtn.type = 'button';
  strikeBtn.textContent = '试打击';
  strikeBtn.addEventListener('click', () => fighters.previewStrike(previewDamage));
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = '恢复默认';
  resetBtn.addEventListener('click', () => {
    Object.assign(feel, DEFAULT_HIT_FEEL);
    previewDamage = 4;
    for (const refresh of refreshers) refresh();
    markDirty();
  });
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
  actions.append(shakeBtn, strikeBtn, resetBtn, saveBtn);
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
  save: HitFeelSave,
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
    placePanel(root, originX + (p.x - startX), originY + (p.y - startY));
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
