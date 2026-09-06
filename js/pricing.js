/* Eurotour pricing engine: price = f(travel time, class).
   Travel time = road routing time (OSRM/OpenStreetMap road graph, precomputed by the bot into site.json → durations)
   + extra_hours (border/stops, default 3h). Class: comfort | lux. Prices in € converted to ₴ by NBU rate. */
(function (w, d) {
  'use strict';
  var P = {
    currency: 'UAH', eur_rate: 51.8, extra_hours: 3,
    tiers: [[6,8,90,120],[8,10,100,140],[10,12,130,170],[12,14,140,180],[14,16,150,190],[16,18,160,200],[18,20,160,200],[20,22,170,210],[22,24,180,220],[24,27,190,230],[27,30,200,240],[30,33,210,250],[33,36,210,250],[36,39,220,260],[39,42,230,270],[42,45,240,280],[45,999,250,290]],
    discounts: [{ label: 'Пенсіонерам', pct: 10 }, { label: 'Дітям', pct: 15 }]
  };
  var DUR = {};           // "From|To" -> {hours, km}
  var CLS_KEY = 'et_class';
  var cls = 'comfort';
  try { cls = localStorage.getItem(CLS_KEY) || 'comfort'; } catch (e) {}
  if (cls !== 'lux') cls = 'comfort';

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').replace(/\(.*?\)/g, '').trim(); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function roundUah(n) { return Math.round(n / 50) * 50; }
  function coords(name) { var rd = w.__eurotourRouteData; if (!rd) return null; var c = {}; (rd.UA_CITIES || []).forEach(function (x) { c[x.name] = [x.lat, x.lon]; }); Object.keys(rd.EU_COORDS || {}).forEach(function (k) { c[k] = rd.EU_COORDS[k]; }); return c[norm(name)] || null; }
  function haversine(a, b) { var R = 6371, t = Math.PI / 180, dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t, h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.sqrt(h)); }

  /* travel hours door-to-door (already includes extra_hours) */
  function hours(from, to) {
    from = norm(from); to = norm(to);
    var k = DUR[from + '|' + to] || DUR[to + '|' + from];
    if (k && k.hours) return { hours: k.hours, km: k.km, src: 'road' };
    // fallback: estimate road distance ≈ 1.25 × straight line; avg speed 78 km/h (mixed motorway/regional)
    var a = coords(from), b = coords(to);
    if (!a || !b) return null;
    var km = haversine(a, b) * 1.25;
    return { hours: Math.round((km / 78 + P.extra_hours) * 10) / 10, km: Math.round(km), src: 'estimate' };
  }
  function tier(h) {
    if (h == null) return null;
    if (h < P.tiers[0][0]) return P.tiers[0];
    for (var i = 0; i < P.tiers.length; i++) { var t = P.tiers[i]; if (h >= t[0] && h < t[1]) return t; }
    return P.tiers[P.tiers.length - 1];
  }
  function eurFor(h, c) { var t = tier(h); if (!t) return null; return c === 'lux' ? t[3] : t[2]; }
  function toUah(eur) { return roundUah(eur * P.eur_rate); }
  function quote(from, to, c) {
    c = c || cls;
    var hh = hours(from, to);
    if (!hh) return null;
    var eur = eurFor(hh.hours, c), t = tier(hh.hours), open = t && t[1] >= 999;
    var uah = toUah(eur);
    return { from: norm(from), to: norm(to), cls: c, hours: hh.hours, km: hh.km, src: hh.src, eur: eur, amount: uah, open: open,
      eur_comfort: eurFor(hh.hours, 'comfort'), eur_lux: eurFor(hh.hours, 'lux'), uah_comfort: toUah(eurFor(hh.hours, 'comfort')), uah_lux: toUah(eurFor(hh.hours, 'lux')),
      tier: t ? (t[1] >= 999 ? t[0] + '+ год' : t[0] + '–' + t[1] + ' год') : '' };
  }
  function fmtHours(h) { var H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return M ? H + ' год ' + M + ' хв' : H + ' год'; }
  function label(q) { return (q.open ? 'від ' : 'від ') + fmt(q.amount) + ' грн'; }
  function classLabel(c) { return c === 'lux' ? 'Lux' : 'Comfort'; }

  /* ---------- apply to DOM ---------- */
  function applyCards() {
    d.querySelectorAll('.direction-element').forEach(function (card) {
      var q = quote(card.getAttribute('data-from-name'), card.getAttribute('data-to-name'));
      if (!q) return;
      var p = card.querySelector('.direction-element__price');
      var o = card.querySelector('.et-price-old');
      if (p) { p.textContent = label(q); p.setAttribute('data-original-price', label(q)); p.classList.remove('is-bump'); void p.offsetWidth; p.classList.add('is-bump'); }
      if (o) o.style.display = 'none';
      var note = card.querySelector('.et-card-door-note');
      var info = card.querySelector('.et-card-trip');
      if (!info) { info = d.createElement('div'); info.className = 'et-card-trip'; if (note) note.insertAdjacentElement('beforebegin', info); else if (p) p.parentElement.appendChild(info); }
      info.innerHTML = '<span class="et-card-trip__time" title="Час у дорозі за дорожнім маршрутом + ' + P.extra_hours + ' год на кордон і зупинки">🕒 ~' + fmtHours(q.hours) + '</span>' +
        '<span class="et-card-trip__cls et-card-trip__cls--' + q.cls + '">' + classLabel(q.cls) + ' · €' + q.eur + (q.open ? '+' : '') + '</span>';
      card.setAttribute('data-price-uah', q.amount); card.setAttribute('data-hours', q.hours);
    });
    // keep the legacy KNOWN table in sync so old code paths pick the same price
    var rd = w.__eurotourRouteData;
    if (rd && rd.KNOWN) d.querySelectorAll('.direction-element').forEach(function (card) { var f = card.getAttribute('data-from-name'), t = card.getAttribute('data-to-name'), q = quote(f, t); if (q) { rd.KNOWN[f + '|' + t] = q.amount; rd.KNOWN[t + '|' + f] = q.amount; } });
    if (rd) { rd.calcPriceByNames = function (f, t) { var q = quote(f, t); return q ? { amount: q.amount, source: 'time', from: q.from, to: q.to, hours: q.hours, cls: q.cls, eur: q.eur } : null; }; rd.roundPrice = function (n) { return Math.round(n); }; rd.formatPrice = fmt; rd.formatPriceLabel = function (n) { return 'Ціна ' + fmt(n) + ' грн'; }; }
    var mcta = d.querySelector('.et-mcta__main small');
    if (mcta) { var min = Infinity; d.querySelectorAll('.direction-element[data-price-uah]').forEach(function (c) { var v = +c.getAttribute('data-price-uah'); if (v && v < min) min = v; }); if (isFinite(min)) mcta.textContent = 'від ' + fmt(min) + ' грн'; }
  }

  /* class switcher (in search form + routes header) */
  function switcher(id) {
    var el = d.createElement('div');
    el.className = 'et-cls'; el.setAttribute('role', 'radiogroup'); el.setAttribute('aria-label', 'Клас автобуса'); el.id = id;
    el.innerHTML = '<span class="et-cls__label">Клас</span>' +
      '<button type="button" class="et-cls__opt" data-cls="comfort"><b>Comfort</b><small>стандарт</small></button>' +
      '<button type="button" class="et-cls__opt" data-cls="lux"><b>Lux</b><small>підвищений комфорт</small></button>' +
      '<i class="et-cls__pill"></i>';
    return el;
  }
  function syncSwitchers() {
    d.querySelectorAll('.et-cls').forEach(function (s) {
      s.setAttribute('data-cls', cls);
      s.querySelectorAll('.et-cls__opt').forEach(function (b) { var on = b.getAttribute('data-cls') === cls; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    });
  }
  function setClass(c, silent) {
    if (c !== 'lux') c = 'comfort';
    var changed = c !== cls; cls = c;
    try { localStorage.setItem(CLS_KEY, cls); } catch (e) {}
    w.__eurotourClass = cls;
    syncSwitchers(); applyCards(); refreshSearchPrice();
    if (changed && !silent) d.dispatchEvent(new CustomEvent('et:class', { detail: { cls: cls } }));
  }
  d.addEventListener('click', function (e) {
    var b = e.target.closest('.et-cls__opt'); if (!b) return;
    e.preventDefault(); setClass(b.getAttribute('data-cls'));
  });

  function mountSwitchers() {
    var timeRow = d.querySelector('.search__time');
    if (timeRow && !d.getElementById('et-cls-search')) timeRow.insertAdjacentElement('afterend', switcher('et-cls-search'));
    var routesTitle = d.querySelector('#routes .et-popular-routes-note--desk') || d.querySelector('#routes .direction-sec__title');
    if (routesTitle && !d.getElementById('et-cls-routes')) {
      var wrap = d.createElement('div'); wrap.className = 'et-routes-tools';
      wrap.appendChild(switcher('et-cls-routes'));
      var disc = d.createElement('div'); disc.className = 'et-discounts';
      disc.innerHTML = '<span class="et-discounts__t">Знижки</span>' + P.discounts.map(function (x) { return '<span class="et-discounts__i"><b>−' + x.pct + '%</b> ' + x.label + '</span>'; }).join('') +
        '<span class="et-discounts__note">Ціна залежить від часу в дорозі (' + P.tiers[0][0] + '–' + P.tiers[P.tiers.length - 2][1] + '+ год) · курс €1 = ' + P.eur_rate.toFixed(2) + ' ₴</span>';
      wrap.appendChild(disc);
      routesTitle.insertAdjacentElement('afterend', wrap);
    }
    syncSwitchers();
  }

  /* search price box: show both classes + time */
  function currentSearch() {
    var f = d.getElementById('search-from'), t = d.getElementById('search-to');
    if (!f || !t || !f.value || !t.value) return null;
    return { from: f.options[f.selectedIndex].textContent, to: t.options[t.selectedIndex].textContent };
  }
  function refreshSearchPrice() {
    var box = d.getElementById('et-search-price'); if (!box || box.hidden) return;
    var s = currentSearch(); if (!s) return;
    var q = quote(s.from, s.to); if (!q) return;
    w.__eurotourLastPrice = { amount: q.amount, hours: q.hours, cls: q.cls, eur: q.eur, from: q.from, to: q.to };
    box.innerHTML = '<div class="et-search-price__inner et-sp">' +
      '<div class="et-sp__row"><span class="et-search-price__label">Ціна квитка · ' + classLabel(q.cls) + '</span><span class="et-search-price__now"><strong>' + fmt(q.amount) + '</strong> <span class="et-search-price__currency">грн</span> <em class="et-sp__eur">≈ €' + q.eur + (q.open ? '+' : '') + '</em></span></div>' +
      '<div class="et-sp__meta">🕒 у дорозі ~' + fmtHours(q.hours) + ' · ' + (q.cls === 'lux' ? 'Comfort: ' + fmt(q.uah_comfort) : 'Lux: ' + fmt(q.uah_lux)) + ' грн · знижки: пенсіонерам −10%, дітям −15%</div></div>';
  }
  // observe the price box created by local-forms.js and enrich it
  var moBusy = false;
  var mo = new MutationObserver(function () { if (moBusy) return; var box = d.getElementById('et-search-price'); if (box && !box.hidden && !box.querySelector('.et-sp')) { moBusy = true; try { refreshSearchPrice(); } finally { moBusy = false; } } });
  function observe() { var host = d.querySelector('#main-search-route') || d.body; mo.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); }

  /* booking popup: class selector + lead fields */
  function enrichBooking() {
    d.querySelectorAll('.booking-form form, [data-air="booking-form-popup"] form').forEach(function (form) {
      var wrap = form.closest('.main-form__wrapper') || form.parentElement;
      if (!form.querySelector('input[name="et-class"]')) {
        var hidden = d.createElement('input'); hidden.type = 'hidden'; hidden.name = 'et-class'; hidden.value = classLabel(cls);
        var hid2 = d.createElement('input'); hid2.type = 'hidden'; hid2.name = 'et-travel-time'; hid2.value = '';
        form.appendChild(hidden); form.appendChild(hid2);
      }
      if (wrap.querySelector('.et-cls--booking')) return;
      var price = wrap.querySelector('.et-booking-price');
      var s = switcher('et-cls-booking-' + Math.random().toString(36).slice(2, 6)); s.classList.add('et-cls--booking');
      var disc = d.createElement('div'); disc.className = 'et-booking-disc'; disc.textContent = '🎁 Знижки: пенсіонерам −10%, дітям −15% — повідомте менеджеру';
      if (price) { price.insertAdjacentElement('afterend', s); s.insertAdjacentElement('afterend', disc); }
      else { var summary = wrap.querySelector('.et-booking-summary'); if (!summary) return; summary.appendChild(s); summary.appendChild(disc); }
      syncSwitchers();
    });
  }
  // clicking «Забронювати» on a route card → remember its quote so the booking form gets price/time
  d.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('.direction-element');
    if (!card || !e.target.closest('.air-open-btn, .btnv3')) return;
    var q = quote(card.getAttribute('data-from-name'), card.getAttribute('data-to-name'));
    if (q) { w.__eurotourLastPrice = { amount: q.amount, hours: q.hours, cls: q.cls, eur: q.eur, from: q.from, to: q.to }; setTimeout(function () { enrichBooking(); reinjectBooking(); fillHidden(); }, 200); setTimeout(function () { enrichBooking(); reinjectBooking(); fillHidden(); }, 600); }
  }, true);
  function fillHidden() {
    var lp = w.__eurotourLastPrice; if (!lp) return;
    d.querySelectorAll('input[name="et-travel-time"]').forEach(function (i) { i.value = '~' + fmtHours(lp.hours); });
    d.querySelectorAll('form').forEach(function (f) { if (f.querySelector('input[name="et-class"]') && !f.querySelector('input[name="et-route-price"]')) { var h = d.createElement('input'); h.type = 'hidden'; h.name = 'et-route-price'; h.value = String(lp.amount); f.appendChild(h); } });
  }
  d.addEventListener('et:class', function () { d.querySelectorAll('input[name="et-class"]').forEach(function (i) { i.value = classLabel(cls); }); reinjectBooking(); });
  function reinjectBooking() {
    var lp = w.__eurotourLastPrice; if (!lp) return;
    busy = true; setTimeout(function () { busy = false; }, 0);
    var q = quote(lp.from, lp.to); if (!q) return;
    w.__eurotourLastPrice = { amount: q.amount, hours: q.hours, cls: q.cls, eur: q.eur, from: q.from, to: q.to };
    d.querySelectorAll('.et-booking-price__value strong').forEach(function (s) { s.textContent = fmt(q.amount); });
    d.querySelectorAll('input[name="et-route-price"]').forEach(function (i) { i.value = String(q.amount); });
    d.querySelectorAll('input[name="et-travel-time"]').forEach(function (i) { i.value = '~' + fmtHours(q.hours); });
    d.querySelectorAll('.et-booking-price__label').forEach(function (l) { l.textContent = 'Ціна квитка · ' + classLabel(q.cls); });
  }
  var busy = false, bmoT = null;
  var bmo = new MutationObserver(function (muts) {
    if (busy) return;
    var relevant = muts.some(function (m) { return m.type === 'childList' && m.addedNodes.length && !(m.target.closest && m.target.closest('.et-cls, .et-search-price, .et-card-trip, .et-booking-disc')); });
    if (!relevant) return;
    clearTimeout(bmoT);
    bmoT = setTimeout(function () {
      busy = true;
      try {
        enrichBooking();
        var lp = w.__eurotourLastPrice, s = d.querySelector('.et-booking-price__value strong');
        if (lp && s && s.textContent.replace(/\s/g, '') !== fmt(lp.amount).replace(/\s/g, '')) reinjectBooking();
        else if (lp && s) { d.querySelectorAll('input[name="et-travel-time"]').forEach(function (i) { if (!i.value && lp.hours) i.value = '~' + fmtHours(lp.hours); }); }
      } finally { busy = false; }
    }, 60);
  });

  /* ---------- data from site.json ---------- */
  function applyData(data) {
    if (data.pricing) {
      if (data.pricing.tiers && data.pricing.tiers.length) P.tiers = data.pricing.tiers;
      if (data.pricing.eur_rate) P.eur_rate = +data.pricing.eur_rate;
      if (data.pricing.extra_hours != null) P.extra_hours = +data.pricing.extra_hours;
      if (data.pricing.discounts) P.discounts = data.pricing.discounts;
    }
    if (data.durations) DUR = data.durations;
    applyCards(); refreshSearchPrice(); syncSwitchers();
    var note = d.querySelector('.et-discounts__note'); if (note) note.textContent = 'Ціна залежить від часу в дорозі · курс €1 = ' + P.eur_rate.toFixed(2) + ' ₴';
    if (data.pricing && data.pricing.rate_auto !== false) fetchRate();
  }
  var rateFetched = false;
  function fetchRate() {
    if (rateFetched || !w.fetch) return; rateFetched = true;
    fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json').then(function (r) { return r.json(); }).then(function (j) {
      var r = j && j[0] && +j[0].rate; if (r && r > 20 && r < 200 && Math.abs(r - P.eur_rate) > 0.01) { P.eur_rate = r; applyCards(); refreshSearchPrice(); var note = d.querySelector('.et-discounts__note'); if (note) note.textContent = 'Ціна залежить від часу в дорозі · курс НБУ €1 = ' + r.toFixed(2) + ' ₴'; }
    }).catch(function () {});
  }

  function boot() {
    w.__eurotourClass = cls;
    mountSwitchers(); applyCards(); observe(); enrichBooking();
    bmo.observe(d.body, { childList: true, subtree: true });
    d.addEventListener('site:data', function (e) { applyData(e.detail || {}); });
    d.addEventListener('change', function (e) { if (e.target && (e.target.id === 'search-from' || e.target.id === 'search-to')) setTimeout(refreshSearchPrice, 50); });
  }
  w.__eurotourPricing = { quote: quote, hours: hours, setClass: setClass, getClass: function () { return cls; }, config: P, fmtHours: fmtHours };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
