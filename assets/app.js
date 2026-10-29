'use strict';

/* Brew & Bite — مينيو إلكتروني (قراءة menu-data.json فقط، بدون سلة ولا طلبات) */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const I18N = {
  ar: {
    search: 'ابحث داخل المنتجات', all: 'الكل', title: 'كل المنتجات',
    subAll: 'كل المنتجات المتاحة حالياً.', subCat: 'أصناف قسم',
    sortTitle: 'الترتيب', catsTitle: 'الأقسام', sidebarTitle: 'الأقسام',
    newest: 'الأحدث', oldest: 'الأقدم', priceAsc: 'من الأقل سعراً',
    priceDesc: 'من الأعلى سعراً', onlyOffers: 'العروض المميزة',
    details: 'عرض التفاصيل', close: 'إغلاق', home: 'الرئيسية',
    menu: 'المنيو', panel: 'لوحة التحكم', sypShort: 'ل.س',
    empty: 'لا توجد منتجات مطابقة.', offerBadge: 'عرض اليوم',
    popularBadge: 'الأكثر طلباً', contact: 'تواصل', hoursTitle: 'ساعات العمل',
    links: 'روابط', hoursText: 'يومياً من', until: 'حتى', footNote: 'مينيو إلكتروني',
    results: 'نتيجة', catLabel: 'القسم',
    explore: 'استعرض المنيو', popular: 'الأقسام الشائعة',
    call: 'اتصل بنا', whatsapp: 'واتساب'
  },
  en: {
    search: 'Search products', all: 'All', title: 'All Products',
    subAll: 'Everything currently available.', subCat: 'Items in',
    sortTitle: 'Sort', catsTitle: 'Categories', sidebarTitle: 'Categories',
    newest: 'Newest', oldest: 'Oldest', priceAsc: 'Price: Low to High',
    priceDesc: 'Price: High to Low', onlyOffers: 'Special Offers',
    details: 'View Details', close: 'Close', home: 'Home',
    menu: 'Menu', panel: 'Dashboard', sypShort: 'SYP',
    empty: 'No matching products.', offerBadge: "Today's Offer",
    popularBadge: 'Most Popular', contact: 'Contact', hoursTitle: 'Working Hours',
    links: 'Links', hoursText: 'Daily from', until: 'until', footNote: 'Digital menu',
    results: 'results', catLabel: 'Category',
    explore: 'Explore Menu', popular: 'Popular Categories',
    call: 'Call Us', whatsapp: 'WhatsApp'
  }
};

const SORTS = [
  { id: 'newest', icon: '', label: 'newest' },
  { id: 'oldest', icon: '', label: 'oldest' },
  { id: 'price_asc', icon: '', label: 'priceAsc' },
  { id: 'price_desc', icon: '', label: 'priceDesc' },
  { id: 'offers', icon: 'bx bx-purchase-tag', label: 'onlyOffers' },
];

const state = {
  data: null, cats: [], items: [],
  activeCat: null, sort: 'newest', q: '',
  lang: 'ar', cur: 'syp', view: 'home',
};

/* ------------------------------- helpers ---------------------------------- */

function t(key) { return I18N[state.lang][key]; }

function pick(item, field) {
  if (state.lang === 'en') return item[field + '_en'] || item[field] || '';
  return item[field] || item[field + '_en'] || '';
}

function fmtPrice(syp) {
  const n = Number(syp || 0);
  if (state.cur === 'syp') return `${n.toLocaleString('en-US')} <span>${t('sypShort')}</span>`;
  const rate = Number(state.data?.settings?.exchange_rate_syp_per_usd || 14000);
  const usd = n / rate;
  const s = usd.toFixed(usd < 10 ? 2 : 1).replace(/\.00$/, '');
  return `$${s}`;
}

function imgSrc(item) {
  const p = item.image || (state.data?.images || {})[item.key] || '';
  return p ? p + '?v=' + (state.data?.settings?.updated_ts || 0) : '';
}

/* ------------------------------- load ------------------------------------- */

async function loadData() {
  const res = await fetch('menu-data.json?ts=' + Date.now());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  state.data = await res.json();
}

