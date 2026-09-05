/* Applies data/site.json (managed by the Telegram admin bot) to the page */
(function () {
  'use strict';
  var RAW = 'https://raw.githubusercontent.com/Pashawilliams/site/main/data/site.json';
  var LOCAL = 'data/site.json';
  var bust = '?v=' + Math.floor(Date.now() / 15000);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function digits(s) { return String(s || '').replace(/\D+/g, ''); }

  function applyContacts(c) {
    if (!c) return;
    var tg = c.telegram || '', wa = c.whatsapp || (c.phone ? 'https://wa.me/' + digits(c.phone) : ''), tel = c.phone ? 'tel:+' + digits(c.phone) : '';
    document.querySelectorAll('a[href*="t.me/"]').forEach(function (a) { if (tg) a.href = tg; });
    document.querySelectorAll('a[href*="wa.me/"], a[href*="whatsapp"]').forEach(function (a) { if (wa) a.href = wa; });
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) { if (tel) a.href = tel; });
    document.querySelectorAll('.et-header-phone, .et-footer-phone, .et-mobile-contact--ph span, .et-ccard--ph .et-ccard__value, .et-ccard--wa .et-ccard__value, .footer__mob-phone').forEach(function (el) { if (c.phone_display) el.textContent = c.phone_display; });
    var tgv = document.querySelector('.et-ccard--tg .et-ccard__value'); if (tgv && tg) { var m = /t\.me\/([\w_]+)/.exec(tg); if (m) tgv.textContent = '@' + m[1]; }
    document.querySelectorAll('.header__phone-subtitle').forEach(function (el) { if (c.support_note) el.textContent = c.support_note; });
    window.__siteContacts = { telegram: tg, whatsapp: wa, phone: c.phone || '' };
  }

  function applyHero(hr) {
    if (!hr) return;
    var t = document.querySelector('.front-sec__title');
    var s = document.querySelector('.front-sec__subtitle');
    if (t && hr.title) { t.textContent = hr.title; t.style.display = ''; }
    if (s && hr.subtitle) s.textContent = hr.subtitle;
  }

  function applyAdvantages(list) {
    if (!list || !list.length) return;
    var items = document.querySelectorAll('.advantages-sec__icon-container');
    items.forEach(function (el, i) {
      var txt = el.querySelector('.advantages-sec__icon-text');
      if (i < list.length) { if (txt) txt.textContent = list[i]; el.style.display = ''; }
      else el.style.display = 'none';
    });
  }

  function applyRoutes(routes) {
    if (!routes || !routes.length) return;
    var map = {};
    routes.forEach(function (r) { map[r.from + '|' + r.to] = r; });
    document.querySelectorAll('.direction-element').forEach(function (card) {
      var key = (card.getAttribute('data-from-name') || '') + '|' + (card.getAttribute('data-to-name') || '');
      var r = map[key];
      if (!r) return;
      if (r.visible === false) { card.setAttribute('data-hidden-by-admin', '1'); card.style.display = 'none'; return; }
      var p = card.querySelector('.direction-element__price');
      var o = card.querySelector('.et-price-old');
      if (p && r.price) { p.textContent = 'від ' + fmt(r.price) + ' грн'; p.setAttribute('data-original-price', 'від ' + fmt(r.price) + ' грн'); }
      if (o) { if (r.old_price && r.old_price > (r.price || 0)) { o.textContent = 'від ' + fmt(r.old_price) + ' грн'; o.style.display = ''; } else o.style.display = 'none'; }
      if (r.badge) {
        var b = card.querySelector('.et-card-badge');
        if (!b) { b = document.createElement('span'); b.className = 'et-card-badge'; card.appendChild(b); }
        b.textContent = r.badge;
      }
    });
    // price table for the search calculator
    if (window.__eurotourRouteData && window.__eurotourRouteData.KNOWN) {
      routes.forEach(function (r) {
        if (!r.price) return;
        window.__eurotourRouteData.KNOWN[r.from + '|' + r.to] = r.price;
      });
    }
  }

  function starSvg() {
    return '<svg width="18" height="17" viewBox="0 0 18 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.04894 0.927049C8.3483 0.00573802 9.6517 0.00574017 9.95106 0.927051L11.2451 4.90983C11.379 5.32185 11.763 5.60081 12.1962 5.60081H16.3839C17.3527 5.60081 17.7554 6.84043 16.9717 7.40983L13.5838 9.87132C13.2333 10.126 13.0866 10.5773 13.2205 10.9894L14.5146 14.9721C14.8139 15.8934 13.7595 16.6596 12.9757 16.0902L9.58778 13.6287C9.2373 13.374 8.7627 13.374 8.41221 13.6287L5.02426 16.0902C4.24054 16.6596 3.18607 15.8934 3.48542 14.9721L4.7795 10.9894C4.91338 10.5773 4.76672 10.126 4.41623 9.87132L1.02827 7.40983C0.244561 6.84043 0.647338 5.60081 1.61606 5.60081H5.8038C6.23703 5.60081 6.62099 5.32185 6.75486 4.90983L8.04894 0.927049Z" fill="#F6C445"/></svg>';
  }

  var lastReviews = '';
  function applyReviews(list) {
    if (!list || !list.length) return;
    var slider = document.querySelector('.reviews-sec__slider');
    if (!slider) return;
    var sig = JSON.stringify(list);
    if (sig === lastReviews && slider.classList.contains('slick-initialized')) return;
    lastReviews = sig;
    var wasSlick = slider.classList.contains('slick-initialized');
    if (wasSlick && window.jQuery && window.jQuery.fn.slick) { try { window.jQuery(slider).slick('unslick'); } catch (e) {} }
    slider.innerHTML = list.map(function (r) {
      var stars = ''; for (var i = 0; i < Math.max(1, Math.min(5, r.stars || 5)); i++) stars += starSvg();
      return '<div class="reviews-sec__slider-element"><div class="reviews-sec__slider-element-wrapper">' +
        '<p class="reviews-sec__text">' + esc(r.text) + '</p>' +
        '<div class="reviews-sec__data-row"><div class="reviews-sec__name-wrapper">' +
        '<p class="reviews-sec__name" data-initial="' + esc((r.name || '?').charAt(0)) + '">' + esc(r.name) + '</p>' +
        '<p class="reviews-sec__date">' + esc(r.date || '') + '</p></div>' +
        '<div class="reviews-sec__star-row">' + stars + '</div></div></div></div>';
    }).join('');
    if (window.jQuery && window.jQuery.fn.slick) {
      try {
        window.jQuery(slider).slick({ infinite: true, speed: 800, adaptiveHeight: true, slidesToScroll: 1, dots: true, slidesToShow: 3, autoplay: true, autoplaySpeed: 7000,
          prevArrow: '<div class="ar_slier prev-ar_slide"><div class="ar-ic-slider"></div></div>', nextArrow: '<div class="ar_slier next-ar_slide"><div class="ar-ic-slider"></div></div>',
          responsive: [{ breakpoint: 1380, settings: { slidesToShow: 2 } }, { breakpoint: 985, settings: { slidesToShow: 1 } }] });
      } catch (e) {}
    }
  }

  function applyFaq(list) {
    if (!list || !list.length) return;
    var first = list[0], rest = list.slice(1);
    var t1 = document.querySelector('.faq-sec__elementV1 .faq-sec__title');
    var a1 = document.querySelector('.faq-sec__elementV1 .faq-sec__text');
    if (t1) t1.textContent = first.q;
    if (a1) a1.textContent = first.a;
    var col = document.querySelector('.faq-sec__col-big');
    if (col) {
      col.innerHTML = rest.map(function (f) {
        return '<div class="faq-sec__elementV2"><h3 class="faq-sec__elementV2-title">' + esc(f.q) + '</h3><p class="faq-sec__elementV2-subtitle">' + esc(f.a) + '</p></div>';
      }).join('');
    }
  }

  function applyAnnouncement(site) {
    var a = site && site.announcement;
    var old = document.getElementById('et-announce');
    if (old) old.remove();
    if (!a || !a.enabled || !a.text) { document.body.classList.remove('has-announce'); return; }
    var bar = document.createElement('div');
    bar.id = 'et-announce';
    bar.innerHTML = '<div class="container">' + (a.link ? '<a href="' + esc(a.link) + '" target="_blank" rel="noopener">' : '<span>') +
      esc(a.text) + (a.link ? '</a>' : '</span>') + '</div>';
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.classList.add('has-announce');
  }

  function applyMaintenance(site) {
    if (!site || !site.maintenance) return;
    var c = window.__siteContacts || {};
    var d = document.createElement('div');
    d.id = 'et-maintenance';
    d.innerHTML = '<div class="et-maint__box"><h1>Сайт тимчасово на технічному обслуговуванні</h1>' +
      '<p>Ми скоро повернемось. Для бронювання напишіть нам:</p><div class="et-maint__links">' +
      (c.telegram ? '<a href="' + esc(c.telegram) + '" target="_blank" rel="noopener">Telegram</a>' : '') +
      (c.whatsapp ? '<a href="' + esc(c.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '</div></div>';
    document.body.appendChild(d);
    document.documentElement.classList.add('et-maint');
  }

  function apply(data) {
    if (!data) return;
    try { applyContacts(data.contacts); } catch (e) {}
    try { applyHero(data.hero); } catch (e) {}
    try { applyAdvantages(data.advantages); } catch (e) {}
    try { applyRoutes(data.routes); } catch (e) {}
    try { applyReviews(data.reviews); } catch (e) {}
    try { applyFaq(data.faq); } catch (e) {}
    try { applyAnnouncement(data.site); } catch (e) {}
    try { applyMaintenance(data.site); } catch (e) {}
    document.documentElement.setAttribute('data-site-loaded', '1');
    document.dispatchEvent(new CustomEvent('site:data', { detail: data }));
  }

  var lastJson = '';
  function applyIfChanged(data) {
    var j = JSON.stringify(data);
    if (j === lastJson) return;
    lastJson = j;
    apply(data);
  }
  function fetchJson(url) { return fetch(url + bust, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }); }
  function load() {
    if (!window.fetch) return;
    var t = setTimeout(function () { fetchJson(LOCAL).then(function (d) { if (d && !lastJson) applyIfChanged(d); }).catch(function () {}); }, 1500);
    fetchJson(RAW).then(function (d) { if (d) { clearTimeout(t); applyIfChanged(d); } else throw 0; })
      .catch(function () { fetchJson(LOCAL).then(function (d) { if (d) applyIfChanged(d); }).catch(function () {}); });
  }
  // live refresh: re-check every 60s while tab is visible (bot edits appear without reload)
  setInterval(function () { if (!document.hidden) { bust = '?v=' + Date.now(); fetchJson(RAW).then(function (d) { if (d) applyIfChanged(d); }).catch(function () {}); } }, 60000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
