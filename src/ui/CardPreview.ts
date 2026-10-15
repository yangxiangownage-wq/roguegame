import { artUrl, persistLabel, type CatalogCard } from '@/config/catalog';

export function mountCardPreview(root: HTMLElement): (card: CatalogCard) => void {
  root.classList.add('card-editor-preview');
  root.innerHTML = `
    <article class="hand-card">
      <span class="hand-card__art"><img alt=""></span>
      <span class="hand-card__frame"></span>
      <span class="hand-card__cost"></span>
      <span class="hand-card__title"></span>
      <span class="hand-card__kind"></span>
      <span class="hand-card__stats"></span>
      <span class="hand-card__description"></span>
    </article>
  `;
  const cardEl = root.querySelector('.hand-card')!;
  const img = root.querySelector<HTMLImageElement>('.hand-card__art img')!;
  const cost = root.querySelector('.hand-card__cost')!;
  const title = root.querySelector('.hand-card__title')!;
  const kind = root.querySelector('.hand-card__kind')!;
  const stats = root.querySelector('.hand-card__stats')!;
  const description = root.querySelector('.hand-card__description')!;

  return (card: CatalogCard) => {
    cardEl.classList.toggle('hand-card--consume', card.persist === 'consume');
    img.src = artUrl(card.art);
    cost.textContent = String(card.cost);
    title.textContent = card.title || '未命名';
    kind.textContent = persistLabel(card.persist);
    stats.textContent = `攻 ${card.attack}  ·  甲 ${card.armor}`;
    description.textContent = card.description;
  };
}
