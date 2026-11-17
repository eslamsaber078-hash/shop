const CART_KEY = 'ds_cart_v1';
const ORDERS_KEY = 'ds_orders_v1';

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function formatPrice(value) {
  return Number(value).toLocaleString('en-US') + ' ج.م';
}

function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

function discountPercent(product) {
  return Math.round((1 - product.price / product.oldPrice) * 100);
}

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(cart) ? cart.filter((item) => item && getProduct(item.id)) : [];
  } catch (error) {
    return [];
  }
}

function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
  updateCartCount();
  document.dispatchEvent(new CustomEvent('cart:change', { detail: cart }));
}

function cartKey(item) {
  return item.id + '|' + item.color + '|' + item.size;
}

function linePrice(item) {
  const product = getProduct(item.id);
  return item.priceOverride != null ? item.priceOverride : product.price;
}

function cartSubtotal(cart = readCart()) {
  return cart.reduce((total, item) => total + linePrice(item) * item.qty, 0);
}

function cartCount(cart = readCart()) {
  return cart.reduce((total, item) => total + item.qty, 0);
}

function addToCart(item, options = {}) {
  const cart = readCart();
  const key = cartKey(item);
  const existing = cart.find((line) => cartKey(line) === key);
  if (existing) {
    existing.qty = Math.min(10, existing.qty + item.qty);
  } else {
    cart.push(item);
  }
  writeCart(cart);
  if (!options.silent) openPanel('cartDrawer');
}

function setCartQuantity(key, qty) {
  const cart = readCart();
  const line = cart.find((item) => cartKey(item) === key);
  if (!line) return;
  if (qty <= 0) {
    writeCart(cart.filter((item) => cartKey(item) !== key));
    return;
  }
  line.qty = Math.min(10, qty);
  writeCart(cart);
}

function removeCartLine(key) {
  writeCart(readCart().filter((item) => cartKey(item) !== key));
}

function updateCartCount() {
  const count = cartCount();
  qsa('[data-cart-count]').forEach((el) => {
    el.textContent = count;
    el.hidden = count === 0;
  });
}

function governorateFee(name) {
  const gov = GOVERNORATES.find((g) => g.name === name);
  return gov ? gov.fee : null;
}

function shippingFor(governorate, subtotal) {
  if (!governorate) return null;
  if (subtotal >= STORE.freeShipping) return 0;
  return governorateFee(governorate);
}

function renderCart() {
  const cart = readCart();
  const list = qs('#cartItems');
  const foot = qs('#cartFoot');
  if (!list || !foot) return;

  if (!cart.length) {
    list.innerHTML =
      '<div class="cart-empty">' +
      '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 7h12l-1.2 12H7.2L6 7Z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/></svg>' +
      '<p>سلة المشتريات فارغة الآن</p>' +
      '<a href="index.html#products" class="btn btn-outline" data-close>تصفح المنتجات</a>' +
      '</div>';
    foot.hidden = true;
    return;
  }

  foot.hidden = false;
  list.innerHTML = cart
    .map((item) => {
      const product = getProduct(item.id);
      const key = cartKey(item);
      return (
        '<div class="cart-line">' +
        '<a class="cart-line-img" href="product.html?id=' + product.id + '"><img src="' + product.image + '" alt="' + product.name + '" width="72" height="90"></a>' +
        '<div class="cart-line-body">' +
        '<a class="cart-line-name" href="product.html?id=' + product.id + '">' + product.name + '</a>' +
        '<p class="cart-line-meta">اللون: ' + item.color + ' &middot; المقاس: ' + item.size + '</p>' +
        (item.priceOverride != null ? '<p class="cart-line-tag">سعر الباقة</p>' : '') +
        '<div class="cart-line-bottom">' +
        '<div class="qty qty-sm">' +
        '<button type="button" data-cart-dec="' + key + '" aria-label="تقليل الكمية">&minus;</button>' +
        '<span>' + item.qty + '</span>' +
        '<button type="button" data-cart-inc="' + key + '" aria-label="زيادة الكمية">+</button>' +
        '</div>' +
        '<strong class="cart-line-price">' + formatPrice(linePrice(item) * item.qty) + '</strong>' +
        '</div>' +
        '</div>' +
        '<button type="button" class="cart-line-remove" data-cart-remove="' + key + '" aria-label="حذف من السلة">&times;</button>' +
        '</div>'
      );
    })
    .join('');

  const subtotal = cartSubtotal(cart);
  const totalEl = qs('#cartSubtotal');
  if (totalEl) totalEl.textContent = formatPrice(subtotal);

  const note = qs('#cartNote');
  if (note) {
    note.textContent =
      subtotal >= STORE.freeShipping
        ? 'شحن مجاني على هذا الطلب.'
        : 'تبقّى ' + formatPrice(STORE.freeShipping - subtotal) + ' للحصول على شحن مجاني.';
  }
}

