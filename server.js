const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8140);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.join(ROOT, 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'img', 'products');
const SESSION_TTL = 12 * 60 * 60 * 1000;
const DEFAULT_PASSWORD = 'Dstore@2026';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const sessions = new Map();

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
};

const writeJson = async (file, value) => {
  const temp = file + '.tmp';
  await fsp.writeFile(temp, JSON.stringify(value, null, 2));
  await fsp.rename(temp, file);
};

const getCatalog = () => readJson(CATALOG_FILE, null);
const getOrders = () => readJson(ORDERS_FILE, []);

const hashPassword = (password, salt) =>
  crypto.createHash('sha256').update(salt + password).digest('hex');

async function verifyPassword(password) {
  const auth = await readJson(AUTH_FILE, null);
  if (!auth || !auth.salt || !auth.hash) return false;
  const attempt = Buffer.from(hashPassword(String(password), auth.salt), 'hex');
  const stored = Buffer.from(auth.hash, 'hex');
  return attempt.length === stored.length && crypto.timingSafeEqual(attempt, stored);
}

async function ensureData() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(AUTH_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    await writeJson(AUTH_FILE, { salt, hash: hashPassword(DEFAULT_PASSWORD, salt) });
    console.log('تم إنشاء كلمة سر افتراضية: ' + DEFAULT_PASSWORD);
  }
  if (!fs.existsSync(ORDERS_FILE)) await writeJson(ORDERS_FILE, []);
}

const parseCookies = (req) => {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((all, part) => {
    const index = part.indexOf('=');
    if (index > 0) all[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return all;
  }, {});
};

const isAuthed = (req) => {
  const token = parseCookies(req).ds_admin;
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL);
  return true;
};

const cookieHeader = (req, token, maxAge) => {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return 'ds_admin=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + secure;
};

const sameOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (error) {
    return false;
  }
};

