const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  catalog: null,
  orders: [],
  tab: 'overview',
  editingId: null,
  editor: null,
  saving: false,
  uploading: false
};

const STATUS = {
  new: { label: 'جديد', className: 'status-new' },
  confirmed: { label: 'تم التأكيد', className: 'status-confirmed' },
  shipped: { label: 'تم الشحن', className: 'status-shipped' },
  delivered: { label: 'تم التسليم', className: 'status-delivered' },
  cancelled: { label: 'ملغي', className: 'status-cancelled' }
};

const TAB_INFO = {
  overview: ['نظرة عامة', 'ملخص المتجر والطلبات'],
  products: ['المنتجات', 'إضافة وتعديل وحذف منتجات المتجر'],
  orders: ['الطلبات', 'متابعة الطلبات وتحديث حالتها'],
  settings: ['إعدادات المتجر', 'البيانات الأساسية والشحن وكلمة السر'],
  backup: ['نسخة احتياطية', 'حفظ واستعادة بيانات المتجر']
};

const esc = (value) =>
  String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);

const money = (value) => Number(value || 0).toLocaleString('en-US') + ' ج.م';

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const storeName = () => (state.catalog && state.catalog.store ? state.catalog.store.name : 'D STORE');

let toastTimer = null;
function toast(message, type = 'ok') {
  const element = $('#toast');
  element.textContent = message;
  element.className = 'toast' + (type === 'error' ? ' is-error' : '');
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options
  });
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }
  if (response.status === 401) {
    showLogin();
    throw new Error('unauth');
  }
  if (!response.ok) throw new Error(data.error || 'حدثت مشكلة، حاول مرة أخرى');
  return data;
}

function showLogin() {
  $('#adminApp').hidden = true;
  $('#loginView').hidden = false;
  $('#loadingView').hidden = true;
  setTimeout(() => $('#loginPassword').focus(), 60);
}

function showApp() {
  $('#loginView').hidden = true;
  $('#adminApp').hidden = false;
  $('#loadingView').hidden = true;
}

function setBrand() {
  const store = state.catalog.store;
  [['#adminBrand', 'لوحة التحكم'], ['#loginBrand', store.tagline || '']].forEach(([selector, subtitle]) => {
    const element = $(selector);
    if (!element) return;
    const small = document.createElement('small');
    small.textContent = subtitle;
    element.replaceChildren(document.createTextNode(store.name), small);
  });
  $('#adminMark').textContent = (store.name || 'D').trim().charAt(0).toUpperCase();
  document.title = 'لوحة التحكم | ' + store.name;
}

async function loadAll() {
  const [catalog, ordersResponse] = await Promise.all([
    api('/api/admin/catalog'),
    api('/api/admin/orders')
  ]);
  state.catalog = catalog;
  state.orders = Array.isArray(ordersResponse.orders) ? ordersResponse.orders : [];
  setBrand();
  buildCategoryFilter();
  renderAll();
  fillSettings();
}

function renderAll() {
  renderNavCounts();
  renderOverview();
  renderProducts();
  renderOrders();
}

function renderNavCounts() {
  const newOrders = state.orders.filter((order) => (order.status || 'new') === 'new').length;
  $('#navProducts').textContent = state.catalog.products.length;
  $('#navOrders').textContent = newOrders;
}

function showView(name) {
  $$('.admin-view').forEach((view) => {
    view.hidden = view.id !== 'view-' + name;
  });
}

function renderTopActions(tab) {
  const target = $('#topActions');
  if (tab === 'overview') {
    target.innerHTML = '<button class="btn" type="button" data-new-product>+ إضافة منتج</button>';
  } else if (tab === 'editor') {
    target.innerHTML = '<button class="btn btn-outline" type="button" data-goto="products">رجوع للمنتجات</button>';
  } else {
    target.innerHTML = '';
  }
}

function openTab(tab) {
  state.tab = tab;
  const info = TAB_INFO[tab] || TAB_INFO.overview;
  $('#pageTitle').textContent = info[0];
  $('#pageSubtitle').textContent = info[1];
  showView(tab);
  renderTopActions(tab);
  $$('.admin-nav-item').forEach((item) => {
    const itemTab = item.dataset.tab;
    item.classList.toggle('is-active', itemTab === tab || (tab === 'editor' && itemTab === 'products'));
  });
  if (tab === 'orders') renderOrders();
  if (tab === 'products') renderProducts();
  if (tab === 'overview') renderOverview();
}