function normalize() {
  const menu = state.data?.menu || {};
  state.cats = Object.entries(menu).map(([key, v]) => ({
    key, label: v.label || key, label_en: v.label_en || v.label || key,
    icon: v.icon || '', items: v.items || [],
  }));
  state.items = state.cats.flatMap((c) =>
    c.items
      .filter((it) => !it.hidden)
      .map((it) => ({ ...it, catKey: c.key, catLabel: c.label, catLabelEn: c.label_en }))
  );
}

/* ------------------------------ rendering --------------------------------- */

function visibleItems() {
  let list = state.items.slice();
  if (state.activeCat && state.activeCat !== 'all') {
    list = list.filter((it) => it.catKey === state.activeCat);
  }
  if (state.q.trim()) {
    const q = state.q.trim().toLowerCase();
    list = list.filter((it) =>
      [it.name, it.name_en, it.desc, it.desc_en]
        .some((s) => String(s || '').toLowerCase().includes(q)));
  } else if (!state.activeCat) {
    return [];
  }
  if (state.sort === 'oldest') list.reverse();
  else if (state.sort === 'price_asc') list.sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (state.sort === 'price_desc') list.sort((a, b) => (b.price || 0) - (a.price || 0));
  else if (state.sort === 'offers') list = list.filter((it) => it.offer);
  return list;
}

function nutritionHtml(item) {
  const bits = [];
  if (item.cal) bits.push(`${item.cal}cal`);
  if (item.protein) bits.push(`${item.protein}g protein`);
  if (item.carb) bits.push(`${item.carb}g carb`);
  if (item.fat) bits.push(`${item.fat}g fat`);
  if (!bits.length || !state.data?.settings?.display?.show_nutrition) return '';
  return `<div class="cart-attrs-wrap product-nutrition-badges catalog-card-nutrition">${bits
    .map((b) => `<span class="attr-chip">${esc(b)}</span>`).join('')}</div>`;
}

function cardHtml(item, idx) {
  const src = imgSrc(item);
  return `
    <article class="catalog-card product-search-item" data-title="${esc(pick(item, 'name'))}" data-detail="${idx}" role="button" tabindex="0" aria-label="${esc(pick(item, 'name'))}">
      <div class="catalog-card-media">
        ${src ? `<img loading="lazy" src="${esc(src)}" alt="${esc(pick(item, 'name'))}">`
              : '<div class="bb-noimg"></div>'}
      </div>
      <div class="catalog-card-body">
        <h3>${esc(pick(item, 'name'))}</h3>
        <div class="popular-price">${fmtPrice(item.price)}</div>
      </div>
    </article>`;
}

function paintHero() {
  const r = state.data?.settings?.restaurant || {};
  const L = state.lang === 'en';
  const brand = r.name_en || r.name_ar || 'Brew & Bite';
  const latin = (r.name_en || 'Brew & Bite').trim();
  $('#hero-mark').textContent = latin.charAt(0).toUpperCase();
  $('#brand-mark').textContent = latin.charAt(0).toUpperCase();
  $('#hero-title').textContent = brand;
  $('#hero-sub').textContent = L ? (r.desc_en || r.desc_ar || '') : (r.desc_ar || r.desc_en || '');
  const tagline = (L ? (r.tagline_en || r.tagline_ar || '') : (r.tagline_ar || r.tagline_en || ''));
  $('#hero-chips').innerHTML = tagline
    ? tagline.split(/\s*[·•،,]\s*/).filter(Boolean).map((x) => `<span class="bb-hero-chip">${esc(x.trim())}</span>`).join('')
    : '';
  $('#hero-cta').textContent = t('explore');
}