let panelReturnFocus = null;

function openPanel(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  closePanels();
  panelReturnFocus = document.activeElement;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  const overlay = qs('#overlay');
  if (overlay) {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
  }
  document.body.classList.add('no-scroll');
  const focusTarget = panel.querySelector('[data-autofocus]');
  if (focusTarget) setTimeout(() => focusTarget.focus(), 80);
}

function closePanels() {
  qsa('.panel.is-open, .modal.is-open').forEach((panel) => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  });
  const overlay = qs('#overlay');
  if (overlay) {
    overlay.classList.remove('is-visible');
    setTimeout(() => {
      if (!overlay.classList.contains('is-visible')) overlay.hidden = true;
    }, 200);
  }
  document.body.classList.remove('no-scroll');
  if (panelReturnFocus && typeof panelReturnFocus.focus === 'function') {
    panelReturnFocus.focus();
    panelReturnFocus = null;
  }
}

function renderSearch(query) {
  const results = qs('#searchResults');
  if (!results) return;
  const term = query.trim().toLowerCase();
  const matches = PRODUCTS.filter((product) => {
    if (!term) return true;
    return (
      product.name.toLowerCase().includes(term) ||
      product.categoryName.toLowerCase().includes(term) ||
      product.short.toLowerCase().includes(term)
    );
  });

  if (!matches.length) {
    results.innerHTML = '<p class="search-empty">لا يوجد منتج بهذا الاسم. جرّب كلمة أخرى.</p>';
    return;
  }

  results.innerHTML = matches
    .map(
      (product) =>
        '<a class="search-result" href="product.html?id=' + product.id + '">' +
        '<img src="' + product.image + '" alt="' + product.name + '" width="54" height="68">' +
        '<span class="search-result-body"><strong>' + product.name + '</strong>' +
        '<small>' + product.categoryName + ' &middot; ' + formatPrice(product.price) + '</small></span>' +
        '<span class="search-result-arrow">&larr;</span>' +
        '</a>'
    )
    .join('');
}

function normalizePhone(value) {
  return value.replace(/[^\d]/g, '');
}

function collectCustomer(form) {
  return {
    name: form.elements.name.value.trim(),
    phone: normalizePhone(form.elements.phone.value),
    governorate: form.elements.governorate.value,
    address: form.elements.address.value.trim(),
    notes: form.elements.notes ? form.elements.notes.value.trim() : ''
  };
}

function validateCustomer(customer) {
  const errors = {};
  if (customer.name.length < 3) {
    errors.name = 'اكتب اسمك بالكامل (3 أحرف على الأقل).';
  }
  if (!/^01[0125][0-9]{8}$/.test(customer.phone)) {
    errors.phone = 'اكتب رقم هاتف مصري صحيح (11 رقمًا).';
  }
  if (!customer.governorate) {
    errors.governorate = 'اختر المحافظة.';
  }
  if (customer.address.length < 10) {
    errors.address = 'اكتب العنوان بالتفصيل (الشارع والمنطقة).';
  }
  return errors;
}

function showFieldErrors(form, errors) {
  qsa('.field-error', form).forEach((el) => el.remove());
  qsa('input, select, textarea', form).forEach((el) => el.classList.remove('is-invalid'));
  Object.keys(errors).forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    field.classList.add('is-invalid');
    const message = document.createElement('span');
    message.className = 'field-error';
    message.textContent = errors[name];
    field.closest('.field').appendChild(message);
  });
  const first = form.querySelector('.is-invalid');
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first.focus({ preventScroll: true });
  }
}

function makeOrderNumber() {
  const stamp = Date.now().toString().slice(-6);
  return 'DS-' + stamp;
}

function orderMessage(order) {
  const lines = [
    'طلب جديد من ' + STORE.name,
    'رقم الطلب: ' + order.number,
    '',
    'الاسم: ' + order.customer.name,
    'الهاتف: ' + order.customer.phone,
    'المحافظة: ' + order.customer.governorate,
    'العنوان: ' + order.customer.address
  ];
  if (order.customer.notes) lines.push('ملاحظات: ' + order.customer.notes);
  lines.push('', 'المنتجات:');
  order.items.forEach((item) => {
    const variant = [item.color, item.size].filter(Boolean).join(' / ');
    lines.push('• ' + item.name + (variant ? ' (' + variant + ')' : '') + ' × ' + item.qty + ' = ' + formatPrice(item.price * item.qty));
  });
  lines.push(
    '',
    'الشحن: ' + (order.shipping === 0 ? 'مجاني' : formatPrice(order.shipping)),
    'الإجمالي: ' + formatPrice(order.total)
  );
  return lines.join('\n');
}

function whatsappOrderLink(order) {
  return 'https://wa.me/' + STORE.whatsapp + '?text=' + encodeURIComponent(orderMessage(order));
}