const readBody = (req, limit = 1024 * 1024) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('حجم الطلب كبير جدًا'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(Object.assign(new Error('بيانات غير صحيحة'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });

const sendJson = (res, status, value) => {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
};

const fail = (res, status, message) => sendJson(res, status, { error: message });

const cleanText = (value, max) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
const cleanMultiline = (value, max) => String(value == null ? '' : value).replace(/\r/g, '').trim().slice(0, max);
const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const cleanHex = (value) => {
  const hex = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : '';
};

function normalizeProduct(input, catalog, existing) {
  if (!input || typeof input !== 'object') throw Object.assign(new Error('بيانات المنتج ناقصة'), { status: 400 });
  const name = cleanText(input.name, 80);
  if (name.length < 3) throw Object.assign(new Error('يجب أن يكون اسم المنتج 3 أحرف على الأقل'), { status: 400 });

  const category = cleanText(input.category, 30);
  const categoryEntry = catalog.categories.find((entry) => entry.id === category);
  if (!categoryEntry) throw Object.assign(new Error('اختر تصنيفًا صحيحًا للمنتج'), { status: 400 });

  const price = Math.round(toNumber(input.price));
  const oldPrice = Math.round(toNumber(input.oldPrice));
  if (price <= 0) throw Object.assign(new Error('يجب أن يكون سعر المنتج أكبر من صفر'), { status: 400 });
  if (oldPrice <= price) throw Object.assign(new Error('يجب أن يكون السعر قبل الخصم أكبر من سعر البيع'), { status: 400 });

  const images = (Array.isArray(input.images) ? input.images : [])
    .map((item) => String(item || '').trim())
    .filter((item) => item && !item.includes('..'))
    .slice(0, 8);
  if (!images.length) throw Object.assign(new Error('أضف صورة واحدة على الأقل للمنتج'), { status: 400 });

  const seenColors = new Set();
  const colors = (Array.isArray(input.colors) ? input.colors : [])
    .map((color) => ({
      name: cleanText(color && color.name, 24),
      hex: cleanHex(color && color.hex)
    }))
    .filter((color) => {
      if (!color.name || !color.hex || seenColors.has(color.name)) return false;
      seenColors.add(color.name);
      return true;
    })
    .slice(0, 8);
  if (!colors.length) throw Object.assign(new Error('أضف لونًا واحدًا على الأقل مع اسمه ورمزه'), { status: 400 });

  const seenSizes = new Set();
  const sizes = (Array.isArray(input.sizes) ? input.sizes : [])
    .map((size) => ({
      label: cleanText(size && size.label, 16).toUpperCase(),
      hint: cleanText(size && size.hint, 40)
    }))
    .filter((size) => {
      if (!size.label || seenSizes.has(size.label)) return false;
      seenSizes.add(size.label);
      return true;
    })
    .slice(0, 8);
  if (!sizes.length) throw Object.assign(new Error('أضف مقاسًا واحدًا على الأقل'), { status: 400 });

  const highlights = (Array.isArray(input.highlights) ? input.highlights : [])
    .map((item) => cleanText(item, 90))
    .filter(Boolean)
    .slice(0, 8);
  const description = (Array.isArray(input.description) ? input.description : [])
    .map((item) => cleanMultiline(item, 900))
    .filter(Boolean)
    .slice(0, 6);
  const specs = (Array.isArray(input.specs) ? input.specs : [])
    .map((row) => [cleanText(row && row[0], 40), cleanText(row && row[1], 80)])
    .filter((row) => row[0] && row[1])
    .slice(0, 12);

  let bundle = null;
  if (input.bundle && input.bundle.productId) {
    const bundleProduct = catalog.products.find((product) => product.id === input.bundle.productId && product.id !== (existing && existing.id));
    const bundlePrice = Math.round(toNumber(input.bundle.price));
    if (bundleProduct && bundlePrice > 0) bundle = { productId: bundleProduct.id, price: bundlePrice };
  }

  const stock = Math.max(0, Math.round(toNumber(input.stock, 0)));
  const viewers = Math.max(0, Math.round(toNumber(input.viewers, 0)));
  const rating = Math.min(5, Math.max(0, Math.round(toNumber(input.rating, 0) * 10) / 10));
  const reviewsCount = Math.max(0, Math.round(toNumber(input.reviewsCount, 0)));
  const badge = cleanText(input.badge, 24);

  const product = {
    id: existing ? existing.id : 'p-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'),
    name,
    category,
    categoryName: categoryEntry.name,
    price,
    oldPrice,
    image: images[0],
    images,
    colors,
    sizes,
    stock,
    viewers,
    rating,
    reviewsCount,
    short: cleanText(input.short, 180),
    highlights,
    description,
    specs,
    reviews: existing && Array.isArray(existing.reviews) ? existing.reviews : []
  };
  if (badge) product.badge = badge;
  if (bundle) product.bundle = bundle;
  return product;
}

function normalizeStatus(value) {
  const allowed = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  return allowed.includes(value) ? value : null;
}

async function handleApi(req, res, pathname) {
  const method = req.method;

  if (method === 'POST' && pathname === '/api/orders') {
    const body = await readBody(req, 256 * 1024);
    const errors = [];
    const number = cleanText(body.number, 30);
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!/^[A-Za-z0-9-]{4,30}$/.test(number)) errors.push('رقم الطلب غير صحيح');
    if (!cleanText(customer.name, 60)) errors.push('الاسم مطلوب');
    if (!/^01[0125][0-9]{8}$/.test(String(customer.phone || ''))) errors.push('رقم الهاتف غير صحيح');
    if (!cleanText(customer.governorate, 30)) errors.push('المحافظة مطلوبة');
    if (!cleanText(customer.address, 200)) errors.push('العنوان مطلوب');
    if (!items.length || items.length > 50) errors.push('المنتجات مطلوبة');
    if (errors.length) return fail(res, 400, errors[0]);

    const orders = await getOrders();
    if (orders.some((order) => order.number === number)) return sendJson(res, 200, { ok: true, duplicate: true });

    const order = {
      number,
      date: new Date().toISOString(),
      customer: {
        name: cleanText(customer.name, 60),
        phone: String(customer.phone || ''),
        governorate: cleanText(customer.governorate, 30),
        address: cleanText(customer.address, 200),
        notes: cleanText(customer.notes, 200)
      },
      items: items.slice(0, 50).map((item) => ({
        id: cleanText(item && item.id, 40),
        name: cleanText(item && item.name, 90),
        color: cleanText(item && item.color, 24),
        size: cleanText(item && item.size, 16),
        qty: Math.max(1, Math.min(20, Math.round(toNumber(item && item.qty, 1)))),
        price: Math.max(0, Math.round(toNumber(item && item.price, 0)))
      })),
      subtotal: Math.max(0, Math.round(toNumber(body.subtotal, 0))),
      shipping: Math.max(0, Math.round(toNumber(body.shipping, 0))),
      total: Math.max(0, Math.round(toNumber(body.total, 0))),
      status: 'new'
    };
    orders.unshift(order);
    await writeJson(ORDERS_FILE, orders.slice(0, 500));
    return sendJson(res, 200, { ok: true, number });
  }

  if (pathname === '/api/admin/session' && method === 'GET') {
    return sendJson(res, isAuthed(req) ? 200 : 401, { ok: isAuthed(req) });
  }

  if (pathname === '/api/admin/login' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const body = await readBody(req, 16 * 1024);
    if (!(await verifyPassword(body.password))) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return fail(res, 401, 'كلمة السر غير صحيحة');
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_TTL / 1000));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/logout' && method === 'POST') {
    const token = parseCookies(req).ds_admin;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith('/api/admin/') && !isAuthed(req)) return fail(res, 401, 'يجب تسجيل الدخول');

  if (pathname === '/api/admin/catalog' && method === 'GET') {
    const catalog = await getCatalog();
    if (!catalog) return fail(res, 500, 'بيانات المتجر غير موجودة');
    return sendJson(res, 200, catalog);
  }

  if (pathname === '/api/admin/store' && method === 'PUT') {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const body = await readBody(req, 64 * 1024);
    const catalog = await getCatalog();
    const store = catalog.store || {};
    const name = cleanText(body.name, 40);
    const tagline = cleanText(body.tagline, 40);
    const whatsapp = String(body.whatsapp || '').replace(/[^\d]/g, '');
    const phone = String(body.phone || '').replace(/[^\d]/g, '');
    const freeShipping = Math.round(toNumber(body.freeShipping, -1));
    const announcement = cleanText(body.announcement, 140);
    if (name.length < 2) return fail(res, 400, 'اسم المتجر قصير جدًا');
    if (!/^\d{10,15}$/.test(whatsapp)) return fail(res, 400, 'يجب إدخال رقم واتساب بالكود الدولي دون + (مثال: 201012345678)');
    if (phone && !/^\d{8,15}$/.test(phone)) return fail(res, 400, 'رقم الهاتف غير صحيح');
    if (freeShipping < 0) return fail(res, 400, 'حد الشحن المجاني غير صحيح');
    catalog.store = { ...store, name, tagline, whatsapp, phone, freeShipping, announcement };
    await writeJson(CATALOG_FILE, catalog);
    return sendJson(res, 200, { ok: true, store: catalog.store });
  }

  if (pathname === '/api/admin/governorates' && method === 'PUT') {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const body = await readBody(req, 64 * 1024);
    const catalog = await getCatalog();
    if (!Array.isArray(body.governorates)) return fail(res, 400, 'بيانات المحافظات غير صحيحة');
    const fees = new Map();
    for (const entry of body.governorates) {
      const name = cleanText(entry && entry.name, 30);
      const fee = Math.round(toNumber(entry && entry.fee, -1));
      if (!name || fee < 0 || fee > 500) return fail(res, 400, 'توجد محافظة ببيانات غير صحيحة');
      fees.set(name, fee);
    }
    catalog.governorates = catalog.governorates.map((entry) => ({
      name: entry.name,
      fee: fees.has(entry.name) ? fees.get(entry.name) : entry.fee
    }));
    await writeJson(CATALOG_FILE, catalog);
    return sendJson(res, 200, { ok: true, governorates: catalog.governorates });
  }

  if (pathname === '/api/admin/products' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const body = await readBody(req, 256 * 1024);
    const catalog = await getCatalog();
    const product = normalizeProduct(body, catalog, null);
    catalog.products.push(product);
    await writeJson(CATALOG_FILE, catalog);
    return sendJson(res, 200, { ok: true, product });
  }

  const productMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch) {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const catalog = await getCatalog();
    const index = catalog.products.findIndex((entry) => entry.id === productMatch[1]);
    if (index === -1) return fail(res, 404, 'المنتج غير موجود');

    if (method === 'PUT') {
      const body = await readBody(req, 256 * 1024);
      const product = normalizeProduct(body, catalog, catalog.products[index]);
      catalog.products[index] = product;
      await writeJson(CATALOG_FILE, catalog);
      return sendJson(res, 200, { ok: true, product });
    }

    if (method === 'DELETE') {
      const removed = catalog.products[index];
      catalog.products.splice(index, 1);
      catalog.products.forEach((product) => {
        if (product.bundle && product.bundle.productId === removed.id) delete product.bundle;
      });
      await writeJson(CATALOG_FILE, catalog);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/admin/upload' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const body = await readBody(req, 12 * 1024 * 1024);
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
    if (!match) return fail(res, 400, 'ملف الصورة غير مدعوم (JPG أو PNG أو WebP)');
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return fail(res, 400, 'ملف الصورة فارغ');
    if (buffer.length > 4 * 1024 * 1024) return fail(res, 413, 'حجم الصورة يتجاوز 4 ميجابايت');
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const filename = 'admin-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex') + '.' + ext;
    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
    await fsp.writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return sendJson(res, 200, { ok: true, path: 'assets/img/products/' + filename });
  }

  if (pathname === '/api/admin/orders' && method === 'GET') {
    return sendJson(res, 200, { orders: await getOrders() });
  }

  const orderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch) {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const orders = await getOrders();
    const index = orders.findIndex((order) => order.number === decodeURIComponent(orderMatch[1]));
    if (index === -1) return fail(res, 404, 'الطلب غير موجود');

    if (method === 'PATCH') {
      const body = await readBody(req, 16 * 1024);
      const status = normalizeStatus(body.status);
      if (!status) return fail(res, 400, 'حالة الطلب غير صحيحة');
      orders[index].status = status;
      await writeJson(ORDERS_FILE, orders);
      return sendJson(res, 200, { ok: true, order: orders[index] });
    }

    if (method === 'DELETE') {
      orders.splice(index, 1);
      await writeJson(ORDERS_FILE, orders);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/admin/backup' && method === 'GET') {
    const catalog = await getCatalog();
    return sendJson(res, 200, {
      exportedAt: new Date().toISOString(),
      catalog,
      orders: await getOrders()
    });
  }

  if (pathname === '/api/admin/restore' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const body = await readBody(req, 10 * 1024 * 1024);
    const catalog = body.catalog;
    const orders = body.orders;
    if (!catalog || !Array.isArray(catalog.products) || !Array.isArray(catalog.governorates) || !Array.isArray(catalog.categories) || !Array.isArray(catalog.faqs) || !catalog.store) {
      return fail(res, 400, 'ملف النسخة الاحتياطية غير صحيح');
    }
    if (!Array.isArray(orders)) return fail(res, 400, 'بيانات الطلبات في الملف غير صحيحة');
    const validProducts = catalog.products.every((product) => product && typeof product.id === 'string' && typeof product.name === 'string' && Number(product.price) > 0);
    if (!validProducts) return fail(res, 400, 'توجد منتجات ناقصة في الملف');
    await writeJson(CATALOG_FILE, catalog);
    await writeJson(ORDERS_FILE, orders.slice(0, 500));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/password' && method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'طلب غير مسموح');
    const body = await readBody(req, 16 * 1024);
    const next = String(body.next || '');
    if (!(await verifyPassword(body.current))) return fail(res, 400, 'كلمة السر الحالية غير صحيحة');
    if (next.length < 8) return fail(res, 400, 'يجب أن تكون كلمة السر الجديدة 8 أحرف على الأقل');
    const salt = crypto.randomBytes(16).toString('hex');
    await writeJson(AUTH_FILE, { salt, hash: hashPassword(next, salt) });
    return sendJson(res, 200, { ok: true });
  }

  return fail(res, 404, 'المسار غير موجود');
}

