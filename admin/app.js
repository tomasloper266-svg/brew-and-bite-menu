'use strict';

/* =============================================================================
   برو أند بايت — لوحة التحكم (نسخة ثابتة بدون خادم)
   تعدّل menu-data.json وتنشر التغييرات كـ commit عبر GitHub Contents API.
   بدون سلة ولا طلبات ولا قاعدة بيانات.
   ============================================================================= */

/* ------------------------------- helpers ----------------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const fmtSYP = (n) => `${Number(n || 0).toLocaleString('en-US')} ل.س`;

/* icons (inline SVG, stroke = currentColor) */
const ICONS = {
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
};

/* ------------------------------ app state ---------------------------------- */

const TOKEN_KEY = 'bb_gh_token';
const state = {
  authed: false,
  data: null,
  dirty: false,
};

const getStoredToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setStoredToken = (tok) => {
  try { tok ? localStorage.setItem(TOKEN_KEY, tok) : localStorage.removeItem(TOKEN_KEY); } catch {}
};

/* مسار صورة من جهة اللوحة (الصور على جذر الموقع واللوحة في /admin/) */
function adminAsset(p) {
  const s = String(p || '');
  if (!s) return '';
  if (/^(https?:|data:)/.test(s)) return s;
  return s.startsWith('../') ? s : '../' + s;
}

function setData(dirty = true) {
  state.dirty = dirty;
  $('#save-bar').classList.toggle('hidden', !state.dirty);
}

async function loadData() {
  const res = await fetch('../menu-data.json?ts=' + Date.now());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  state.data = await res.json();
}

/* ------------------------------- sha256 ------------------------------------ */

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------- toast / confirm / modal ------------------- */

function toast(msg, type = 'success') {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

function confirmDialog({ title, text, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false }) {
  return new Promise((resolve) => {
    const root = $('#confirm-root');
    root.innerHTML = `
      <div class="confirm-overlay">
        <div class="confirm-card" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
          <h3>${esc(title)}</h3>
          <p>${esc(text)}</p>
          <div class="confirm-actions">
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(confirmLabel)}</button>
            <button type="button" class="btn btn-ghost" data-x="no">${esc(cancelLabel)}</button>
          </div>
        </div>
      </div>`;
    const done = (v) => { root.innerHTML = ''; resolve(v); };
    $('[data-x="yes"]', root).addEventListener('click', () => done(true));
    $('[data-x="no"]', root).addEventListener('click', () => done(false));
    $('.confirm-overlay', root).addEventListener('click', (e) => {
      if (e.target.classList.contains('confirm-overlay')) done(false);
    });
  });
}

function openModal({ title, body, foot, onClose }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button type="button" class="modal-close" aria-label="إغلاق">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  const overlay = $('.modal-overlay', root);
  const modalEl = $('.modal', root);
  let closing = false;
  const requestClose = async () => {
    if (closing) return;
    if (onClose && !(await onClose())) return;
    closing = true;
    root.innerHTML = '';
  };
  $('.modal-close', overlay).addEventListener('click', requestClose);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) requestClose(); });
  return { modalEl, requestClose };
}

/* ------------------------------ image field -------------------------------- */