function saveOrder(order) {
  try {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    orders.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 100)));
  } catch (error) {
    localStorage.setItem(ORDERS_KEY, JSON.stringify([order]));
  }
  try {
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
      keepalive: true
    }).catch(() => {});
  } catch (error) {
    // الموقع ممكن يشتغل كملفات ستاتيك من غير سيرفر
  }
}

function renderOrderItems(order, target) {
  if (!target) return;
  target.innerHTML = order.items
    .map((item) => {
      const variant = [item.color, item.size].filter(Boolean).join(' / ');
      return (
        '<div class="summary-item">' +
        '<span>' + item.name + (variant ? '<small>' + variant + '</small>' : '') + '</span>' +
        '<span>' + item.qty + ' × ' + formatPrice(item.price) + '</span>' +
        '</div>'
      );
    })
    .join('');
}

function applyStoreLinks() {
  qsa('[data-whatsapp]').forEach((link) => {
    link.href = 'https://wa.me/' + STORE.whatsapp;
  });
  qsa('[data-phone]').forEach((link) => {
    link.href = 'tel:' + STORE.phone;
    if (!link.textContent.trim()) link.textContent = STORE.phone;
  });
  qsa('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
  qsa('.logo-text').forEach((el) => {
    const tagline = document.createElement('small');
    tagline.textContent = STORE.tagline || '';
    el.replaceChildren(document.createTextNode(STORE.name), tagline);
  });
  const announcement =
    STORE.announcement ||
    'شحن مجاني للطلبات التي تتجاوز ' + STORE.freeShipping + ' جنيه — الدفع عند الاستلام';
  qsa('.announce').forEach((el) => {
    el.textContent = announcement;
  });
  if (document.title.includes('D STORE')) {
    document.title = document.title.replace(/D STORE/g, STORE.name);
  }
}

function productCardMarkup(product) {
  const badge = !product.badge
    ? ''
    : product.badge === 'الأكثر طلبًا'
      ? '<span class="badge badge-dark">الأكثر طلبًا</span>'
      : '<span class="badge">' + product.badge + '</span>';
  const sizesText = 'المقاسات من ' + product.sizes[0].label + ' إلى ' + product.sizes[product.sizes.length - 1].label;
  return (
    '<article class="product-card" data-category="' + product.category + '">' +
    '<a class="card-media" href="product.html?id=' + product.id + '">' +
    '<img src="' + product.image + '" alt="' + product.name + '" width="900" height="1125" loading="lazy">' +
    badge +
    '</a>' +
    '<div class="card-body">' +
    '<span class="card-cat">' + product.categoryName + '</span>' +
    '<h3 class="card-title"><a href="product.html?id=' + product.id + '">' + product.name + '</a></h3>' +
    '<div class="price-row">' +
    '<span class="price">' + formatPrice(product.price) + '</span>' +
    '<span class="price-old">' + formatPrice(product.oldPrice) + '</span>' +
    '<span class="discount">وفّر ' + discountPercent(product) + '%</span>' +
    '</div>' +
    '<p class="card-meta">' + product.colors.length + ' ألوان &middot; ' + sizesText + '</p>' +
    '</div>' +
    '</article>'
  );
}

document.addEventListener('DOMContentLoaded', () => {
  applyStoreLinks();
  updateCartCount();
  renderCart();

  qsa('[data-open-menu]').forEach((btn) => btn.addEventListener('click', () => openPanel('mobileMenu')));
  qsa('[data-open-cart]').forEach((btn) => btn.addEventListener('click', () => openPanel('cartDrawer')));
  qsa('[data-open-search]').forEach((btn) =>
    btn.addEventListener('click', () => {
      openPanel('searchModal');
      renderSearch('');
      const input = qs('#searchInput');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 120);
      }
    })
  );
  qsa('[data-close]').forEach((btn) => btn.addEventListener('click', closePanels));

  const searchInput = qs('#searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderSearch(searchInput.value));
  }

  const cartItems = qs('#cartItems');
  if (cartItems) {
    cartItems.addEventListener('click', (event) => {
      const inc = event.target.closest('[data-cart-inc]');
      const dec = event.target.closest('[data-cart-dec]');
      const remove = event.target.closest('[data-cart-remove]');
      if (inc) {
        const key = inc.getAttribute('data-cart-inc');
        const line = readCart().find((item) => cartKey(item) === key);
        if (line) setCartQuantity(key, line.qty + 1);
      }
      if (dec) {
        const key = dec.getAttribute('data-cart-dec');
        const line = readCart().find((item) => cartKey(item) === key);
        if (line) setCartQuantity(key, line.qty - 1);
      }
      if (remove) removeCartLine(remove.getAttribute('data-cart-remove'));
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanels();
  });
});