function dataJs(catalog) {
  const js = [
    'const STORE = ' + JSON.stringify(catalog.store) + ';',
    'const GOVERNORATES = ' + JSON.stringify(catalog.governorates) + ';',
    'const CATEGORIES = ' + JSON.stringify(catalog.categories) + ';',
    'const PRODUCTS = ' + JSON.stringify(catalog.products) + ';',
    'const FAQS = ' + JSON.stringify(catalog.faqs) + ';'
  ].join('\n');
  return js.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + '\n';
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const normalized = rel.replace(/\\/g, '/');
  if (normalized === 'data' || normalized.startsWith('data/') || normalized === 'server.js') {
    return fail(res, 404, 'المسار غير موجود');
  }
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const full = path.resolve(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return fail(res, 403, 'طلب غير مسموح');

  let stat;
  try {
    stat = await fsp.stat(full);
  } catch (error) {
    return fail(res, 404, 'الصفحة غير موجودة');
  }
  if (!stat.isFile()) return fail(res, 404, 'الصفحة غير موجودة');

  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = /\.(jpg|jpeg|png|webp|woff2|svg)$/i.test(full) ? 'public, max-age=3600' : 'no-cache';

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.on('finish', () => {
    console.log(req.method + ' ' + req.url + ' -> ' + res.statusCode);
  });
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const pathname = url.pathname;

    if (pathname === '/js/data.js') {
      const catalog = await getCatalog();
      if (!catalog) return fail(res, 500, 'بيانات المتجر غير موجودة');
      const body = dataJs(catalog);
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(body);
    }

    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);

    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'الطريقة غير مسموحة');
    return await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) fail(res, status, error.message || 'حدث خطأ في الخادم');
    else res.end();
  }
});

ensureData().then(() => {
  server.listen(PORT, HOST, () => {
    console.log('المتجر يعمل على: http://localhost:' + PORT + '/index.html');
    console.log('لوحة التحكم على: http://localhost:' + PORT + '/admin.html');
    console.log('إذا كانت هذه أول مرة: كلمة السر الافتراضية Dstore@2026 — غيّرها من صفحة الإعدادات.');
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('المنفذ ' + PORT + ' مشغول. شغّل الخادم على منفذ آخر: set PORT=8141 && node server.js');
  } else {
    console.error(error);
  }
  process.exit(1);
});