/* رفع الصورة = commit ملف إلى img/ عبر GitHub API (بدون خادم) */
async function uploadImageToRepo(file) {
  const token = getStoredToken();
  if (!token) throw new Error('NO_TOKEN');
  const pub = state.data?.settings?.publish || {};
  if (!pub.repo) throw new Error('NO_REPO');
  const ext = (file.name.split('.').pop() || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = `bb-${Date.now()}.${ext || 'webp'}`;
  const path = `img/${name}`;
  const b64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const res = await fetch(`https://api.github.com/repos/${pub.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Owner panel: image upload', content: b64, branch: pub.branch || 'main' }),
  });
  if (!res.ok) throw new Error(`GITHUB ${res.status}`);
  const j = await res.json();
  return j.content?.path || path;
}

function wireImageField(box, initialUrl, onChange) {
  let val = initialUrl || '';
  let localData = ''; // معاينة محلية قبل الرفع
  box.innerHTML = `
    <div class="img-preview"></div>
    <div class="img-actions">
      <label class="btn btn-ghost btn-sm">رفع صورة
        <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none">
      </label>
      <button type="button" class="btn btn-ghost btn-sm img-url-btn">رابط صورة</button>
      <button type="button" class="btn btn-ghost btn-sm img-remove">إزالة الصورة</button>
    </div>
    <input type="text" class="img-url-field hidden" dir="ltr" placeholder="img/… أو https://…">`;
  const preview = $('.img-preview', box);
  const input = $('input[type="file"]', box);
  const urlField = $('.img-url-field', box);
  const paint = () => {
    preview.classList.remove('uploading');
    const shown = localData || (val ? adminAsset(val) : '');
    preview.innerHTML = shown
      ? `<img src="${esc(shown)}" alt="الصورة">`
      : `<div class="ph">${ICONS.image}<span>لا توجد صورة بعد</span></div>`;
  };
  paint();
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      toast('صيغة الملف غير مدعومة. المسموح: JPG أو PNG أو WEBP.', 'error'); input.value = ''; return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast('حجم الصورة كبير جداً. الحد الأقصى 5 ميغابايت.', 'error'); input.value = ''; return;
    }
    preview.classList.add('uploading');
    localData = await new Promise((resolve) => {
      const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(f);
    });
    paint();
    try {
      val = await uploadImageToRepo(f);
      localData = '';
      paint();
      toast('تم رفع الصورة إلى المستودع');
      onChange && onChange(val);
    } catch (err) {
      console.error('[admin] upload failed:', err);
      if (err.message === 'NO_TOKEN') toast('أضف توكِن GitHub من الإعدادات أولاً.', 'error');
      else toast('تعذر رفع الصورة. تأكد من التوكِن ثم أعد المحاولة.', 'error');
      localData = ''; val = ''; paint();
    } finally { input.value = ''; }
  });
  $('.img-url-btn', box).addEventListener('click', () => {
    urlField.classList.toggle('hidden');
    urlField.value = val;
  });
  urlField.addEventListener('change', () => {
    val = urlField.value.trim();
    localData = '';
    paint();
    onChange && onChange(val);
  });
  $('.img-remove', box).addEventListener('click', () => {
    val = ''; localData = ''; paint(); onChange && onChange('');
  });
  return { get: () => val };
}

/* ------------------------------ save (publish) ----------------------------- */

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function ghApi(path, opts = {}) {
  const token = getStoredToken();
  if (!token) { const e = new Error('NO_TOKEN'); e.code = 'NO_TOKEN'; throw e; }
  const res = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function publish() {
  const pub = state.data?.settings?.publish || {};
  if (!pub.repo) { toast('أدخل بيانات المستودع في الإعدادات أولاً.', 'error'); return; }
  const btn = $('#publish-btn');
  btn.disabled = true; btn.textContent = 'جارٍ النشر…';
  try {
    state.data.settings.updated_ts = Date.now();
    const json = JSON.stringify(state.data, null, 2);
    const branch = pub.branch || 'main';
    const filePath = pub.path || 'menu-data.json';
    let sha = null;
    const g = await ghApi(`/repos/${pub.repo}/contents/${filePath}?ref=${branch}`);
    if (g.ok) sha = (await g.json()).sha;
    const put = await ghApi(`/repos/${pub.repo}/contents/${filePath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Owner panel: menu update',
        content: b64encode(json),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!put.ok) {
      const j = await put.json().catch(() => ({}));
      if (put.status === 401 || put.status === 403) throw new Error('التوكِن غير صالح أو منتهي الصلاحية.');
      throw new Error(j.message || `GitHub HTTP ${put.status}`);
    }
    setData(false);
    toast('تم الحفظ والنشر — ستتحدث الصفحة خلال دقيقة تقريباً');
  } catch (err) {
    console.error('[admin] publish failed:', err);
    toast(err.message === 'NO_TOKEN' ? 'أضف توكِن GitHub من الإعدادات أولاً.' : (err.message || 'فشل النشر. أعد المحاولة.'), 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'حفظ ونشر';
  }
}

/* ------------------------------ unsaved guard ------------------------------ */

let suppressNavGuard = false;
let lastHash = '#/menu';

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* ------------------------------ router ------------------------------------- */

const ROUTES = { menu: viewMenu, categories: viewCategories, home: viewHome, settings: viewSettings };
const ROUTE_TITLES = { menu: 'المينيو', categories: 'الأقسام', home: 'الرئيسية', settings: 'الإعدادات' };
let renderedRoute = null;

function currentRouteName() {
  const name = location.hash.replace(/^#\/?/, '');
  return ROUTES[name] ? name : 'menu';
}

function renderRoute(force) {
  if (!state.authed) { showLogin(); return; }
  const name = currentRouteName();
  if (!force && name === renderedRoute) return;
  renderedRoute = name;
  $$('#main-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  document.title = `${ROUTE_TITLES[name]} — برو أند بايت`;
  ROUTES[name]();
}

function enterApp() {
  $('#login-view').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (!location.hash) location.hash = '#/menu';
  lastHash = location.hash || '#/menu';
  renderedRoute = null;
  renderRoute(true);
}

function showLogin(message) {
  $('#app').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
  renderedRoute = null;
  const errBox = $('#login-error');
  if (message) { errBox.textContent = message; errBox.classList.remove('hidden'); }
  else errBox.classList.add('hidden');
}

function viewError(err, retryFn) {
  const v = $('#view');
  v.innerHTML = `
    <div class="error-banner">
      <span>${esc(err?.message || 'حدث خطأ غير متوقع.')}</span>
      <button type="button" id="retry-btn">إعادة المحاولة</button>
    </div>`;
  $('#retry-btn').addEventListener('click', retryFn);
}

const spinnerHtml = `<div class="spinner-wrap"><div class="spinner"></div><span>جارٍ التحميل…</span></div>`;

/* =============================== المينيو ==================================== */

function cats() {
  return Object.entries(state.data.menu).map(([key, v]) => ({ key, ...v }));
}

function itemsOf(catKey) {
  return state.data.menu[catKey]?.items || [];
}

function viewMenu() {
  if (!cats().length) {
    $('#view').innerHTML = `
      <div class="page-head"><h2>المينيو</h2></div>
      <div class="empty-state">
        <div class="big">🍽️</div>
        <p>لا توجد أقسام بعد.<br>أضف قسماً أولاً ثم أضف المنتجات إليه.</p>
        <a class="btn btn-primary" href="#/categories">إدارة الأقسام</a>
      </div>`;
    return;
  }
  const v = $('#view');
  const total = cats().reduce((n, c) => n + itemsOf(c.key).length, 0);
  v.innerHTML = `
    <div class="page-head">
      <h2>المينيو</h2>
      <span class="page-sub">عدد المنتجات: ${total}</span>
    </div>
    ${cats().map((cat) => {
      const items = itemsOf(cat.key);
      return `
      <section class="menu-cat">
        <div class="menu-cat-head">
          <h3>${cat.icon ? esc(cat.icon) + ' ' : ''}${esc(cat.label || cat.label_en || cat.key)}</h3>
          <span class="badge-mini">${items.length} منتج</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost btn-sm" data-act="add-item" data-cat="${esc(cat.key)}">+ إضافة منتج</button>
        </div>
        ${items.length
          ? items.map((it, idx) => itemRowHtml(cat.key, it, idx, items.length)).join('')
          : `<div class="empty-state"><p>لا توجد منتجات في هذا القسم بعد.</p>
             <button type="button" class="btn btn-ghost btn-sm" data-act="add-item" data-cat="${esc(cat.key)}">+ إضافة أول منتج</button></div>`}
      </section>`;
    }).join('')}`;
}

function itemRowHtml(catKey, it, idx, len) {
  const badges = [
    it.hidden ? '<span class="badge-mini warn">مخفي</span>' : '',
    it.offer ? '<span class="badge-mini hot">عرض اليوم</span>' : '',
    it.popular ? '<span class="badge-mini hot">الأكثر طلباً</span>' : '',
  ].join('');
  const src = it.image || (state.data.images || {})[it.key] || '';
  return `
    <div class="item-row">
      <div class="item-thumb">${src ? `<img src="${esc(adminAsset(src))}" alt="">` : ICONS.image}</div>
      <div class="item-info">
        <div class="item-name">${esc(it.name || it.name_en)} ${badges}</div>
        ${it.name_en ? `<div class="item-name-en">${esc(it.name_en)}</div>` : ''}
        <div class="item-price">${fmtSYP(it.price)}</div>
      </div>
      <div class="item-actions">
        <div class="row">
          <button type="button" class="btn-icon" data-act="move-item" data-cat="${esc(catKey)}" data-key="${esc(it.key)}" data-dir="up" title="نقل لأعلى" ${idx === 0 ? 'disabled' : ''}>${ICONS.up}</button>
          <button type="button" class="btn-icon" data-act="move-item" data-cat="${esc(catKey)}" data-key="${esc(it.key)}" data-dir="down" title="نقل لأسفل" ${idx === len - 1 ? 'disabled' : ''}>${ICONS.down}</button>
        </div>
        <div class="row">
          <button type="button" class="btn-icon" data-act="edit-item" data-cat="${esc(catKey)}" data-key="${esc(it.key)}" title="تعديل" aria-label="تعديل">${ICONS.edit}</button>
          <button type="button" class="btn-icon danger" data-act="del-item" data-cat="${esc(catKey)}" data-key="${esc(it.key)}" title="حذف" aria-label="حذف">${ICONS.trash}</button>
        </div>
      </div>
    </div>`;
}

function openItemModal(catKey, itemKey) {
  const isNew = !itemKey;
  const list = itemsOf(catKey);
  const item = isNew
    ? { key: `item_${Date.now()}`, name: '', name_en: '', desc: '', desc_en: '', price: '', offer: false, popular: false, hidden: false }
    : list.find((i) => i.key === itemKey);
  if (!item) return;

  const catOptions = cats()
    .map((c) => `<option value="${esc(c.key)}" ${c.key === catKey ? 'selected' : ''}>${esc(c.label || c.label_en || c.key)}</option>`)
    .join('');

  const switchHtml = (id, label, checked) => `
    <label class="switch"><span>${esc(label)}</span>
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="track"></span>
    </label>`;

  const num = (v) => (v === 0 || v) ? v : '';
  const body = `
    <form id="item-form" novalidate>
      <label class="field"><span class="field-label">الاسم بالعربية</span>
        <input type="text" id="f-name-ar" value="${esc(item.name)}" maxlength="200"></label>
      <label class="field"><span class="field-label">الاسم بالإنكليزية</span>
        <input type="text" id="f-name-en" dir="ltr" value="${esc(item.name_en)}" maxlength="200"></label>
      <label class="field"><span class="field-label">السعر (ل.س)</span>
        <input type="number" id="f-price" min="0" step="1" inputmode="numeric" value="${esc(item.price)}"></label>
      <label class="field"><span class="field-label">القسم</span>
        <select id="f-cat">${catOptions}</select></label>
      <label class="field"><span class="field-label">الوصف بالعربية</span>
        <textarea id="f-desc-ar" maxlength="1000">${esc(item.desc)}</textarea></label>
      <label class="field"><span class="field-label">الوصف بالإنكليزية</span>
        <textarea id="f-desc-en" dir="ltr" maxlength="1000">${esc(item.desc_en)}</textarea></label>
      <div class="field"><span class="field-label">القيم الغذائية (اختيارية)</span>
        <div class="form-row">
          <input type="number" id="f-cal" min="0" placeholder="سعرات cal" value="${esc(num(item.cal))}">
          <input type="number" id="f-protein" min="0" placeholder="بروتين g" value="${esc(num(item.protein))}">
          <input type="number" id="f-carb" min="0" placeholder="كارب g" value="${esc(num(item.carb))}">
          <input type="number" id="f-fat" min="0" placeholder="دهون g" value="${esc(num(item.fat))}">
        </div></div>
      <div class="field"><span class="field-label">صورة المنتج</span>
        <div class="img-box" id="f-img"></div></div>
      <div class="field"><span class="field-label">خيارات العرض</span>
        <div class="switch-grid">
          ${switchHtml('f-offer', 'عرض اليوم', item.offer)}
          ${switchHtml('f-popular', 'الأكثر طلباً', item.popular)}
          ${switchHtml('f-hidden', 'مخفي', item.hidden)}
        </div></div>
      <p class="form-error hidden" id="f-error"></p>
    </form>`;

  const foot = `
    ${!isNew ? `<button type="button" class="btn btn-danger" id="f-delete">حذف المنتج</button>` : ''}
    <button type="button" class="btn btn-ghost" id="f-cancel">إلغاء</button>
    <button type="button" class="btn btn-primary" id="f-save">حفظ</button>`;

  let dirty = false;
  const modal = openModal({
    title: isNew ? 'منتج جديد' : `تعديل: ${item.name || item.name_en}`,
    body, foot,
    onClose: async () => {
      if (!dirty) return true;
      return confirmDialog({
        title: 'تغييرات غير محفوظة',
        text: 'هناك تعديلات على المنتج لم تُحفظ بعد. هل تريد الإغلاق دون حفظ؟',
        confirmLabel: 'إغلاق دون حفظ', cancelLabel: 'متابعة التعديل', danger: true,
      });
    },
  });

  const img = wireImageField($('#f-img', modal.modalEl), item.image || (state.data.images || {})[item.key], () => { dirty = true; });
  const form = $('#item-form', modal.modalEl);
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });

  $('#f-cancel', modal.modalEl).addEventListener('click', () => modal.requestClose());
  $('#f-save', modal.modalEl).addEventListener('click', () => {
    const errBox = $('#f-error');
    const showErr = (m) => { errBox.textContent = m; errBox.classList.remove('hidden'); };
    errBox.classList.add('hidden');

    const nameAr = $('#f-name-ar').value.trim();
    const nameEn = $('#f-name-en').value.trim();
    const priceRaw = $('#f-price').value.trim();
    const price = Number(priceRaw);

    if (!nameAr && !nameEn) return showErr('أدخل اسم المنتج بالعربية أو بالإنكليزية على الأقل.');
    if (priceRaw === '' || !Number.isInteger(price) || price < 0) return showErr('أدخل سعراً صحيحاً بالليرة السورية (رقم بدون كسور).');

    const targetCat = $('#f-cat').value;
    const intOrUndef = (id) => { const v = $(id).value.trim(); return v === '' ? undefined : Number(v); };

    const payload = {
      key: item.key,
      name: nameAr, name_en: nameEn,
      desc: $('#f-desc-ar').value.trim(),
      desc_en: $('#f-desc-en').value.trim(),
      price,
      cal: intOrUndef('#f-cal'), protein: intOrUndef('#f-protein'),
      carb: intOrUndef('#f-carb'), fat: intOrUndef('#f-fat'),
      offer: $('#f-offer').checked,
      popular: $('#f-popular').checked,
      hidden: $('#f-hidden').checked,
    };
    const imgVal = img.get();
    if (imgVal) payload.image = imgVal;

    // إزالة من القسم القديم وإضافة للقسم الجديد
    const oldList = itemsOf(catKey);
    const oldIdx = oldList.findIndex((i) => i.key === item.key);
    if (oldIdx >= 0) oldList.splice(oldIdx, 1);
    state.data.menu[targetCat].items.push(payload);

    dirty = false;
    setData();
    toast(isNew ? 'تمت إضافة المنتج — اضغط «حفظ ونشر» لتثبيته' : 'تم حفظ المنتج محلياً — اضغط «حفظ ونشر»');
    modal.requestClose();
    viewMenu();
  });
  const delBtn = $('#f-delete', modal.modalEl);
  if (delBtn) delBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'حذف المنتج',
      text: `سيتم حذف «${item.name || item.name_en}» نهائياً من المينيو.`,
      confirmLabel: 'حذف', danger: true,
    });
    if (!ok) return;
    const list2 = itemsOf(catKey);
    const idx = list2.findIndex((i) => i.key === item.key);
    if (idx >= 0) list2.splice(idx, 1);
    dirty = false;
    setData();
    toast('تم حذف المنتج محلياً — اضغط «حفظ ونشر»');
    modal.requestClose();
    viewMenu();
  });
}

