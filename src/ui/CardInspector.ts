import {
  ART_PRESETS,
  COST_MAX,
  COST_MIN,
  DESC_MAX,
  PERSIST_OPTIONS,
  STAT_MAX,
  STAT_MIN,
  TITLE_MAX,
  createCatalogCard,
  persistLabel,
  readArtFile,
  saveCatalog,
  selectedCard,
  type CatalogCard,
  type CatalogSave,
  type PersistKind,
} from '@/config/catalog';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  clientToDesign,
  computeDesignFit,
} from '@/config/design';

const PANEL_W = 400;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function currentFit() {
  const viewW = window.visualViewport?.width ?? window.innerWidth;
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  return computeDesignFit(viewW, viewH);
}

export function mountCardInspector(
  root: HTMLElement,
  save: CatalogSave,
  onChange: () => void,
): void {
  root.replaceChildren();
  root.classList.add('inspector', 'card-inspector', 'is-open');
  placePanel(root, save.panelX, save.panelY);

  const header = document.createElement('header');
  header.className = 'inspector-head';
  header.textContent = '卡牌编辑器';
  bindDrag(header, root, save);
  root.append(header);

  const body = document.createElement('div');
  body.className = 'inspector-body';
  root.append(body);

  const listSection = document.createElement('section');
  listSection.className = 'inspector-section';
  const listTitle = document.createElement('h2');
  listTitle.textContent = '卡组';
  listSection.append(listTitle);
  const list = document.createElement('div');
  list.className = 'card-list';
  listSection.append(list);
  const listBtns = document.createElement('div');
  listBtns.className = 'inspector-split';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '新建';
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = '删除';
  listBtns.append(addBtn, delBtn);
  listSection.append(listBtns);
  body.append(listSection);

  const fields = document.createElement('section');
  fields.className = 'inspector-section';
  const fieldsTitle = document.createElement('h2');
  fieldsTitle.textContent = '当前卡';
  fields.append(fieldsTitle);

  const titleInput = textRow(fields, '名称', TITLE_MAX);
  const costRange = rangeRow(fields, '费用', COST_MIN, COST_MAX);

  const persistRow = document.createElement('div');
  persistRow.className = 'inspector-row-stack';
  const persistLabelEl = document.createElement('span');
  persistLabelEl.className = 'inspector-label';
  persistLabelEl.textContent = '持续';
  const persistToggle = document.createElement('div');
  persistToggle.className = 'persist-toggle';
  const persistBtns = PERSIST_OPTIONS.map((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.dataset.value = opt.value;
    persistToggle.append(btn);
    return btn;
  });
  persistRow.append(persistLabelEl, persistToggle);
  fields.append(persistRow);
  const persistHint = document.createElement('p');
  persistHint.className = 'inspector-hint';
  fields.append(persistHint);

  const attackRange = rangeRow(fields, '攻击', STAT_MIN, STAT_MAX);
  const armorRange = rangeRow(fields, '护甲', STAT_MIN, STAT_MAX);

  const descRow = document.createElement('div');
  descRow.className = 'inspector-row-stack';
  const descLabel = document.createElement('span');
  descLabel.className = 'inspector-label';
  descLabel.textContent = '描述';
  const descInput = document.createElement('textarea');
  descInput.className = 'inspector-textarea';
  descInput.maxLength = DESC_MAX;
  descInput.rows = 3;
  descRow.append(descLabel, descInput);
  fields.append(descRow);

  const artRow = document.createElement('div');
  artRow.className = 'inspector-row-stack';
  const artLabel = document.createElement('span');
  artLabel.className = 'inspector-label';
  artLabel.textContent = '立绘';
  const artFileWrap = document.createElement('div');
  const artFile = document.createElement('input');
  artFile.type = 'file';
  artFile.accept = 'image/*';
  artFile.hidden = true;
  const artBtn = document.createElement('button');
  artBtn.type = 'button';
  artBtn.className = 'art-file-btn';
  artBtn.textContent = '上传图片';
  artBtn.addEventListener('click', () => artFile.click());
  artFileWrap.append(artBtn, artFile);
  artRow.append(artLabel, artFileWrap);
  fields.append(artRow);
  const presets = document.createElement('div');
  presets.className = 'art-presets';
  const presetBtns = ART_PRESETS.map((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = preset.label;
    const thumb = document.createElement('img');
    thumb.src = preset.src;
    thumb.alt = preset.label;
    btn.append(thumb);
    presets.append(btn);
    return { btn, src: preset.src };
  });
  fields.append(presets);
  body.append(fields);

  const actions = document.createElement('div');
  actions.className = 'inspector-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '保存';
  actions.append(saveBtn);
  const io = document.createElement('div');
  io.className = 'inspector-split';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = '导出 JSON';
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = '导入 JSON';
  const importFile = document.createElement('input');
  importFile.type = 'file';
  importFile.accept = 'application/json';
  importFile.hidden = true;
  io.append(exportBtn, importBtn, importFile);
  body.append(actions, io);

  const markDirty = () => {
    saveBtn.classList.add('is-dirty');
    saveBtn.classList.remove('is-saved');
    onChange();
  };

  const current = () => selectedCard(save);

  const fill = () => {
    const card = current();
    titleInput.value = card.title;
    costRange.set(card.cost);
    attackRange.set(card.attack);
    armorRange.set(card.armor);
    descInput.value = card.description;
    for (const btn of persistBtns) {
      btn.classList.toggle('is-active', btn.dataset.value === card.persist);
    }
    persistHint.textContent = PERSIST_OPTIONS.find((o) => o.value === card.persist)?.hint ?? '';
    for (const item of presetBtns) {
      item.btn.classList.toggle('is-active', item.src === card.art);
    }
    renderList();
    onChange();
  };

  const renderList = () => {
    list.replaceChildren();
    for (const card of save.cards) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.toggle('is-active', card.id === save.selectedId);
      btn.innerHTML = `<span class="card-list__cost">${card.cost}</span><span>${card.title || '未命名'}</span><span class="card-list__persist">${persistLabel(card.persist)}</span>`;
      btn.addEventListener('click', () => {
        save.selectedId = card.id;
        fill();
      });
      list.append(btn);
    }
  };

  titleInput.addEventListener('input', () => {
    current().title = titleInput.value.slice(0, TITLE_MAX);
    markDirty();
    renderList();
    onChange();
  });
  costRange.onInput((n) => {
    current().cost = n;
    markDirty();
    renderList();
  });
  attackRange.onInput((n) => {
    current().attack = n;
    markDirty();
  });
  armorRange.onInput((n) => {
    current().armor = n;
    markDirty();
  });
  descInput.addEventListener('input', () => {
    current().description = descInput.value.slice(0, DESC_MAX);
    markDirty();
  });
  for (const btn of persistBtns) {
    btn.addEventListener('click', () => {
      current().persist = (btn.dataset.value as PersistKind) ?? 'permanent';
      markDirty();
      fill();
    });
  }
  for (const item of presetBtns) {
    item.btn.addEventListener('click', () => {
      current().art = item.src;
      markDirty();
      fill();
    });
  }
  artFile.addEventListener('change', async () => {
    const file = artFile.files?.[0];
    artFile.value = '';
    if (!file) return;
    try {
      current().art = await readArtFile(file);
      markDirty();
      fill();
    } catch {
      saveBtn.textContent = '图片读取失败';
    }
  });

  addBtn.addEventListener('click', () => {
    const card = createCatalogCard({
      title: '新卡',
      cost: 1,
      persist: 'permanent',
      attack: 1,
      armor: 0,
      description: '留在棋盘上；每回合结算。',
      art: '/assets/icons/attack.png',
    });
    save.cards.push(card);
    save.selectedId = card.id;
    markDirty();
    fill();
  });
  delBtn.addEventListener('click', () => {
    if (save.cards.length <= 1) return;
    const index = save.cards.findIndex((c) => c.id === save.selectedId);
    save.cards.splice(Math.max(0, index), 1);
    save.selectedId = save.cards[Math.max(0, index - 1)]!.id;
    markDirty();
    fill();
  });

  saveBtn.addEventListener('click', () => {
    saveCatalog(save);
    saveBtn.classList.remove('is-dirty');
    saveBtn.classList.add('is-saved');
    saveBtn.textContent = '已保存';
    window.setTimeout(() => {
      saveBtn.classList.remove('is-saved');
      saveBtn.textContent = '保存';
    }, 900);
  });

  exportBtn.addEventListener('click', () => {
    const blob = new Blob(
      [JSON.stringify({ cards: save.cards }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cards.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { cards?: unknown };
      const cards = Array.isArray(parsed.cards)
        ? parsed.cards.map((raw) => createCatalogCard(raw as Partial<CatalogCard>))
        : [];
      if (!cards.length) return;
      save.cards = cards;
      save.selectedId = cards[0]!.id;
      markDirty();
      fill();
    } catch {
      saveBtn.textContent = '导入失败';
    }
  });

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

  fill();
}

function textRow(parent: HTMLElement, label: string, max: number): HTMLInputElement {
  const row = document.createElement('div');
  row.className = 'inspector-row inspector-row-wide';
  const name = document.createElement('span');
  name.className = 'inspector-label';
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inspector-text';
  input.maxLength = max;
  row.append(name, input);
  parent.append(row);
  return input;
}

function rangeRow(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
): { set: (n: number) => void; onInput: (fn: (n: number) => void) => void } {
  const row = document.createElement('div');
  row.className = 'inspector-row';
  const name = document.createElement('span');
  name.className = 'inspector-label';
  name.textContent = label;
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = '1';
  const num = document.createElement('input');
  num.type = 'number';
  num.min = String(min);
  num.max = String(max);
  num.step = '1';
  row.append(name, range, num);
  parent.append(row);
  let handler: (n: number) => void = () => undefined;
  const apply = (raw: string) => {
    const next = clamp(Math.round(Number(raw)), min, max);
    if (!Number.isFinite(next)) return;
    range.value = String(next);
    num.value = String(next);
    handler(next);
  };
  range.addEventListener('input', () => apply(range.value));
  num.addEventListener('change', () => apply(num.value));
  return {
    set: (n) => {
      range.value = String(n);
      num.value = String(n);
    },
    onInput: (fn) => {
      handler = fn;
    },
  };
}

function placePanel(root: HTMLElement, x: number, y: number): void {
  const h = Math.max(root.offsetHeight, 80);
  const nx = clamp(x, 0, DESIGN_WIDTH - PANEL_W);
  const ny = clamp(y, 0, DESIGN_HEIGHT - h);
  root.style.left = `${nx}px`;
  root.style.top = `${ny}px`;
}

function bindDrag(handle: HTMLElement, root: HTMLElement, save: CatalogSave): void {
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
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}