function paintPopular() {
  $('#popular-title').textContent = t('popular');
  const ranked = state.cats
    .map((c) => ({ c, n: state.items.filter((it) => it.catKey === c.key).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  $('#popular-grid').innerHTML = ranked.map(({ c, n }) => {
    const first = c.items.find((it) => !it.hidden && (it.image || (state.data?.images || {})[it.key]));
    const src = first ? imgSrc(first) : '';
    return `
      <a class="bb-cat-tile" href="#" data-cat="${esc(c.key)}">
        <span class="bb-cat-tile-media">${src ? `<img loading="lazy" src="${esc(src)}" alt="">` : ''}
          <span class="bb-cat-tile-count">${n}</span>
        </span>
        <span class="bb-cat-tile-name">${c.icon ? esc(c.icon) + ' ' : ''}${esc(state.lang === 'en' ? c.label_en : c.label)}</span>
      </a>`;
  }).join('');
}

function paintGrid() {
  const list = visibleItems();
  $('#shop-grid').innerHTML = list.map(cardHtml).join('');
  $('#shop-empty').textContent = t('empty');
  $('#shop-empty').hidden = list.length > 0;
  const c = state.cats.find((x) => x.key === state.activeCat);
  const catLabel = c ? (state.lang === 'en' ? (c.label_en || c.label) : (c.label || c.label_en)) : '';
  if (state.activeCat === 'all') {
    $('#shop-title').textContent = t('title');
    $('#shop-sub').textContent = state.q.trim() ? `${list.length} ${t('results')}` : t('subAll');
  } else {
    $('#shop-title').textContent = catLabel || t('menu');
    $('#shop-sub').textContent = state.q.trim() ? `${list.length} ${t('results')}` : `${t('subCat')} ${catLabel}`.trim();
  }
  $('#crumb-current').textContent = state.activeCat === 'all' ? t('menu') : (catLabel || t('menu'));
}

function paintChips() {
  const box = $('#category-chips');
  const chips = [`<a class="shop-filter-chip ${state.activeCat === 'all' && !state.q ? 'is-active' : ''}" href="#" data-cat="all"><span>${t('all')}</span><span class="bb-chip-count">${state.items.length}</span></a>`]
    .concat(state.cats.map((c) => {
      const n = state.items.filter((it) => it.catKey === c.key).length;
      return `<a class="shop-filter-chip ${state.activeCat === c.key && !state.q ? 'is-active' : ''}" href="#" data-cat="${esc(c.key)}"><span>${c.icon ? esc(c.icon) + ' ' : ''}${esc(state.lang === 'en' ? c.label_en : c.label)}</span><span class="bb-chip-count">${n}</span></a>`;
    }));
  box.innerHTML = chips.join('');
  const act = box.querySelector('.shop-filter-chip.is-active');
  if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  paintChipsArrows();
}

function scrollChips(dir) {
  const box = $('#category-chips');
  const delta = dir * box.clientWidth * 0.7;
  const rtl = (document.documentElement.dir || 'ltr') === 'rtl';
  box.scrollTo({ left: rtl ? box.scrollLeft - delta : box.scrollLeft + delta, behavior: 'smooth' });
}

function paintChipsArrows() {
  const box = $('#category-chips');
  if (!box) return;
  const prev = $('#chips-prev'), next = $('#chips-next');
  if (!prev || !next) return;
  const max = box.scrollWidth - box.clientWidth;
  const pos = Math.abs(box.scrollLeft);
  prev.hidden = max <= 4 || pos <= 2;
  next.hidden = max <= 4 || pos >= max - 2;
}

function paintSidebar() {
  $('#sort-panel').innerHTML = SORTS.map((s) => `
    <a class="sidebar-link sort-link ${state.sort === s.id ? 'is-current' : ''}" href="#" data-sort="${s.id}">
      ${s.icon ? `<i class="${s.icon} bb-ic"></i>` : ''}${t(s.label)}
    </a>`).join('');
  $('#cat-links').innerHTML = `
    <a class="sidebar-link ${state.activeCat === 'all' ? 'is-current' : ''}" href="#" data-cat="all">${t('all')}</a>
    ${state.cats.map((c) => `
      <a class="sidebar-link ${state.activeCat === c.key ? 'is-current' : ''}" href="#" data-cat="${esc(c.key)}">
        ${c.icon ? `<i class="bb-ic">${esc(c.icon)}</i>` : ''}${esc(state.lang === 'en' ? c.label_en : c.label)}
      </a>`).join('')}`;
}

function paintFooter() {
  const r = state.data?.settings?.restaurant || {};
  const c = state.data?.settings?.contact || {};
  const h = state.data?.settings?.hours || {};
  const L = state.lang === 'en';
  const brand = r.name_en || r.name_ar || 'Brew & Bite';
  $('#brand-name').textContent = brand;
  $('#foot-phone').textContent = c.phone || '';
  $('#foot-loc').textContent = L ? (r.location_en || r.location_ar || '') : (r.location_ar || r.location_en || '');
  $('#foot-hours').textContent = (h.open_morning || h.close_evening)
    ? `${t('hoursText')} ${h.open_morning || ''} ${t('until')} ${h.close_evening || ''}` : '';
  $('#foot-link-home').textContent = t('home');
  $('#foot-link-admin').textContent = t('panel');
  // أزرار التواصل (اتصال + واتساب) إذا في رقم
  const phone = (c.phone || '').replace(/[^\d+]/g, '');
  const wa = phone ? (phone.startsWith('+') ? phone.slice(1) : (phone.startsWith('0') ? '963' + phone.slice(1) : phone)) : '';
  $('#foot-social').innerHTML = phone
    ? `<a class="bb-foot-btn primary" href="tel:${esc(phone)}"><i class="bx bx-phone"></i>${t('call')}</a>`
      + (wa ? `<a class="bb-foot-btn outline" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><i class="bx bxl-whatsapp"></i>${t('whatsapp')}</a>` : '')
    : '';
  $('#foot-links-title').textContent = t('links');
  $('#foot-contact-title').textContent = t('contact');
  $('#foot-hours-title').textContent = t('hoursTitle');
  $('#foot-note').textContent = t('footNote');
  $('#foot-copy').textContent = `© ${new Date().getFullYear()} ${brand}`;
  document.title = `${brand} — ${t('menu')}`;
  $('#sidebar-title').textContent = t('sidebarTitle');
  $('#sort-title').textContent = t('sortTitle');
  $('#cats-title').textContent = t('catsTitle');
  $('#search-bar').placeholder = t('search');
  $('#detail-close').textContent = t('close');
  $('#crumb-home').textContent = t('home');
  $('#back-home-label').textContent = t('home');
}

function applyView() {
  const home = state.view === 'home';
  $('#view-home').hidden = !home;
  $('#view-shop').hidden = home;
  if (!home) paintGrid();
}

function openCategory(key, opts = {}) {
  state.activeCat = key;
  state.view = 'shop';
  state.q = '';
  $('#search-bar').value = '';
  applyView();
  paintChips();
  paintSidebar();
  document.getElementById('menu-anchor').scrollIntoView({ behavior: 'smooth' });
  if (!opts.fromHistory) history.pushState({ bb: 'shop', cat: key }, '');
}

/* الرجوع للرئيسية: عبر سجل المتصفح إذا في مدخل مسجّل، وإلا مباشرة */
function uiBackHome() {
  if (history.state && history.state.bb === 'shop') history.back();
  else goHome();
}

function goHome() {
  state.view = 'home';
  state.q = '';
  state.activeCat = null;
  $('#search-bar').value = '';
  applyView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function paintAll() {
  paintFooter();
  paintHero();
  paintPopular();
  paintChips();
  paintSidebar();
  applyView();
}

/* ------------------------------ details modal ----------------------------- */

function openDetails(item) {
  $('#detail-img').src = imgSrc(item) || '';
  $('#detail-img').style.display = imgSrc(item) ? '' : 'none';
  $('#detail-cat').textContent = (state.lang === 'en' ? item.catLabelEn : item.catLabel) || t('catLabel');
  const badges = [];
  if (item.offer) badges.push(`<span class="bb-offer-badge">${t('offerBadge')}</span>`);
  if (item.popular) badges.push(`<span class="bb-popular-badge">${t('popularBadge')}</span>`);
  $('#detail-badges').innerHTML = badges.join('');
  $('#detail-name').textContent = pick(item, 'name');
  $('#detail-nutrition').innerHTML = nutritionHtml(item) || '';
  $('#detail-desc').textContent = pick(item, 'desc');
  $('#detail-price').innerHTML = fmtPrice(item.price);
  $('#details-modal').hidden = false;
  $('#details-modal').classList.add('is-open');
}

function closeDetails() {
  $('#details-modal').classList.remove('is-open');
  $('#details-modal').hidden = true;
}

/* ------------------------------ drawer ------------------------------------ */

function openDrawer() {
  $('#store-sidebar').classList.add('is-open');
  $('#sidebar-backdrop').classList.add('is-open');
  document.body.classList.add('sidebar-visible');
}
function closeDrawer() {
  $('#store-sidebar').classList.remove('is-open');
  $('#sidebar-backdrop').classList.remove('is-open');
  document.body.classList.remove('sidebar-visible');
}

/* ------------------------------ language / currency ----------------------- */

function setLang(lang) {
  state.lang = lang;
  try { localStorage.setItem('bb_lang', lang); } catch {}
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
  $('#lang-toggle').textContent = lang === 'en' ? 'ع' : 'EN';
  paintAll();
}

function setCur(cur) {
  state.cur = cur;
  try { localStorage.setItem('bb_cur', cur); } catch {}
  $('#currency-toggle').textContent = cur === 'syp' ? 'ل.س' : '$';
  $('#currency-toggle').classList.toggle('bb-mini-pill', true);
  paintGrid();
}

/* ------------------------------ events ------------------------------------ */

function wire() {
  $('#sidebar-open').addEventListener('click', openDrawer);
  $('#sidebar-close').addEventListener('click', closeDrawer);
  $('#sidebar-backdrop').addEventListener('click', closeDrawer);

  $('#lang-toggle').addEventListener('click', () => setLang(state.lang === 'ar' ? 'en' : 'ar'));
  $('#currency-toggle').addEventListener('click', () => setCur(state.cur === 'syp' ? 'usd' : 'syp'));

  let debounce;
  $('#search-bar').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = e.target.value; paintChips(); paintGrid(); }, 180);
  });

  $('#chips-prev').addEventListener('click', () => scrollChips(-1));
  $('#chips-next').addEventListener('click', () => scrollChips(1));
  $('#category-chips').addEventListener('scroll', paintChipsArrows, { passive: true });
  window.addEventListener('resize', paintChipsArrows);

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (chip) {
      e.preventDefault();
      closeDrawer();
      openCategory(chip.dataset.cat);
      return;
    }
    const sortLink = e.target.closest('[data-sort]');
    if (sortLink) {
      e.preventDefault();
      state.sort = sortLink.dataset.sort;
      closeDrawer();
      paintSidebar(); paintGrid();
      document.getElementById('menu-anchor').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const detail = e.target.closest('[data-detail]');
    if (detail) {
      e.preventDefault();
      const list = visibleItems();
      const item = list[Number(detail.dataset.detail)];
      if (item) openDetails(item);
      return;
    }
  });

  $('#detail-close').addEventListener('click', closeDetails);
  $('#hero-cta').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('bb-popular').scrollIntoView({ behavior: 'smooth' });
  });
  $('#crumb-home').addEventListener('click', (e) => { e.preventDefault(); uiBackHome(); });
  $('#logo-link').addEventListener('click', (e) => { e.preventDefault(); uiBackHome(); });
  $('#back-home').addEventListener('click', uiBackHome);

  // زر الرجوع بالمتصفح/الموبايل يرجّع للرئيسية بدل ما يطلّع من الموقع
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.bb === 'shop') openCategory(e.state.cat || 'all', { fromHistory: true });
    else goHome();
  });
  $('#details-modal').addEventListener('click', (e) => {
    if (e.target.id === 'details-modal') closeDetails();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDetails(); closeDrawer(); }
  });

  // فتح لوائح الدرج (طي/فتح)
  $('#sort-toggle').addEventListener('click', () => $('#sort-panel').classList.toggle('is-open'));
  $('#cats-toggle').addEventListener('click', () => $('#cat-links').classList.toggle('is-open'));
}

/* ------------------------------ boot -------------------------------------- */

(async function boot() {
  try { state.lang = localStorage.getItem('bb_lang') || 'ar'; } catch {}
  try { state.cur = localStorage.getItem('bb_cur') || 'syp'; } catch {}
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'en' ? 'ltr' : 'rtl';
  $('#lang-toggle').textContent = state.lang === 'en' ? 'ع' : 'EN';
  $('#currency-toggle').textContent = state.cur === 'syp' ? 'ل.س' : '$';

  wire();
  try {
    await loadData();
    normalize();
    paintAll();
  } catch (err) {
    console.error('[menu] load failed:', err);
    $('#shop-title').textContent = 'تعذر تحميل المينيو';
    $('#shop-sub').textContent = 'تحقق من الاتصال ثم أعد تحميل الصفحة.';
  } finally {
    const ov = $('#loading-overlay');
    ov.classList.remove('is-open');
    ov.hidden = true;
  }
})();