function moveItem(catKey, itemKey, dir) {
  const list = itemsOf(catKey);
  const idx = list.findIndex((i) => i.key === itemKey);
  const to = idx + (dir === 'up' ? -1 : 1);
  if (idx < 0 || to < 0 || to >= list.length) return;
  [list[idx], list[to]] = [list[to], list[idx]];
  setData();
  viewMenu();
}

/* =============================== الأقسام ==================================== */

function viewCategories() {
  const v = $('#view');
  const list = cats();
  v.innerHTML = `
    <div class="page-head">
      <div><h2>الأقسام</h2><p class="page-sub">تظهر الأقسام في صفحة الزباء بنفس هذا الترتيب</p></div>
      <button type="button" class="btn btn-primary" data-act="add-cat">+ إضافة قسم</button>
    </div>
    ${list.length ? list.map((c, idx) => `
      <div class="item-row">
        <div class="item-thumb" style="font-size:26px">${c.icon ? esc(c.icon) : ICONS.image}</div>
        <div class="item-info">
          <div class="item-name">${esc(c.label || c.label_en || c.key)}</div>
          ${c.label_en ? `<div class="item-name-en">${esc(c.label_en)}</div>` : ''}
          <div class="item-badges"><span class="badge-mini">${(c.items || []).length} منتج</span></div>
        </div>
        <div class="item-actions">
          <div class="row">
            <button type="button" class="btn-icon" data-act="move-cat" data-key="${esc(c.key)}" data-dir="up" title="نقل لأعلى" ${idx === 0 ? 'disabled' : ''}>${ICONS.up}</button>
            <button type="button" class="btn-icon" data-act="move-cat" data-key="${esc(c.key)}" data-dir="down" title="نقل لأسفل" ${idx === list.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
          </div>
          <div class="row">
            <button type="button" class="btn-icon" data-act="edit-cat" data-key="${esc(c.key)}" title="تعديل" aria-label="تعديل">${ICONS.edit}</button>
            <button type="button" class="btn-icon danger" data-act="del-cat" data-key="${esc(c.key)}" title="حذف" aria-label="حذف">${ICONS.trash}</button>
          </div>
        </div>
      </div>`).join('')
      : `<div class="empty-state"><div class="big">🗂️</div><p>لا توجد أقسام بعد.</p></div>`}`;
}

function openCategoryModal(catKey) {
  const isNew = !catKey;
  const cat = isNew
    ? { key: '', label: '', label_en: '', icon: '' }
    : state.data.menu[catKey];
  if (!cat) return;

  const body = `
    <form id="cat-form" novalidate>
      <label class="field"><span class="field-label">اسم القسم بالعربية</span>
        <input type="text" id="c-name-ar" value="${esc(cat.label)}" maxlength="120"></label>
      <label class="field"><span class="field-label">اسم القسم بالإنكليزية</span>
        <input type="text" id="c-name-en" dir="ltr" value="${esc(cat.label_en)}" maxlength="120"></label>
      <label class="field"><span class="field-label">أيقونة القسم (رمز تعبيري اختياري)</span>
        <input type="text" id="c-icon" value="${esc(cat.icon || '')}" maxlength="8" placeholder="☕"></label>
      <p class="form-error hidden" id="c-error"></p>
    </form>`;

  const foot = `
    <button type="button" class="btn btn-ghost" id="c-cancel">إلغاء</button>
    <button type="button" class="btn btn-primary" id="c-save">حفظ</button>`;

  const modal = openModal({
    title: isNew ? 'قسم جديد' : `تعديل القسم: ${cat.label || cat.label_en || catKey}`,
    body, foot,
  });

  $('#c-cancel', modal.modalEl).addEventListener('click', () => modal.requestClose());
  $('#c-save', modal.modalEl).addEventListener('click', () => {
    const errBox = $('#c-error');
    const showErr = (m) => { errBox.textContent = m; errBox.classList.remove('hidden'); };
    errBox.classList.add('hidden');
    const labelAr = $('#c-name-ar').value.trim();
    const labelEn = $('#c-name-en').value.trim();
    if (!labelAr && !labelEn) return showErr('أدخل اسم القسم بالعربية أو بالإنكليزية على الأقل.');

    if (isNew) {
      const base = (labelEn || labelAr).toLowerCase().replace(/[^a-z0-9]+/g, '-') || `cat_${Date.now()}`;
      let key = base;
      let n = 2;
      while (state.data.menu[key]) key = `${base}-${n++}`;
      state.data.menu[key] = { label: labelAr, label_en: labelEn, icon: $('#c-icon').value.trim(), items: [] };
      // إبقاء ترتيب المفاتيح: Object.entries يحافظ على الإضافة بالآخر
    } else {
      cat.label = labelAr;
      cat.label_en = labelEn;
      cat.icon = $('#c-icon').value.trim();
    }
    setData();
    toast('تم حفظ القسم محلياً — اضغط «حفظ ونشر»');
    modal.requestClose();
    viewCategories();
  });
}

function moveCat(catKey, dir) {
  const entries = Object.entries(state.data.menu);
  const idx = entries.findIndex(([k]) => k === catKey);
  const to = idx + (dir === 'up' ? -1 : 1);
  if (idx < 0 || to < 0 || to >= entries.length) return;
  [entries[idx], entries[to]] = [entries[to], entries[idx]];
  state.data.menu = Object.fromEntries(entries);
  setData();
  viewCategories();
}

async function deleteCat(catKey) {
  const cat = state.data.menu[catKey];
  if (!cat) return;
  const n = (cat.items || []).length;
  const ok = await confirmDialog({
    title: 'حذف القسم',
    text: n
      ? `سيتم حذف القسم «${cat.label || cat.label_en || catKey}» مع ${n} منتج داخله نهائياً.`
      : `سيتم حذف القسم «${cat.label || cat.label_en || catKey}» نهائياً.`,
    confirmLabel: 'حذف', danger: true,
  });
  if (!ok) return;
  delete state.data.menu[catKey];
  setData();
  toast('تم حذف القسم محلياً — اضغط «حفظ ونشر»');
  viewCategories();
}

/* =============================== الرئيسية ==================================== */

function fieldRow(id, label, value, attrs = '') {
  return `<label class="field"><span class="field-label">${esc(label)}</span>
    <input type="text" id="${id}" value="${esc(value ?? '')}" ${attrs}></label>`;
}

function viewHome() {
  const v = $('#view');
  const s = state.data.settings;
  const r = s.restaurant || {};
  const c = s.contact || {};
  const h = s.hours || {};
  v.innerHTML = `
    <div class="page-head"><h2>الرئيسية</h2><span class="page-sub">بيانات المطعم كما تظهر للزباء</span></div>
    <div class="card form-card">
      <h3>هوية المطعم</h3>
      <div class="form-row">
        ${fieldRow('h-name-ar', 'الاسم بالعربية', r.name_ar)}
        ${fieldRow('h-name-en', 'الاسم بالإنكليزية', r.name_en, 'dir="ltr"')}
      </div>
      <div class="form-row">
        ${fieldRow('h-tagline-ar', 'الشعار الفرعي بالعربية', r.tagline_ar)}
        ${fieldRow('h-tagline-en', 'الشعار الفرعي بالإنكليزية', r.tagline_en, 'dir="ltr"')}
      </div>
      <label class="field"><span class="field-label">الوصف بالعربية</span>
        <textarea id="h-desc-ar" maxlength="500">${esc(r.desc_ar)}</textarea></label>
      <label class="field"><span class="field-label">الوصف بالإنكليزية</span>
        <textarea id="h-desc-en" dir="ltr" maxlength="500">${esc(r.desc_en)}</textarea></label>
      <div class="form-row">
        ${fieldRow('h-loc-ar', 'الموقع بالعربية', r.location_ar)}
        ${fieldRow('h-loc-en', 'الموقع بالإنكليزية', r.location_en, 'dir="ltr"')}
      </div>
    </div>
    <div class="card form-card">
      <h3>التواصل وساعات العمل</h3>
      <div class="form-row">
        ${fieldRow('h-phone', 'رقم الهاتف', c.phone, 'dir="ltr" inputmode="tel"')}
        ${fieldRow('h-instagram', 'رابط إنستغرام (اختياري)', c.instagram, 'dir="ltr"')}
      </div>
      <div class="form-row">
        ${fieldRow('h-open-am', 'وقت الفتح', h.open_morning)}
        ${fieldRow('h-close-pm', 'وقت الإغلاق', h.close_evening)}
      </div>
      <label class="field"><span class="field-label">تنبيه أعلى الصفحة (اختياري)</span>
        <textarea id="h-note" maxlength="300">${esc(s.note)}</textarea></label>
      <label class="field"><span class="field-label">تنبيه بالإنكليزية (اختياري)</span>
        <textarea id="h-note-en" dir="ltr" maxlength="300">${esc(s.note_en)}</textarea></label>
    </div>
    <div class="card form-card">
      <h3>الأسعار والعملة</h3>
      <div class="form-row">
        <label class="field"><span class="field-label">سعر الصرف (ل.س مقابل 1$)</span>
          <input type="number" id="h-rate" min="1" step="1" inputmode="numeric" value="${esc(s.exchange_rate_syp_per_usd)}"></label>
        <label class="field"><span class="field-label">العملة الافتراضية</span>
          <select id="h-cur">
            <option value="syp" ${s.default_currency !== 'usd' ? 'selected' : ''}>ليرة سورية (ل.س)</option>
            <option value="usd" ${s.default_currency === 'usd' ? 'selected' : ''}>دولار ($)</option>
          </select></label>
      </div>
    </div>`;

  const bind = (id, fn) => {
    $(id).addEventListener('input', () => { fn($(id).value); setData(); });
    $(id).addEventListener('change', () => { fn($(id).value); setData(); });
  };
  s.restaurant = s.restaurant || {};
  bind('#h-name-ar', (val) => { s.restaurant.name_ar = val.trim(); });
  bind('#h-name-en', (val) => { s.restaurant.name_en = val.trim(); });
  bind('#h-tagline-ar', (val) => { s.restaurant.tagline_ar = val.trim(); });
  bind('#h-tagline-en', (val) => { s.restaurant.tagline_en = val.trim(); });
  bind('#h-desc-ar', (val) => { s.restaurant.desc_ar = val.trim(); });
  bind('#h-desc-en', (val) => { s.restaurant.desc_en = val.trim(); });
  bind('#h-loc-ar', (val) => { s.restaurant.location_ar = val.trim(); });
  bind('#h-loc-en', (val) => { s.restaurant.location_en = val.trim(); });
  bind('#h-phone', (val) => { s.contact = s.contact || {}; s.contact.phone = val.trim(); });
  bind('#h-instagram', (val) => { s.contact = s.contact || {}; s.contact.instagram = val.trim(); });
  bind('#h-open-am', (val) => { s.hours = s.hours || {}; s.hours.open_morning = val.trim(); });
  bind('#h-close-pm', (val) => { s.hours = s.hours || {}; s.hours.close_evening = val.trim(); });
  bind('#h-note', (val) => { s.note = val.trim(); });
  bind('#h-note-en', (val) => { s.note_en = val.trim(); });
  bind('#h-rate', (val) => { const n = Number(val); if (Number.isInteger(n) && n > 0) s.exchange_rate_syp_per_usd = n; });
  bind('#h-cur', (val) => { s.default_currency = val; });
}

/* =============================== الإعدادات ================================== */

function viewSettings() {
  const v = $('#view');
  const s = state.data.settings;
  const pub = s.publish || {};
  const hasToken = !!getStoredToken();
  v.innerHTML = `
    <div class="page-head"><h2>الإعدادات</h2></div>

    <div class="card form-card">
      <h3>توكِن النشر (GitHub)</h3>
      <p class="page-sub" style="margin-bottom:12px">التوكِن يُستخدم لحفظ التعديلات كـ commit في مستودع موقعك، ويُخزَّن في هذا المتصفح فقط.</p>
      <label class="field"><span class="field-label">التوكِن</span>
        <span class="pw-box">
          <input type="password" id="s-token" dir="ltr" placeholder="${hasToken ? '•••••••• (محفوظ)' : 'ghp_…'}" autocomplete="off">
          <button type="button" class="pw-toggle" id="s-token-toggle">إظهار</button>
        </span></label>
      <div class="oc-actions">
        <button type="button" class="btn btn-primary" id="s-token-save" style="flex:1">حفظ التوكِن</button>
        <button type="button" class="btn btn-ghost" id="s-token-verify" style="flex:1">التحقق</button>
        ${hasToken ? '<button type="button" class="btn btn-danger" id="s-token-remove" style="flex:1">إزالة</button>' : ''}
      </div>
      <p class="page-sub" id="s-token-status" style="margin-top:10px">${hasToken ? '✅ يوجد توكِن محفوظ في هذا المتصفح' : '⚠️ لا يوجد توكِن — الحفظ والنشر معطّل حتى إضافته'}</p>
    </div>

    <div class="card form-card">
      <h3>بيانات النشر</h3>
      <div class="form-row">
        <label class="field"><span class="field-label">المستودع (owner/repo)</span>
          <input type="text" id="s-repo" dir="ltr" value="${esc(pub.repo)}"></label>
        <label class="field"><span class="field-label">الفرع</span>
          <input type="text" id="s-branch" dir="ltr" value="${esc(pub.branch || 'main')}"></label>
      </div>
      <label class="field"><span class="field-label">مسار ملف البيانات</span>
        <input type="text" id="s-path" dir="ltr" value="${esc(pub.path || 'menu-data.json')}"></label>
    </div>

    <div class="card form-card">
      <h3>تغيير كلمة المرور</h3>
      <label class="field"><span class="field-label">كلمة المرور الحالية</span>
        <input type="password" id="s-pw-cur" autocomplete="current-password"></label>
      <div class="form-row">
        <label class="field"><span class="field-label">كلمة المرور الجديدة</span>
          <input type="password" id="s-pw-new" autocomplete="new-password"></label>
        <label class="field"><span class="field-label">تأكيد كلمة المرور</span>
          <input type="password" id="s-pw-confirm" autocomplete="new-password"></label>
      </div>
      <button type="button" class="btn btn-primary" id="s-pw-save">تحديث كلمة المرور</button>
      <p class="page-sub" style="margin-top:8px">يُطبَّق التغيير عند الضغط على «حفظ ونشر».</p>
    </div>

    <div class="card form-card">
      <h3>نسخة احتياطية</h3>
      <div class="oc-actions">
        <button type="button" class="btn btn-ghost" id="s-export" style="flex:1">تنزيل نسخة JSON</button>
        <label class="btn btn-ghost" style="flex:1">استيراد نسخة
          <input type="file" id="s-import" accept="application/json" style="display:none">
        </label>
      </div>
    </div>`;

  const tokenInput = $('#s-token');
  $('#s-token-toggle').addEventListener('click', () => {
    tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    $('#s-token-toggle').textContent = tokenInput.type === 'password' ? 'إظهار' : 'إخفاء';
  });
  $('#s-token-save').addEventListener('click', () => {
    const val = tokenInput.value.trim();
    if (!val) { toast('الصق التوكِن أولاً.', 'error'); return; }
    setStoredToken(val);
    toast('تم حفظ التوكِن في هذا المتصفح');
    viewSettings();
  });
  $('#s-token-verify').addEventListener('click', async () => {
    const val = tokenInput.value.trim() || getStoredToken();
    if (!val) { toast('لا يوجد توكِن للتحقق.', 'error'); return; }
    const status = $('#s-token-status');
    status.textContent = 'جارٍ التحقق…';
    try {
      const res = await fetch(`https://api.github.com/repos/${($('#s-repo').value.trim() || pub.repo)}`, {
        headers: { Authorization: `Bearer ${val}`, Accept: 'application/vnd.github+json' },
      });
      status.textContent = res.ok ? '✅ التوكِن صالح ويملك صلاحية على المستودع' : `❌ التحقق فشل (HTTP ${res.status}) — تأكد من التوكِن وصلاحياته`;
      status.style.color = res.ok ? 'var(--green)' : 'var(--red)';
    } catch {
      status.textContent = '❌ تعذر الاتصال بـ GitHub — تحقق من الشبكة';
      status.style.color = 'var(--red)';
    }
  });
  const rm = $('#s-token-remove');
  if (rm) rm.addEventListener('click', () => {
    setStoredToken('');
    toast('تمت إزالة التوكِن من هذا المتصفح');
    viewSettings();
  });

  $('#s-repo').addEventListener('change', () => { s.publish = s.publish || {}; s.publish.repo = $('#s-repo').value.trim(); setData(); });
  $('#s-branch').addEventListener('change', () => { s.publish = s.publish || {}; s.publish.branch = $('#s-branch').value.trim() || 'main'; setData(); });
  $('#s-path').addEventListener('change', () => { s.publish = s.publish || {}; s.publish.path = $('#s-path').value.trim() || 'menu-data.json'; setData(); });

  $('#s-pw-save').addEventListener('click', async () => {
    const cur = $('#s-pw-cur').value;
    const nw = $('#s-pw-new').value;
    const cf = $('#s-pw-confirm').value;
    const curHash = await sha256(cur);
    if (curHash !== s.admin.password_sha256) { toast('كلمة المرور الحالية غير صحيحة.', 'error'); return; }
    if (nw.length < 6) { toast('كلمة المرور الجديدة قصيرة جداً (6 أحرف على الأقل).', 'error'); return; }
    if (nw !== cf) { toast('تأكيد كلمة المرور غير مطابق.', 'error'); return; }
    s.admin.password_sha256 = await sha256(nw);
    setData();
    $('#s-pw-cur').value = ''; $('#s-pw-new').value = ''; $('#s-pw-confirm').value = '';
    toast('تم تحديث كلمة المرور محلياً — اضغط «حفظ ونشر» لتثبيتها');
  });

  $('#s-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'menu-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#s-import').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!parsed.menu) throw new Error('bad');
      const ok = await confirmDialog({
        title: 'استيراد نسخة',
        text: 'سيتم استبدال البيانات الحالية (غير المنشورة) بمحتوى الملف. متابعة؟',
        confirmLabel: 'استيراد', danger: true,
      });
      if (!ok) return;
      state.data = parsed;
      setData();
      toast('تم الاستيراد — اضغط «حفظ ونشر» لتثبيته');
      renderRoute(true);
    } catch {
      toast('الملف غير صالح.', 'error');
    }
  });
}

