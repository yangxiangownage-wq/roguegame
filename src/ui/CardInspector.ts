import {
  COST_MAX,
  COST_MIN,
  TAG_OPTIONS,
  type SkillCardData,
} from '@/config/skillCard';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  clientToDesign,
  computeDesignFit,
} from '@/config/design';

const PANEL_W = 360;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function currentFit() {
  const viewW = window.visualViewport?.width ?? window.innerWidth;
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  return computeDesignFit(viewW, viewH);
}

export function mountCardInspector(root: HTMLElement, data: SkillCardData): void {
  root.replaceChildren();
  root.classList.add('inspector', 'is-open');
  placePanel(root, 1524, 96);

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Digit1' && e.code !== 'Numpad1') return;
    if (e.repeat) return;
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return;
    }
    e.preventDefault();
    root.classList.toggle('is-open');
  });

  const header = document.createElement('header');
  header.className = 'inspector-head';
  header.textContent = '卡牌';
  bindDrag(header, root);
  root.append(header);

  const section = document.createElement('section');
  section.className = 'inspector-section';
  const title = document.createElement('h2');
  title.textContent = '元件';
  section.append(title);

  const costRow = document.createElement('div');
  costRow.className = 'inspector-row';
  const costLabel = document.createElement('span');
  costLabel.className = 'inspector-label';
  costLabel.textContent = '费用';
  const costRange = document.createElement('input');
  costRange.type = 'range';
  costRange.min = String(COST_MIN);
  costRange.max = String(COST_MAX);
  costRange.step = '1';
  costRange.value = String(data.cost);
  const costNum = document.createElement('input');
  costNum.type = 'number';
  costNum.min = String(COST_MIN);
  costNum.max = String(COST_MAX);
  costNum.step = '1';
  costNum.value = String(data.cost);
  const applyCost = (raw: string) => {
    const next = clamp(Math.round(Number(raw)), COST_MIN, COST_MAX);
    if (!Number.isFinite(next)) return;
    data.cost = next;
    costRange.value = String(next);
    costNum.value = String(next);
  };
  costRange.addEventListener('input', () => applyCost(costRange.value));
  costNum.addEventListener('change', () => applyCost(costNum.value));
  costRow.append(costLabel, costRange, costNum);
  section.append(costRow);

  const tagRow = document.createElement('div');
  tagRow.className = 'inspector-row inspector-row-wide';
  const tagLabel = document.createElement('span');
  tagLabel.className = 'inspector-label';
  tagLabel.textContent = '词条';
  const tagSelect = document.createElement('select');
  tagSelect.className = 'inspector-select';
  for (const opt of TAG_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    tagSelect.append(o);
  }
  tagSelect.value = data.tag;
  tagSelect.addEventListener('change', () => {
    data.tag = tagSelect.value;
  });
  tagRow.append(tagLabel, tagSelect);
  section.append(tagRow);

  const nameRow = document.createElement('div');
  nameRow.className = 'inspector-row inspector-row-wide';
  const nameLabel = document.createElement('span');
  nameLabel.className = 'inspector-label';
  nameLabel.textContent = '名称';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'inspector-text';
  nameInput.maxLength = 8;
  nameInput.value = data.title;
  nameInput.addEventListener('input', () => {
    data.title = nameInput.value;
  });
  nameRow.append(nameLabel, nameInput);
  section.append(nameRow);

  root.append(section);
}

function placePanel(root: HTMLElement, x: number, y: number): void {
  const h = Math.max(root.offsetHeight, 80);
  const nx = clamp(x, 0, DESIGN_WIDTH - PANEL_W);
  const ny = clamp(y, 0, DESIGN_HEIGHT - h);
  root.style.left = `${nx}px`;
  root.style.top = `${ny}px`;
}

function bindDrag(handle: HTMLElement, root: HTMLElement): void {
  let dragging = false;
  let originX = 0;
  let originY = 0;
  let startX = 0;
  let startY = 0;
  let panelX = 1524;
  let panelY = 96;

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
    originX = panelX;
    originY = panelY;
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = clientToDesign(e.clientX, e.clientY, currentFit());
    placePanel(root, originX + (p.x - startX), originY + (p.y - startY));
    panelX = parseFloat(root.style.left);
    panelY = parseFloat(root.style.top);
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    root.classList.remove('is-dragging');
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}