/* ---------- نظرة عامة ---------- */

function renderOverview() {
  const products = state.catalog.products;
  const orders = state.orders;
  const newOrders = orders.filter((order) => (order.status || 'new') === 'new');
  const revenue = orders
    .filter((order) => (order.status || 'new') !== 'cancelled')
    .reduce((total, order) => total + Number(order.total || 0), 0);
  const lowStock = products.filter((product) => Number(product.stock) <= 5).sort((a, b) => a.stock - b.stock);

  $('#statsGrid').innerHTML =
    '<div class="stat-card"><div class="stat-value">' + products.length + '</div><div class="stat-label">إجمالي المنتجات</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + orders.length + '</div><div class="stat-label">إجمالي الطلبات</div></div>' +
    '<div class="stat-card' + (newOrders.length ? ' is-alert' : '') + '"><div class="stat-value">' + newOrders.length + '</div><div class="stat-label">طلبات جديدة</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + money(revenue) + '</div><div class="stat-label">إجمالي المبيعات (بدون الملغي)</div></div>';

  const recent = orders.slice(0, 5);
  const recentBody = $('#recentOrdersBody');
  recentBody.innerHTML = recent
    .map((order) => {
      const status = STATUS[order.status] || STATUS.new;
      return (
        '<tr><td><strong>' + esc(order.number) + '</strong></td>' +
        '<td>' + esc(order.customer && order.customer.name) + '</td>' +
        '<td>' + money(order.total) + '</td>' +
        '<td><span class="status-pill ' + status.className + '">' + status.label + '</span></td></tr>'
      );
    })
    .join('');
  const recentWrap = recentBody.closest('.table-wrap');
  if (recentWrap) recentWrap.hidden = !recent.length;
  $('#recentOrdersEmpty').hidden = recent.length > 0;

  const lowList = $('#lowStockList');
  lowList.innerHTML = lowStock
    .slice(0, 6)
    .map(
      (product) =>
        '<li><img src="' + esc(product.image) + '" alt="' + esc(product.name) + '">' +
        '<span class="low-name">' + esc(product.name) + '</span>' +
        '<span class="low-count">المتبقي ' + Number(product.stock) + '</span></li>'
    )
    .join('');
  $('#lowStockEmpty').hidden = lowStock.length > 0;
}

/* ---------- المنتجات ---------- */

function buildCategoryFilter() {
  const categories = state.catalog.categories.filter((category) => category.id !== 'all');
  $('#productCategoryFilter').innerHTML =
    '<option value="">كل التصنيفات</option>' +
    categories.map((category) => '<option value="' + esc(category.id) + '">' + esc(category.name) + '</option>').join('');
}

function renderProducts() {
  const term = $('#productSearch').value.trim().toLowerCase();
  const category = $('#productCategoryFilter').value;
  const products = state.catalog.products.filter((product) => {
    const matchesTerm = !term || product.name.toLowerCase().includes(term) || (product.categoryName || '').toLowerCase().includes(term);
    const matchesCategory = !category || product.category === category;
    return matchesTerm && matchesCategory;
  });

  $('#productsTableBody').innerHTML = products
    .map(
      (product) =>
        '<tr>' +
        '<td><div class="product-cell"><img src="' + esc(product.image) + '" alt="' + esc(product.name) + '">' +
        '<div><strong>' + esc(product.name) + '</strong><small>' + esc(product.id) + ' · ' + product.colors.length + ' ألوان · ' + product.sizes.length + ' مقاسات</small></div></div></td>' +
        '<td>' + esc(product.categoryName) + '</td>' +
        '<td class="price-cell"><strong>' + money(product.price) + '</strong><small>' + money(product.oldPrice) + '</small></td>' +
        '<td><span class="stock-pill' + (Number(product.stock) <= 5 ? ' is-low' : '') + '">' + Number(product.stock) + '</span></td>' +
        '<td>' + Number(product.viewers || 0) + '</td>' +
        '<td><div class="row-actions">' +
        '<button type="button" data-edit="' + esc(product.id) + '">تعديل</button>' +
        '<button type="button" class="is-danger" data-delete="' + esc(product.id) + '">حذف</button>' +
        '</div></td></tr>'
    )
    .join('');
  $('#productsEmpty').hidden = products.length > 0;
}