/* =============================== auth ======================================= */

async function tryLogin(username, password) {
  const admin = state.data?.settings?.admin || {};
  const okUser = username.trim().toLowerCase() === String(admin.username || 'admin').toLowerCase();
  const okPass = await sha256(password) === admin.password_sha256;
  return okUser && okPass;
}

function wireAuth() {
  $('#pw-toggle').addEventListener('click', () => {
    const inp = $('#login-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    $('#pw-toggle').textContent = inp.type === 'password' ? 'إظهار' : 'إخفاء';
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-submit');
    btn.disabled = true; btn.textContent = 'جارٍ التحقق…';
    try {
      const ok = await tryLogin($('#login-username').value, $('#login-password').value);
      if (ok) {
        state.authed = true;
        try { sessionStorage.setItem('bb_auth', '1'); } catch {}
        enterApp();
      } else {
        showLogin('اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
    } catch (err) {
      console.error('[admin] login failed:', err);
      showLogin('تعذر تسجيل الدخول. أعد المحاولة.');
    } finally {
      btn.disabled = false; btn.textContent = 'تسجيل الدخول';
    }
  });

  $('#logout-btn').addEventListener('click', () => {
    state.authed = false;
    try { sessionStorage.removeItem('bb_auth'); } catch {}
    location.hash = '';
    showLogin();
  });
}

function wireApp() {
  $('#publish-btn').addEventListener('click', publish);
  $('#discard-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'استعادة التغييرات',
      text: 'سيتم تجاهل كل التعديلات غير المنشورة والعودة لآخر نسخة منشورة.',
      confirmLabel: 'استعادة', danger: true,
    });
    if (!ok) return;
    await loadData();
    setData(false);
    toast('تمت استعادة آخر نسخة منشورة');
    renderRoute(true);
  });

  window.addEventListener('hashchange', async () => {
    if (suppressNavGuard) { suppressNavGuard = false; renderRoute(); return; }
    if (state.dirty) {
      const ok = await confirmDialog({
        title: 'تغييرات غير محفوظة',
        text: 'لديك تعديلات لم تُنشر بعد. هل تريد المغادرة دون حفظ؟',
        confirmLabel: 'مغادرة دون حفظ', cancelLabel: 'متابعة التعديل', danger: true,
      });
      if (!ok) { suppressNavGuard = true; location.hash = lastHash; return; }
      await loadData();
      setData(false);
    }
    lastHash = location.hash;
    renderRoute();
  });

  $('#view').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const cat = btn.dataset.cat;
    const key = btn.dataset.key;
    const dir = btn.dataset.dir;
    if (act === 'add-item') openItemModal(cat, null);
    else if (act === 'edit-item') openItemModal(cat, key);
    else if (act === 'move-item') moveItem(cat, key, dir);
    else if (act === 'del-item') {
      const list = itemsOf(cat);
      const item = list.find((i) => i.key === key);
      if (item) openItemModal(cat, key); // الحذف من داخل نافذة التعديل (زر حذف المنتج)
    }
    else if (act === 'add-cat') openCategoryModal(null);
    else if (act === 'edit-cat') openCategoryModal(key);
    else if (act === 'move-cat') moveCat(key, dir);
    else if (act === 'del-cat') deleteCat(key);
  });
}

/* =============================== boot ======================================= */

(async function boot() {
  wireAuth();
  try {
    await loadData();
  } catch (err) {
    console.error('[admin] data load failed:', err);
    showLogin('تعذر تحميل بيانات المينيو. تحقق من الاتصال ثم أعد المحاولة.');
    $('#login-form').style.display = 'none';
    return;
  }

  // جلسة سابقة في نفس التبويب؟
  let hadSession = false;
  try { hadSession = sessionStorage.getItem('bb_auth') === '1'; } catch {}
  if (hadSession) {
    state.authed = true;
    enterApp();
  } else {
    showLogin();
  }

  wireApp();
})();
