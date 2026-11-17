document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const requested = params.get('id');
  const product = requested ? getProduct(requested) : PRODUCTS[0];

  if (!product) {
    qs('main').innerHTML =
      '<div class="empty-cart-page">' +
      '<h1>المنتج غير موجود</h1>' +
      '<p>قد يكون الرابط قديمًا أو تم حذف المنتج من المتجر.</p>' +
      '<a class="btn" href="index.html#products">شاهد المنتجات الأخرى</a>' +
      '</div>';
    document.title = 'المنتج غير موجود | ' + STORE.name;
    return;
  }

  const state = {
    color: product.colors[0].name,
    size: product.sizes[0].label,
    qty: 1,
    image: 0
  };

  document.title = product.name + ' | ' + STORE.name;
  const metaDescription = qs('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute('content', product.short);
  const ogTitle = qs('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', product.name + ' | D STORE');
  const ogImage = qs('meta[property="og:image"]');
  if (ogImage) ogImage.setAttribute('content', product.image);

  qs('#crumbCategory').textContent = product.categoryName;
  qs('#crumbCategory').href = 'index.html?cat=' + product.category + '#products';
  qs('#crumbName').textContent = product.name;
  qs('#productCat').textContent = product.categoryName;
  qs('#productName').textContent = product.name;

  const ratingStars = qs('#ratingStars');
  ratingStars.style.setProperty('--rating', (product.rating / 5) * 100 + '%');
  qs('#ratingValue').textContent = product.rating.toFixed(1) + ' من 5';
  qs('#reviewsLink').textContent = '(' + product.reviewsCount + ' تقييم)';

  qs('#productPrice').textContent = formatPrice(product.price);
  qs('#productOld').textContent = formatPrice(product.oldPrice);
  qs('#saveChip').textContent = 'وفّر ' + formatPrice(product.oldPrice - product.price);
  qs('#galleryBadge').textContent = 'خصم ' + discountPercent(product) + '%';
  qs('#viewersCount').textContent = product.viewers;
  qs('#stockCount').textContent = product.stock;
  qs('#stockFill').style.width = Math.min(100, (product.stock / 40) * 100) + '%';

  const mainImage = qs('#mainImage');
  const thumbs = qs('#thumbs');

  function showImage(index) {
    const total = product.images.length;
    state.image = (index + total) % total;
    mainImage.src = product.images[state.image];
    mainImage.alt = product.name + ' — صورة ' + (state.image + 1);
    qsa('.thumb', thumbs).forEach((thumb, thumbIndex) => {
      thumb.classList.toggle('is-active', thumbIndex === state.image);
      thumb.setAttribute('aria-pressed', String(thumbIndex === state.image));
    });
  }

  mainImage.src = product.images[0];
  mainImage.alt = product.name + ' — صورة 1';
  thumbs.innerHTML = product.images
    .map(
      (src, index) =>
        '<button class="thumb' + (index === 0 ? ' is-active' : '') + '" type="button" data-thumb="' + index + '" aria-label="صورة ' + (index + 1) + '" aria-pressed="' + (index === 0) + '">' +
        '<img src="' + src + '" alt="' + product.name + ' — صورة ' + (index + 1) + '" width="76" height="94" loading="lazy">' +
        '</button>'
    )
    .join('');
  thumbs.addEventListener('click', (event) => {
    const thumb = event.target.closest('[data-thumb]');
    if (thumb) showImage(Number(thumb.getAttribute('data-thumb')));
  });
  qs('#galleryPrev').addEventListener('click', () => showImage(state.image - 1));
  qs('#galleryNext').addEventListener('click', () => showImage(state.image + 1));

  const colorLabel = qs('#colorLabel');
  const swatches = qs('#swatches');
  const sizes = qs('#sizes');
  const sizeLabel = qs('#sizeLabel');
  const sizeHint = qs('#sizeHint');

  colorLabel.textContent = state.color;
  swatches.innerHTML = product.colors
    .map(
      (color, index) =>
        '<button class="swatch' + (index === 0 ? ' is-active' : '') + '" type="button" data-color="' + color.name + '" style="background:' + color.hex + '" aria-label="اللون ' + color.name + '" aria-pressed="' + (index === 0) + '" title="' + color.name + '"></button>'
    )
    .join('');
  swatches.addEventListener('click', (event) => {
    const button = event.target.closest('[data-color]');
    if (!button) return;
    state.color = button.getAttribute('data-color');
    colorLabel.textContent = state.color;
    qsa('.swatch', swatches).forEach((swatch) => {
      const active = swatch === button;
      swatch.classList.toggle('is-active', active);
      swatch.setAttribute('aria-pressed', String(active));
    });
    updateSummary();
  });

  sizes.innerHTML = product.sizes
    .map(
      (size, index) =>
        '<button class="size-btn' + (index === 0 ? ' is-active' : '') + '" type="button" data-size="' + size.label + '" aria-pressed="' + (index === 0) + '">' + size.label + '</button>'
    )
    .join('');
  sizeLabel.textContent = product.sizes[0].label;
  sizeHint.textContent = product.sizes[0].hint;
  sizes.addEventListener('click', (event) => {
    const button = event.target.closest('[data-size]');
    if (!button) return;
    state.size = button.getAttribute('data-size');
    sizeLabel.textContent = state.size;
    const size = product.sizes.find((entry) => entry.label === state.size);
    sizeHint.textContent = size ? size.hint : '';
    qsa('.size-btn', sizes).forEach((sizeBtn) => {
      const active = sizeBtn === button;
      sizeBtn.classList.toggle('is-active', active);
      sizeBtn.setAttribute('aria-pressed', String(active));
    });
    updateSummary();
  });

  const qtyValue = qs('#qtyValue');
  qs('#qtyMinus').addEventListener('click', () => {
    state.qty = Math.max(1, state.qty - 1);
    qtyValue.textContent = state.qty;
    updateSummary();
  });
  qs('#qtyPlus').addEventListener('click', () => {
    state.qty = Math.min(10, state.qty + 1);
    qtyValue.textContent = state.qty;
    updateSummary();
  });

  qs('#highlights').innerHTML = product.highlights
    .map(
      (item) =>
        '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' + item + '</li>'
    )
    .join('');

  qs('#description').innerHTML = product.description.map((paragraph) => '<p>' + paragraph + '</p>').join('');
  qs('#specsBody').innerHTML = product.specs.map((row) => '<tr><th>' + row[0] + '</th><td>' + row[1] + '</td></tr>').join('');

  if (!product.rating || !product.reviewsCount) qs('.rating-row').hidden = true;
  if (!product.reviews || !product.reviews.length) qs('#reviews').hidden = true;
  qs('#reviewBig').textContent = product.rating.toFixed(1);
  qs('#reviewStars').style.setProperty('--rating', (product.rating / 5) * 100 + '%');
  qs('#reviewCount').textContent = 'من ' + product.reviewsCount + ' تقييم';

  qs('#reviewsGrid').innerHTML = product.reviews
    .map(
      (review) =>
        '<article class="review">' +
        '<div class="review-head"><strong>' + review.name + '</strong><time>' + review.date + '</time></div>' +
        '<div class="review-stars"><span class="stars stars-sm" style="--rating:' + review.rating * 20 + '%"></span></div>' +
        '<p>' + review.text + '</p>' +
        '<span class="verified"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>مشتري موثّق</span>' +
        '</article>'
    )
    .join('');

  qs('#faq').innerHTML = FAQS.map(
    (item) => '<details class="faq-item"><summary>' + item.q + '</summary><p>' + item.a + '</p></details>'
  ).join('');

  const otherProducts = PRODUCTS.filter((entry) => entry.id !== product.id).slice(0, 3);
  qs('#moreProducts').innerHTML = otherProducts.map(productCardMarkup).join('');

  const govSelect = qs('#orderGov');
  govSelect.innerHTML += GOVERNORATES.map((gov) => '<option value="' + gov.name + '">' + gov.name + '</option>').join('');

  qs('#sizeTableBody').innerHTML = product.sizes
    .map((size) => '<tr><td><strong>' + size.label + '</strong></td><td>' + size.hint + '</td></tr>')
    .join('');
  qsa('[data-open-size]').forEach((btn) => btn.addEventListener('click', () => openPanel('sizeModal')));

  function updateSummary() {
    const subtotal = product.price * state.qty;
    const governorate = govSelect.value;
    const shipping = shippingFor(governorate, subtotal);
    qs('#sumItem').textContent = product.name + ' — ' + state.color + ' / ' + state.size;
    qs('#sumQty').textContent = state.qty;
    qs('#sumPrice').textContent = formatPrice(subtotal);
    qs('#sumShipping').textContent = governorate
      ? shipping === 0
        ? 'مجاني'
        : formatPrice(shipping)
      : 'اختر المحافظة';
    qs('#sumTotal').textContent = formatPrice(subtotal + (shipping || 0));
    qs('#sumFreeNote').hidden = subtotal < STORE.freeShipping;
  }

  updateSummary();
  govSelect.addEventListener('change', updateSummary);

  const stickyBuy = qs('#stickyBuy');
  qs('#stickyPrice').textContent = formatPrice(product.price);
  qs('#stickyOld').textContent = formatPrice(product.oldPrice);

  let stickyObserver = null;
  let orderPlaced = false;
  if ('IntersectionObserver' in window) {
    stickyObserver = new IntersectionObserver(
      (entries) => {
        if (!orderPlaced) stickyBuy.hidden = entries[0].isIntersecting;
      },
      { threshold: 0.1 }
    );
    stickyObserver.observe(qs('#orderBox'));
  }

  qs('#buyNow').addEventListener('click', () => {
    qs('#order').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  qs('#stickyOrder').addEventListener('click', () => {
    qs('#order').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  qs('#addToCart').addEventListener('click', () => {
    addToCart({ id: product.id, color: state.color, size: state.size, qty: state.qty });
  });

  if (product.bundle) {
    const other = getProduct(product.bundle.productId);
    if (other) {
      qs('#bundleSection').hidden = false;
      qs('#bundleBox').innerHTML =
        '<div class="bundle-imgs">' +
        '<img src="' + product.image + '" alt="' + product.name + '" width="66" height="84">' +
        '<span class="bundle-plus">+</span>' +
        '<img src="' + other.image + '" alt="' + other.name + '" width="66" height="84">' +
        '</div>' +
        '<div class="bundle-body">' +
        '<h3>' + product.name + ' + ' + other.name + '</h3>' +
        '<p>' + other.short + '</p>' +
        '<div class="bundle-price"><strong>' + formatPrice(product.price + product.bundle.price) + '</strong>' +
        '<span>' + formatPrice(product.price + other.price) + '</span></div>' +
        '</div>' +
        '<button class="btn btn-outline" type="button" id="bundleAdd">أضف المنتجين إلى السلة</button>';
      qs('#bundleAdd').addEventListener('click', () => {
        addToCart({ id: product.id, color: state.color, size: state.size, qty: 1 }, { silent: true });
        addToCart({
          id: other.id,
          color: other.colors[0].name,
          size: other.sizes[0].label,
          qty: 1,
          priceOverride: product.bundle.price
        }, { silent: true });
        openPanel('cartDrawer');
      });
    }
  }

  const form = qs('#orderForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const customer = collectCustomer(form);
    const errors = validateCustomer(customer);
    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }
    showFieldErrors(form, {});

    const subtotal = product.price * state.qty;
    const shipping = shippingFor(customer.governorate, subtotal);
    const order = {
      number: makeOrderNumber(),
      date: new Date().toISOString(),
      customer: customer,
      items: [{
        id: product.id,
        name: product.name,
        color: state.color,
        size: state.size,
        qty: state.qty,
        price: product.price
      }],
      subtotal: subtotal,
      shipping: shipping,
      total: subtotal + shipping
    };
    saveOrder(order);

    qs('#successNumber').textContent = order.number;
    renderOrderItems(order, qs('#successItems'));
    qs('#successShipping').textContent = order.shipping === 0 ? 'مجاني' : formatPrice(order.shipping);
    qs('#successTotal').textContent = formatPrice(order.total);
    qs('#successWhatsapp').href = whatsappOrderLink(order);

    qs('#orderBox').hidden = true;
    const success = qs('#orderSuccess');
    success.hidden = false;
    orderPlaced = true;
    stickyBuy.hidden = true;
    if (stickyObserver) stickyObserver.disconnect();
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  setInterval(() => {
    const change = Math.floor(Math.random() * 5) - 2;
    product.viewers = Math.min(45, Math.max(8, product.viewers + change));
    qs('#viewersCount').textContent = product.viewers;
  }, 28000);
});
