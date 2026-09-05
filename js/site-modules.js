/* Eurotour — UI modules (v6): scroll progress, compact header, sticky mobile CTA,
   animated counters, FAQ accordion, route ticker, lazy images, toast, keyboard/a11y.
   Everything is passive & rAF-throttled — no scroll jank. */
(function () {
  'use strict';
  var d = document, w = window;
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function on(el, ev, fn, o) { el && el.addEventListener(ev, fn, o || false); }
  function rafThrottle(fn) { var t = false; return function () { if (!t) { t = true; requestAnimationFrame(function () { fn(); t = false; }); } }; }
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;

  d.addEventListener('DOMContentLoaded', function () {
    /* ---------- 1. Scroll progress bar ---------- */
    var bar = d.createElement('div'); bar.className = 'et-progress'; d.body.appendChild(bar);
    var header = $('.header');

    /* ---------- 2. Sticky mobile CTA ---------- */
    var cta = d.createElement('div');
    cta.className = 'et-mcta';
    cta.innerHTML =
      '<a class="et-mcta__btn et-mcta__btn--tg" href="https://t.me/pereviznyk_support" target="_blank" rel="noopener noreferrer" aria-label="Telegram"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.6 18.9 19c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.2 2.1c-.2.2-.4.4-.9.4l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L7.5 13.1 3 11.7c-1-.3-1-1 .2-1.4l17.4-6.7c.8-.3 1.5.2 1.3 1z"/></svg></a>' +
      '<a class="et-mcta__btn et-mcta__btn--wa" href="https://wa.me/380973452025" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3z"/></svg></a>' +
      '<a class="et-mcta__main" href="#routes"><span>Забронювати</span><small>від 3 100 грн</small></a>' +
      '<a class="et-mcta__btn et-mcta__btn--ph" href="tel:+380973452025" aria-label="Зателефонувати"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z"/></svg></a>';
    d.body.appendChild(cta);
    var minPrice = Infinity;
    $$('.direction-element:not([hidden]) .direction-element__price').forEach(function (p) { if (p.closest('#direction-extra') || p.offsetParent === null) return; var n = parseInt((p.textContent || '').replace(/\D/g, ''), 10); if (n && n < minPrice) minPrice = n; });
    if (isFinite(minPrice)) $('.et-mcta__main small').textContent = 'від ' + minPrice.toLocaleString('uk-UA') + ' грн';

    /* ---------- 3. Scroll-driven state (single handler) ---------- */
    var hero = $('.front-sec');
    var lastY = 0;
    var update = rafThrottle(function () {
      var y = w.scrollY || d.documentElement.scrollTop;
      var h = d.documentElement.scrollHeight - w.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
      if (header) header.classList.toggle('is-compact', y > 40);
      var sf = $('.search') || hero; var heroBottom = sf ? sf.getBoundingClientRect().bottom + y : 500;
      var nearBottom = y + w.innerHeight > d.documentElement.scrollHeight - 320;
      cta.classList.toggle('is-visible', y > heroBottom - 40 && !nearBottom && !d.body.classList.contains('et-chat-open'));
      lastY = y;
    });
    on(w, 'scroll', update, { passive: true }); on(w, 'resize', update, { passive: true }); update();

    /* ---------- 4. Animated counters in hero ---------- */
    if (!reduce && 'IntersectionObserver' in w) {
      $$('.et-hero-stats b').forEach(function (b) {
        var m = /^(\d+)(\+?)$/.exec(b.textContent.trim()); if (!m) return;
        var target = +m[1], suffix = m[2], t0 = null;
        b.textContent = '0' + suffix;
        function step(ts) { if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / 900); k = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(target * k) + suffix; if (k < 1) requestAnimationFrame(step); }
        requestAnimationFrame(step);
      });
    }

    /* ---------- 5. FAQ accordion ---------- */
    function initFaq() { $$('.faq-sec__elementV2').forEach(function (el, i) {
      if (el.classList.contains('et-acc')) return;
      var t = $('.faq-sec__elementV2-title', el), p = $('.faq-sec__elementV2-subtitle', el);
      if (!t || !p) return;
      t.textContent = t.textContent.replace(/^\s*-\s*/, '');
      if (!$('div', p)) { var inner = d.createElement('div'); while (p.firstChild) inner.appendChild(p.firstChild); p.appendChild(inner); }
      el.classList.add('et-acc'); t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.setAttribute('aria-expanded', i === 0 ? 'true' : 'false');
      if (i === 0) el.classList.add('is-open');
      function toggle() { var open = el.classList.toggle('is-open'); t.setAttribute('aria-expanded', open ? 'true' : 'false'); }
      on(t, 'click', toggle); on(t, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    }); }
    initFaq(); on(d, 'site:data', initFaq);
    $$('.faq-sec__title').forEach(function (t) { t.textContent = t.textContent.replace(/^\s*-\s*/, ''); });

    /* ---------- 6. Route ticker under the hero ---------- */
    var cards = $$('.direction-element').slice(0, 12);
    if (cards.length && hero) {
      var items = cards.map(function (c) {
        var price = $('.direction-element__price', c); var from = c.getAttribute('data-from-name'), to = c.getAttribute('data-to-name');
        if (!from || !to) return '';
        return '<button type="button" class="et-ticker__item" data-route="' + c.getAttribute('data-from') + '|' + c.getAttribute('data-to') + '"><span>' + from + ' → ' + to + '</span><b>' + (price ? price.textContent.trim() : '') + '</b></button>';
      }).join('');
      if (items) {
        var tk = d.createElement('div'); tk.className = 'et-ticker'; tk.setAttribute('aria-label', 'Популярні маршрути');
        tk.innerHTML = '<div class="et-ticker__track">' + items + items + '</div>';
        hero.parentNode.insertBefore(tk, hero.nextSibling);
        on(tk, 'click', function (e) {
          var b = e.target.closest('.et-ticker__item'); if (!b) return;
          var pair = b.getAttribute('data-route').split('|'); var f = $('#search-from'), t = $('#search-to');
          if (f && t) { f.value = pair[0]; t.value = pair[1]; f.dispatchEvent(new Event('change', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); }
          var routes = $('#routes'); if (routes) routes.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          var card = $('.direction-element[data-from="' + pair[0] + '"][data-to="' + pair[1] + '"]');
          if (card) { card.classList.remove('et-flash'); void card.offsetWidth; card.classList.add('et-flash'); }
        });
      }
    }

    /* ---------- 7. Lazy images & decoding ---------- */
    $$('img').forEach(function (img, i) {
      if (!img.getAttribute('loading') && i > 3 && !img.closest('.header')) img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    });

    /* ---------- 8. Toast helper (used by forms/chat) ---------- */
    w.siteToast = function (msg, kind) {
      var t = d.createElement('div'); t.className = 'et-toast' + (kind ? ' et-toast--' + kind : ''); t.textContent = msg; d.body.appendChild(t);
      requestAnimationFrame(function () { t.classList.add('is-in'); });
      setTimeout(function () { t.classList.remove('is-in'); setTimeout(function () { t.remove(); }, 300); }, 3200);
    };

    /* ---------- 9. Copy phone on long-press / dblclick ---------- */
    $$('a[href^="tel:"]').forEach(function (a) {
      on(a, 'dblclick', function (e) { e.preventDefault(); var num = a.getAttribute('href').replace('tel:', ''); if (navigator.clipboard) navigator.clipboard.writeText(num).then(function () { w.siteToast('Номер скопійовано: ' + num, 'ok'); }); });
    });

    /* ---------- 10. Escape closes popups/menu ---------- */
    on(d, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      $$('.air-conteiner.active, .popup-air.active').forEach(function (p) { var x = $('.air-close', p); if (x) x.click(); });
      var burger = $('.burger'); if (burger && d.body.querySelector('.header__mobile-active')) burger.click();
    });

    /* ---------- 11. Smooth in-page anchors with header offset ---------- */
    on(d, 'click', function (e) {
      var a = e.target.closest('a[href^="#"]'); if (!a) return;
      var id = a.getAttribute('href').slice(1); if (!id || a.hasAttribute('data-popup') || a.hasAttribute('data-route')) return;
      var el = d.getElementById(id); if (!el) return;
      e.preventDefault();
      var top = el.getBoundingClientRect().top + w.scrollY - ((header ? header.offsetHeight : 80) + 16);
      w.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      if (d.body.querySelector('.header__mobile-active')) { var b = $('.burger'); b && b.click(); }
      history.replaceState(null, '', '#' + id);
    });

    d.documentElement.classList.add('et-ready');
  });
})();
