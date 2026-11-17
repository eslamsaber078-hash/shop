document.addEventListener('DOMContentLoaded', () => {
  const form = qs('#checkoutForm');
  if (!form) return;

  const content = qs('#checkoutContent');
  const emptyState = qs('#emptyCart');
  const govSelect = qs('#checkoutGov');
  let orderPlaced = false;

  govSelect.innerHTML += GOVERNORATES.map((gov) => '<option value="' + gov.name + '">' + gov.name + '</option>').join('');

  function updateTotals(subtotal) {
    const governorate = govSelect.value;
    const shipping = shippingFor(governorate, subtotal);
    qs('#sideSubtotal').textContent = formatPrice(subtotal);
    qs('#sideShipping').textContent = governorate
      ? shipping === 0
        ? 'مجاني'
        : formatPrice(shipping)
      : 'اختر المحافظة';
    qs('#sideTotal').textContent = formatPrice(subtotal + (shipping || 0));
    qs('#sideNote').hidden = subtotal < STORE.freeShipping;
  }

  function render() {
    if (orderPlaced) return;
    const cart = readCart();
    const hasItems = cart.length > 0;
    content.hidden = !hasItems;
    emptyState.hidden = hasItems;
    if (!hasItems) return;

    qs('#checkoutItems').innerHTML = cart
      .map((item) => {
        const product = getProduct(item.id);
        const key = cartKey(item);
        return (
          '<div class="checkout-item">' +
          '<img src="' + product.image + '" alt="' + product.name + '" width="62" height="78">' +
          '<div class="checkout-item-info">' +
          '<strong>' + product.name + '</strong>' +
          '<small>اللون: ' + item.color + ' &middot; المقاس: ' + item.size + (item.priceOverride != null ? ' &middot; سعر الباقة' : '') + '</small>' +
          '</div>' +
          '<div class="qty qty-sm">' +
          '<button type="button" data-checkout-dec="' + key + '" aria-label="تقليل الكمية">&minus;</button>' +
          '<span>' + item.qty + '</span>' +
          '<button type="button" data-checkout-inc="' + key + '" aria-label="زيادة الكمية">+</button>' +
          '</div>' +
          '<span class="checkout-item-price">' + formatPrice(linePrice(item) * item.qty) + '</span>' +
          '</div>'
        );
      })
      .join('');

    qs('#sideCount').textContent = cartCount(cart);
    updateTotals(cartSubtotal(cart));
  }

  render();
  document.addEventListener('cart:change', render);
  govSelect.addEventListener('change', () => updateTotals(cartSubtotal()));

  qs('#checkoutItems').addEventListener('click', (event) => {
    const inc = event.target.closest('[data-checkout-inc]');
    const dec = event.target.closest('[data-checkout-dec]');
    const key = inc ? inc.getAttribute('data-checkout-inc') : dec ? dec.getAttribute('data-checkout-dec') : null;
    if (!key) return;
    const line = readCart().find((item) => cartKey(item) === key);
    if (!line) return;
    setCartQuantity(key, line.qty + (inc ? 1 : -1));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const cart = readCart();
    if (!cart.length) {
      render();
      return;
    }

    const customer = collectCustomer(form);
    const errors = validateCustomer(customer);
    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }
    showFieldErrors(form, {});

    const subtotal = cartSubtotal(cart);
    const shipping = shippingFor(customer.governorate, subtotal);
    const order = {
      number: makeOrderNumber(),
      date: new Date().toISOString(),
      customer: customer,
      items: cart.map((item) => ({
        id: item.id,
        name: getProduct(item.id).name,
        color: item.color,
        size: item.size,
        qty: item.qty,
        price: linePrice(item)
      })),
      subtotal: subtotal,
      shipping: shipping,
      total: subtotal + shipping
    };

    saveOrder(order);
    orderPlaced = true;
    writeCart([]);

    content.hidden = true;
    emptyState.hidden = true;
    const success = qs('#checkoutSuccess');
    success.hidden = false;
    qs('#checkoutOrderNumber').textContent = order.number;
    renderOrderItems(order, qs('#checkoutSuccessItems'));
    qs('#checkoutSuccessShipping').textContent = order.shipping === 0 ? 'مجاني' : formatPrice(order.shipping);
    qs('#checkoutSuccessTotal').textContent = formatPrice(order.total);
    qs('#checkoutWhatsapp').href = whatsappOrderLink(order);
    document.title = 'تم استلام الطلب | ' + STORE.name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