function openEditor(productId) {
  const product = productId ? state.catalog.products.find((entry) => entry.id === productId) : null;
  state.editingId = product ? product.id : null;

  state.editor = {
    images: product ? product.images.slice() : [],
    colors: product ? product.colors.map((color) => ({ ...color })) : [{ name: '', hex: '#1c1c1c' }],
    sizes: product ? product.sizes.map((size) => ({ ...size })) : [{ label: '', hint: '' }],
    specs: product ? product.specs.map((row) => [row[0], row[1]]) : [['', '']]
  };

  const categories = state.catalog.categories.filter((category) => category.id !== 'all');
  $('#pfCategory').innerHTML = categories
    .map((category) => '<option value="' + esc(category.id) + '">' + esc(category.name) + '</option>')
    .join('');
  $('#pfBundleProduct').innerHTML =
    '<option value="">بدون باقة</option>' +
    state.catalog.products
      .filter((entry) => !product || entry.id !== product.id)
      .map((entry) => '<option value="' + esc(entry.id) + '">' + esc(entry.name) + '</option>')
      .join('');

  $('#pfName').value = product ? product.name : '';
  $('#pfCategory').value = product ? product.category : (categories[0] && categories[0].id) || '';
  $('#pfBadge').value = product && product.badge ? product.badge : '';
  $('#pfShort').value = product ? product.short || '' : '';
  $('#pfPrice').value = product ? product.price : '';
  $('#pfOldPrice').value = product ? product.oldPrice : '';
  $('#pfStock').value = product ? product.stock : 10;
  $('#pfViewers').value = product ? product.viewers : 10;
  $('#pfRating').value = product ? product.rating : 0;
  $('#pfReviewsCount').value = product ? product.reviewsCount : 0;
  $('#pfHighlights').value = product ? product.highlights.join('\n') : '';
  $('#pfDescription').value = product ? product.description.join('\n') : '';
  $('#pfBundleProduct').value = product && product.bundle ? product.bundle.productId : '';
  $('#pfBundlePrice').value = product && product.bundle ? product.bundle.price : '';
  $('#editorNote').textContent = product ? 'ستظهر آخر التعديلات في المتجر بعد الحفظ.' : 'سيظهر المنتج الجديد في المتجر بعد الحفظ.';

  renderImages();
  renderColorRows();
  renderSizeRows();
  renderSpecRows();
  syncBundlePrice();
  removeAllFieldErrors();

  $('#pageTitle').textContent = product ? 'تعديل منتج' : 'إضافة منتج';
  $('#pageSubtitle').textContent = product ? product.name : 'املأ بيانات المنتج الجديد';
  showView('editor');
  renderTopActions('editor');
  $$('.admin-nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.tab === 'products'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeAllFieldErrors() {
  $$('.field-error.dynamic', $('#productForm')).forEach((element) => element.remove());
  $$('.is-invalid', $('#productForm')).forEach((element) => element.classList.remove('is-invalid'));
}

function fieldError(input, message) {
  input.classList.add('is-invalid');
  const field = input.closest('.field') || input.parentElement;
  const error = document.createElement('span');
  error.className = 'field-error dynamic';
  error.textContent = message;
  field.appendChild(error);
}

function renderImages() {
  const list = $('#imageList');
  list.innerHTML = state.editor.images
    .map(
      (path, index) =>
        '<div class="image-row">' +
        '<img src="' + esc(path) + '" alt="صورة ' + (index + 1) + '">' +
        '<input class="admin-input img-path" type="text" value="' + esc(path) + '" data-image-path="' + index + '" placeholder="assets/img/products/..." aria-label="مسار الصورة ' + (index + 1) + '">' +
        '<div class="image-row-actions">' +
        '<button type="button" data-image-up="' + index + '"' + (index === 0 ? ' disabled' : '') + ' aria-label="نقل للأمام">↑</button>' +
        '<button type="button" data-image-down="' + index + '"' + (index === state.editor.images.length - 1 ? ' disabled' : '') + ' aria-label="نقل للخلف">↓</button>' +
        '<button type="button" class="is-danger" data-image-remove="' + index + '" aria-label="حذف الصورة">×</button>' +
        '</div></div>'
    )
    .join('');
}

function renderColorRows() {
  $('#colorRows').innerHTML = state.editor.colors
    .map(
      (color, index) =>
        '<div class="row-line colors">' +
        '<input type="color" value="' + esc(color.hex || '#1c1c1c') + '" data-color-hex="' + index + '" aria-label="رمز اللون">' +
        '<input type="text" value="' + esc(color.name) + '" data-color-name="' + index + '" placeholder="اسم اللون (مثال: أسود)">' +
        '<button type="button" class="row-remove" data-remove-color="' + index + '" aria-label="حذف اللون">×</button>' +
        '</div>'
    )
    .join('');
}

function renderSizeRows() {
  $('#sizeRows').innerHTML = state.editor.sizes
    .map(
      (size, index) =>
        '<div class="row-line sizes">' +
        '<input type="text" value="' + esc(size.label) + '" data-size-label="' + index + '" placeholder="المقاس (مثال: XL)">' +
        '<input type="text" value="' + esc(size.hint) + '" data-size-hint="' + index + '" placeholder="الوزن المناسب (مثال: من 75 إلى 88 كجم)">' +
        '<button type="button" class="row-remove" data-remove-size="' + index + '" aria-label="حذف المقاس">×</button>' +
        '</div>'
    )
    .join('');
}

function renderSpecRows() {
  $('#specRows').innerHTML = state.editor.specs
    .map(
      (spec, index) =>
        '<div class="row-line specs">' +
        '<input type="text" value="' + esc(spec[0]) + '" data-spec-key="' + index + '" placeholder="الخاصية (مثال: الخامة)">' +
        '<input type="text" value="' + esc(spec[1]) + '" data-spec-value="' + index + '" placeholder="القيمة (مثال: جلد طبيعي)">' +
        '<button type="button" class="row-remove" data-remove-spec="' + index + '" aria-label="حذف المواصفة">×</button>' +
        '</div>'
    )
    .join('');
}

function syncBundlePrice() {
  const hasBundle = Boolean($('#pfBundleProduct').value);
  $('#pfBundlePrice').disabled = !hasBundle;
  if (!hasBundle) $('#pfBundlePrice').value = '';
}

function collectProduct() {
  return {
    name: $('#pfName').value.trim(),
    category: $('#pfCategory').value,
    badge: $('#pfBadge').value.trim(),
    short: $('#pfShort').value.trim(),
    price: Number($('#pfPrice').value),
    oldPrice: Number($('#pfOldPrice').value),
    stock: Number($('#pfStock').value),
    viewers: Number($('#pfViewers').value),
    rating: Number($('#pfRating').value),
    reviewsCount: Number($('#pfReviewsCount').value),
    images: state.editor.images.map((path) => path.trim()).filter(Boolean),
    colors: state.editor.colors.filter((color) => color.name.trim() && color.hex),
    sizes: state.editor.sizes.filter((size) => size.label.trim()),
    highlights: $('#pfHighlights').value.split('\n').map((line) => line.trim()).filter(Boolean),
    description: $('#pfDescription').value.split('\n').map((line) => line.trim()).filter(Boolean),
    specs: state.editor.specs.filter((spec) => spec[0].trim() && spec[1].trim()),
    bundle: $('#pfBundleProduct').value
      ? { productId: $('#pfBundleProduct').value, price: Number($('#pfBundlePrice').value) }
      : null
  };
}

function validateProduct(product) {
  removeAllFieldErrors();
  if (product.name.length < 3) {
    fieldError($('#pfName'), 'اكتب اسم المنتج (3 أحرف على الأقل).');
    $('#pfName').focus();
    return false;
  }
  if (!(product.price > 0)) {
    fieldError($('#pfPrice'), 'اكتب سعر بيع أكبر من صفر.');
    $('#pfPrice').focus();
    return false;
  }
  if (!(product.oldPrice > product.price)) {
    fieldError($('#pfOldPrice'), 'يجب أن يكون السعر قبل الخصم أكبر من سعر البيع.');
    $('#pfOldPrice').focus();
    return false;
  }
  if (!product.images.length) {
    toast('أضف صورة واحدة على الأقل للمنتج.', 'error');
    $('#imageList').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  if (!product.colors.length) {
    toast('أضف لونًا واحدًا على الأقل مع اسمه ورمزه.', 'error');
    $('#colorRows').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  if (!product.sizes.length) {
    toast('أضف مقاسًا واحدًا على الأقل.', 'error');
    $('#sizeRows').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  if (product.bundle && !(product.bundle.price > 0)) {
    toast('اكتب سعر المنتج الآخر في الباقة أو اختر "بدون باقة".', 'error');
    $('#pfBundlePrice').focus();
    return false;
  }
  return true;
}

async function saveProduct(event) {
  event.preventDefault();
  if (state.saving || state.uploading) return;
  const product = collectProduct();
  if (!validateProduct(product)) return;

  state.saving = true;
  const button = $('#saveProductBtn');
  button.disabled = true;
  button.textContent = 'جارٍ الحفظ...';
  try {
    const response = state.editingId
      ? await api('/api/admin/products/' + encodeURIComponent(state.editingId), {
          method: 'PUT',
          body: JSON.stringify(product)
        })
      : await api('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(product)
        });
    if (state.editingId) {
      const index = state.catalog.products.findIndex((entry) => entry.id === state.editingId);
      if (index !== -1) state.catalog.products[index] = response.product;
    } else {
      state.catalog.products.push(response.product);
    }
    state.editingId = null;
    state.editor = null;
    renderAll();
    openTab('products');
    toast('تم حفظ المنتج وظهر في المتجر.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  } finally {
    state.saving = false;
    button.disabled = false;
    button.textContent = 'حفظ المنتج';
  }
}

async function deleteProduct(productId) {
  const product = state.catalog.products.find((entry) => entry.id === productId);
  if (!product) return;
  if (!window.confirm('سيتم حذف "' + product.name + '" نهائيًا. هل تريد المتابعة؟')) return;
  try {
    await api('/api/admin/products/' + encodeURIComponent(productId), { method: 'DELETE' });
    state.catalog = await api('/api/admin/catalog');
    renderAll();
    toast('تم حذف المنتج.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  }
}

/* ---------- الطلبات ---------- */

function filteredOrders() {
  const term = $('#orderSearch').value.trim().toLowerCase();
  const status = $('#orderStatusFilter').value;
  return state.orders.filter((order) => {
    const customer = order.customer || {};
    const haystack = [order.number, customer.name, customer.phone, customer.governorate, customer.address]
      .join(' ')
      .toLowerCase();
    const matchesTerm = !term || haystack.includes(term);
    const matchesStatus = !status || (order.status || 'new') === status;
    return matchesTerm && matchesStatus;
  });
}

function orderDetailsMarkup(order) {
  const customer = order.customer || {};
  const status = order.status || 'new';
  const waPhone = String(customer.phone || '').startsWith('0') ? '2' + customer.phone : String(customer.phone || '');
  const waText = encodeURIComponent('مرحبًا ' + customer.name + '، بخصوص طلبك ' + order.number + ' من ' + storeName());
  const items = (order.items || [])
    .map(
      (item) =>
        '<li><span>' + esc(item.name) +
        '<small>' + esc([item.color, item.size].filter(Boolean).join(' / ')) + '</small></span>' +
        '<span>' + Number(item.qty) + ' × ' + money(item.price) + '</span></li>'
    )
    .join('');
  return (
    '<div class="order-details">' +
    '<div><h4>بيانات الشحن</h4>' +
    '<p>' + esc(customer.address) + '<br>' + esc(customer.governorate) + '<br>' + esc(customer.phone) + '</p>' +
    (customer.notes ? '<h4>ملاحظات العميل</h4><p>' + esc(customer.notes) + '</p>' : '') +
    '<div class="order-detail-actions">' +
    '<a class="btn btn-wa" href="https://wa.me/' + esc(waPhone) + '?text=' + esc(waText) + '" target="_blank" rel="noopener">واتساب</a>' +
    '<a class="btn btn-outline" href="tel:' + esc(customer.phone) + '">اتصال</a>' +
    '<button type="button" class="link-btn is-danger" data-delete-order="' + esc(order.number) + '">حذف الطلب</button>' +
    '</div></div>' +
    '<div><h4>المنتجات</h4><ul class="order-items">' + items + '</ul>' +
    '<p>الشحن: ' + (Number(order.shipping) === 0 ? 'مجاني' : money(order.shipping)) + '<br><strong>الإجمالي: ' + money(order.total) + '</strong></p>' +
    '</div></div>'
  );
}

function renderOrders() {
  const orders = filteredOrders();
  const body = $('#ordersTableBody');
  body.innerHTML = orders
    .map((order) => {
      const customer = order.customer || {};
      return (
        '<tr>' +
        '<td><strong>' + esc(order.number) + '</strong></td>' +
        '<td>' + formatDate(order.date) + '</td>' +
        '<td class="order-customer"><strong>' + esc(customer.name) + '</strong><small>' + esc(customer.phone) + '</small></td>' +
        '<td>' + esc(customer.governorate) + '</td>' +
        '<td>' + money(order.total) + '</td>' +
        '<td><select class="status-select" data-status-for="' + esc(order.number) + '" aria-label="حالة الطلب">' +
        Object.entries(STATUS)
          .map(([value, info]) => '<option value="' + value + '"' + ((order.status || 'new') === value ? ' selected' : '') + '>' + info.label + '</option>')
          .join('') +
        '</select></td>' +
        '<td><button type="button" class="link-btn" data-details="' + esc(order.number) + '">تفاصيل</button></td>' +
        '</tr>' +
        '<tr class="order-details-row" data-details-row="' + esc(order.number) + '" hidden><td colspan="7">' +
        orderDetailsMarkup(order) +
        '</td></tr>'
      );
    })
    .join('');
  $('#ordersEmpty').hidden = orders.length > 0;
}

async function updateOrderStatus(number, status) {
  try {
    const response = await api('/api/admin/orders/' + encodeURIComponent(number), {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    const index = state.orders.findIndex((order) => order.number === number);
    if (index !== -1) state.orders[index] = response.order;
    renderNavCounts();
    renderOverview();
    toast('تم تحديث حالة الطلب.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  }
}

async function deleteOrder(number) {
  if (!window.confirm('سيتم حذف الطلب ' + number + ' نهائيًا. هل تريد المتابعة؟')) return;
  try {
    await api('/api/admin/orders/' + encodeURIComponent(number), { method: 'DELETE' });
    state.orders = state.orders.filter((order) => order.number !== number);
    renderAll();
    toast('تم حذف الطلب.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  }
}

/* ---------- الإعدادات ---------- */

function fillSettings() {
  const store = state.catalog.store;
  $('#stName').value = store.name || '';
  $('#stTagline').value = store.tagline || '';
  $('#stWhatsapp').value = store.whatsapp || '';
  $('#stPhone').value = store.phone || '';
  $('#stFreeShipping').value = store.freeShipping || 0;
  $('#stAnnouncement').value = store.announcement || '';

  $('#shippingGrid').innerHTML = state.catalog.governorates
    .map(
      (entry) =>
        '<label class="gov-row"><span>' + esc(entry.name) + '</span>' +
        '<input type="number" min="0" max="500" step="5" value="' + Number(entry.fee) + '" data-gov="' + esc(entry.name) + '" aria-label="شحن ' + esc(entry.name) + '"></label>'
    )
    .join('');
}

async function saveStore(event) {
  event.preventDefault();
  const payload = {
    name: $('#stName').value.trim(),
    tagline: $('#stTagline').value.trim(),
    whatsapp: $('#stWhatsapp').value.trim(),
    phone: $('#stPhone').value.trim(),
    freeShipping: Number($('#stFreeShipping').value),
    announcement: $('#stAnnouncement').value.trim()
  };
  try {
    const response = await api('/api/admin/store', { method: 'PUT', body: JSON.stringify(payload) });
    state.catalog.store = response.store;
    setBrand();
    toast('تم تحديث بيانات المتجر.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  }
}

async function saveShipping() {
  const governorates = $$('#shippingGrid [data-gov]').map((input) => ({
    name: input.dataset.gov,
    fee: Number(input.value)
  }));
  try {
    const response = await api('/api/admin/governorates', {
      method: 'PUT',
      body: JSON.stringify({ governorates })
    });
    state.catalog.governorates = response.governorates;
    toast('تم تحديث مصاريف الشحن.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  }
}

async function changePassword(event) {
  event.preventDefault();
  const current = $('#pwCurrent').value;
  const next = $('#pwNext').value;
  const confirm = $('#pwConfirm').value;
  if (next.length < 8) return toast('يجب أن تكون كلمة السر الجديدة 8 أحرف على الأقل.', 'error');
  if (next !== confirm) return toast('تأكيد كلمة السر غير مطابق.', 'error');
  try {
    await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ current, next }) });
    $('#passwordForm').reset();
    toast('تم تغيير كلمة السر.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  }
}

/* ---------- النسخ الاحتياطي ---------- */

async function exportBackup() {
  try {
    const data = await api('/api/admin/backup');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'd-store-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    toast('تم تنزيل النسخة الاحتياطية.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message, 'error');
  }
}

async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!window.confirm('ستؤدي استعادة النسخة إلى استبدال المنتجات والإعدادات والطلبات الحالية. هل تريد المتابعة؟')) return;
    await api('/api/admin/restore', { method: 'POST', body: JSON.stringify(data) });
    await loadAll();
    openTab('overview');
    toast('تمت استعادة النسخة الاحتياطية.');
  } catch (error) {
    if (error.message !== 'unauth') toast(error.message === 'Unexpected token' ? 'ملف النسخة غير صحيح.' : error.message, 'error');
  } finally {
    $('#importFile').value = '';
  }
}

/* ---------- الأحداث ---------- */

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bindEvents() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('#loginPassword');
    const error = $('#loginError');
    const button = $('#loginSubmit');
    error.hidden = true;
    button.disabled = true;
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'كلمة السر غير صحيحة');
      input.value = '';
      await loadAll();
      showApp();
      openTab('overview');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      input.focus();
    } finally {
      button.disabled = false;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
      // تجاهل
    }
    state.catalog = null;
    state.orders = [];
    showLogin();
  });

  $$('.admin-nav-item').forEach((item) => {
    item.addEventListener('click', () => openTab(item.dataset.tab));
  });

  document.addEventListener('click', (event) => {
    const goto = event.target.closest('[data-goto]');
    if (goto) {
      openTab(goto.dataset.goto);
      return;
    }
    if (event.target.closest('[data-new-product]')) openEditor(null);
  });

  $('#newProductBtn').addEventListener('click', () => openEditor(null));
  $('#productSearch').addEventListener('input', renderProducts);
  $('#productCategoryFilter').addEventListener('change', renderProducts);

  $('#productsTableBody').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    if (edit) openEditor(edit.dataset.edit);
    if (remove) deleteProduct(remove.dataset.delete);
  });

  $('#imageList').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-image-remove]');
    const up = event.target.closest('[data-image-up]');
    const down = event.target.closest('[data-image-down]');
    if (remove) {
      state.editor.images.splice(Number(remove.dataset.imageRemove), 1);
      renderImages();
    }
    if (up) {
      const index = Number(up.dataset.imageUp);
      [state.editor.images[index - 1], state.editor.images[index]] = [state.editor.images[index], state.editor.images[index - 1]];
      renderImages();
    }
    if (down) {
      const index = Number(down.dataset.imageDown);
      [state.editor.images[index + 1], state.editor.images[index]] = [state.editor.images[index], state.editor.images[index + 1]];
      renderImages();
    }
  });

  $('#imageList').addEventListener('input', (event) => {
    const input = event.target.closest('[data-image-path]');
    if (input) state.editor.images[Number(input.dataset.imagePath)] = input.value;
  });

  $('#addImagePathBtn').addEventListener('click', () => {
    if (state.editor.images.length >= 8) return toast('الحد الأقصى 8 صور للمنتج.', 'error');
    state.editor.images.push('');
    renderImages();
    const inputs = $$('.img-path');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  $('#imageUpload').addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (state.uploading) return;
    const remaining = 8 - state.editor.images.length;
    if (remaining <= 0) return toast('الحد الأقصى 8 صور للمنتج.', 'error');
    state.uploading = true;
    $('#uploadState').hidden = false;
    $('#saveProductBtn').disabled = true;
    try {
      for (const file of files.slice(0, remaining)) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
          toast('صورة "' + file.name + '" غير مدعومة. استخدم JPG أو PNG أو WebP.', 'error');
          continue;
        }
        if (file.size > 4 * 1024 * 1024) {
          toast('صورة "' + file.name + '" تتجاوز 4 ميجابايت.', 'error');
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const response = await api('/api/admin/upload', {
          method: 'POST',
          body: JSON.stringify({ data: dataUrl })
        });
        state.editor.images.push(response.path);
        renderImages();
      }
      toast('تم رفع الصور.');
    } catch (error) {
      if (error.message !== 'unauth') toast(error.message, 'error');
    } finally {
      state.uploading = false;
      $('#uploadState').hidden = true;
      $('#saveProductBtn').disabled = false;
    }
  });

  $('#colorRows').addEventListener('input', (event) => {
    const hex = event.target.closest('[data-color-hex]');
    const name = event.target.closest('[data-color-name]');
    if (hex) state.editor.colors[Number(hex.dataset.colorHex)].hex = hex.value;
    if (name) state.editor.colors[Number(name.dataset.colorName)].name = name.value;
  });

  $('#colorRows').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-color]');
    if (!remove) return;
    if (state.editor.colors.length === 1) return toast('يجب أن يحتوي المنتج على لون واحد على الأقل.', 'error');
    state.editor.colors.splice(Number(remove.dataset.removeColor), 1);
    renderColorRows();
  });

  $('#sizeRows').addEventListener('input', (event) => {
    const label = event.target.closest('[data-size-label]');
    const hint = event.target.closest('[data-size-hint]');
    if (label) state.editor.sizes[Number(label.dataset.sizeLabel)].label = label.value;
    if (hint) state.editor.sizes[Number(hint.dataset.sizeHint)].hint = hint.value;
  });

  $('#sizeRows').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-size]');
    if (!remove) return;
    if (state.editor.sizes.length === 1) return toast('يجب أن يحتوي المنتج على مقاس واحد على الأقل.', 'error');
    state.editor.sizes.splice(Number(remove.dataset.removeSize), 1);
    renderSizeRows();
  });

  $('#specRows').addEventListener('input', (event) => {
    const key = event.target.closest('[data-spec-key]');
    const value = event.target.closest('[data-spec-value]');
    if (key) state.editor.specs[Number(key.dataset.specKey)][0] = key.value;
    if (value) state.editor.specs[Number(value.dataset.specValue)][1] = value.value;
  });

  $('#specRows').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-spec]');
    if (!remove) return;
    state.editor.specs.splice(Number(remove.dataset.removeSpec), 1);
    renderSpecRows();
  });

  $('#addColorBtn').addEventListener('click', () => {
    if (state.editor.colors.length >= 8) return toast('الحد الأقصى 8 ألوان.', 'error');
    state.editor.colors.push({ name: '', hex: '#1c1c1c' });
    renderColorRows();
  });

  $('#addSizeBtn').addEventListener('click', () => {
    if (state.editor.sizes.length >= 8) return toast('الحد الأقصى 8 مقاسات.', 'error');
    state.editor.sizes.push({ label: '', hint: '' });
    renderSizeRows();
  });

  $('#addSpecBtn').addEventListener('click', () => {
    if (state.editor.specs.length >= 12) return toast('الحد الأقصى 12 مواصفة.', 'error');
    state.editor.specs.push(['', '']);
    renderSpecRows();
  });

  $('#pfBundleProduct').addEventListener('change', syncBundlePrice);
  $('#productForm').addEventListener('submit', saveProduct);
  $('#cancelEditBtn').addEventListener('click', () => openTab('products'));

  $('#orderSearch').addEventListener('input', renderOrders);
  $('#orderStatusFilter').addEventListener('change', renderOrders);

  $('#ordersTableBody').addEventListener('change', (event) => {
    const select = event.target.closest('[data-status-for]');
    if (select) updateOrderStatus(select.dataset.statusFor, select.value);
  });

  $('#ordersTableBody').addEventListener('click', (event) => {
    const details = event.target.closest('[data-details]');
    const remove = event.target.closest('[data-delete-order]');
    if (details) {
      const row = $('[data-details-row="' + CSS.escape(details.dataset.details) + '"]');
      if (row) {
        row.hidden = !row.hidden;
        details.textContent = row.hidden ? 'تفاصيل' : 'إخفاء';
      }
    }
    if (remove) deleteOrder(remove.dataset.deleteOrder);
  });

  $('#storeForm').addEventListener('submit', saveStore);
  $('#saveShippingBtn').addEventListener('click', saveShipping);
  $('#passwordForm').addEventListener('submit', changePassword);
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importFile').addEventListener('change', (event) => importBackup(event.target.files[0]));
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  try {
    const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
    if (!response.ok) return showLogin();
    await loadAll();
    showApp();
    openTab('overview');
  } catch (error) {
    showLogin();
  }
});
