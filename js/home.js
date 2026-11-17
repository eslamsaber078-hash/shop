document.addEventListener('DOMContentLoaded', () => {
  const grid = qs('#productsGrid');
  if (!grid) return;

  grid.innerHTML = PRODUCTS.map(productCardMarkup).join('');

  const validCategories = CATEGORIES.map((cat) => cat.id);
  const params = new URLSearchParams(location.search);
  const initial = validCategories.includes(params.get('cat')) ? params.get('cat') : 'all';

  function applyFilter(category) {
    let shown = 0;
    qsa('.product-card', grid).forEach((card) => {
      const match = category === 'all' || card.dataset.category === category;
      card.hidden = !match;
      if (match) shown += 1;
    });
    qsa('.filter-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === category);
    });
    const countEl = qs('#productsCount');
    if (countEl) {
      countEl.textContent = shown === 1 ? 'منتج واحد' : shown + ' منتجات';
    }
  }

  applyFilter(initial);

  qsa('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.filter;
      applyFilter(category);
      const url = category === 'all' ? 'index.html#products' : 'index.html?cat=' + category + '#products';
      history.replaceState(null, '', url);
      qs('#products').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  if (initial !== 'all' && location.hash !== '#products') {
    setTimeout(() => qs('#products').scrollIntoView({ block: 'start' }), 60);
  }
});
