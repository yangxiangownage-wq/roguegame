import {
  CARD_PREVIEW_SCALE,
  TEXT_NUDGE_MAX,
  TEXT_NUDGE_MIN,
  TEXT_SLOTS,
  artKey,
  artUrl,
  cardKindLabel,
  cardStatsText,
  isTextSlot,
  type CardTextLayout,
  type CatalogCard,
  type TextSlot,
} from '@/config/catalog';
import { clientToDesign, computeDesignFit } from '@/config/design';

const SLOT_CLASS: Record<TextSlot, string> = {
  cost: 'hand-card__cost',
  title: 'hand-card__title',
  kind: 'hand-card__kind',
  stats: 'hand-card__stats',
  description: 'hand-card__description',
};

function clampNudge(n: number): number {
  return Math.min(TEXT_NUDGE_MAX, Math.max(TEXT_NUDGE_MIN, Math.round(n)));
}

export type CardPreviewApi = {
  paint: (card: CatalogCard, layout: CardTextLayout, slot: TextSlot) => void;
};

export function mountCardPreview(
  root: HTMLElement,
  handlers: {
    onPick: (slot: TextSlot) => void;
    onNudge: (slot: TextSlot, x: number, y: number) => void;
  },
): CardPreviewApi {
  root.classList.add('card-editor-preview');
  root.innerHTML = `
    <article class="hand-card">
      <span class="hand-card__art"><img alt=""></span>
      <span class="hand-card__frame"></span>
      <span class="hand-card__cost" data-slot="cost"></span>
      <span class="hand-card__title" data-slot="title"></span>
      <span class="hand-card__kind" data-slot="kind"></span>
      <span class="hand-card__stats" data-slot="stats"></span>
      <span class="hand-card__description" data-slot="description"></span>
    </article>
  `;
  const cardEl = root.querySelector('.hand-card')!;
  const img = root.querySelector<HTMLImageElement>('.hand-card__art img')!;
  const nodes = Object.fromEntries(
    TEXT_SLOTS.map((slot) => [slot, root.querySelector(`.${SLOT_CLASS[slot]}`)!]),
  ) as Record<TextSlot, HTMLElement>;

  let layout: CardTextLayout | null = null;
  let drag: { slot: TextSlot; originX: number; originY: number; startX: number; startY: number } | null =
    null;

  const applyLayout = (next: CardTextLayout, selected: TextSlot) => {
    layout = next;
    for (const slot of TEXT_SLOTS) {
      const node = nodes[slot];
      node.style.setProperty('--nudge-x', `${next[slot].x}px`);
      node.style.setProperty('--nudge-y', `${next[slot].y}px`);
      node.classList.toggle('is-layout-target', slot === selected);
    }
  };

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !layout) return;
    const slot = (event.target as HTMLElement | null)?.closest?.('[data-slot]')?.getAttribute('data-slot');
    if (!isTextSlot(slot)) return;
    event.preventDefault();
    event.stopPropagation();
    const key = slot;
    const fit = computeDesignFit(
      window.visualViewport?.width ?? window.innerWidth,
      window.visualViewport?.height ?? window.innerHeight,
    );
    const p = clientToDesign(event.clientX, event.clientY, fit);
    drag = {
      slot: key,
      originX: layout[key].x,
      originY: layout[key].y,
      startX: p.x,
      startY: p.y,
    };
    root.setPointerCapture(event.pointerId);
    handlers.onPick(key);
  });

  root.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const fit = computeDesignFit(
      window.visualViewport?.width ?? window.innerWidth,
      window.visualViewport?.height ?? window.innerHeight,
    );
    const p = clientToDesign(event.clientX, event.clientY, fit);
    handlers.onNudge(
      drag.slot,
      clampNudge(drag.originX + (p.x - drag.startX) / CARD_PREVIEW_SCALE),
      clampNudge(drag.originY + (p.y - drag.startY) / CARD_PREVIEW_SCALE),
    );
  });

  const endDrag = () => {
    drag = null;
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  return {
    paint: (card, nextLayout, selected) => {
      cardEl.classList.toggle('hand-card--consume', card.persist === 'consume');
      cardEl.classList.toggle('hand-card--demon', card.school === 'demon');
      const key = artKey(card.art);
      cardEl.classList.toggle('hand-card--imp', key.includes('/imp.') || key.includes('/druid.'));
      img.src = artUrl(card.art);
      nodes.cost.textContent = String(card.cost);
      nodes.title.textContent = card.title || '未命名';
      nodes.kind.textContent = cardKindLabel(card);
      nodes.stats.textContent = cardStatsText(card);
      nodes.description.textContent = card.description;
      applyLayout(nextLayout, selected);
    },
  };
}
