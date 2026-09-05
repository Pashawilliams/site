/* Managers: cards in contacts, footer, mobile menu + "who to contact" chooser sheet.
   Data comes from data/site.json → managers[] (managed by the Telegram admin bot). */
(function () {
  'use strict';
  var DEFAULT = [
    { name: 'Дмитро', role: 'Менеджер з перевезень', phone: '+380683175335', telegram: 'https://t.me/+380683175335', whatsapp: 'https://wa.me/380683175335' },
    { name: 'Олексій', role: 'Менеджер з перевезень', phone: '+380973452025', telegram: 'https://t.me/+380973452025', whatsapp: 'https://wa.me/380973452025' },
    { name: 'Сергій', role: 'Менеджер з перевезень', phone: '+380680813450', telegram: 'https://t.me/+380680813450', whatsapp: 'https://wa.me/380680813450' }
  ];
  var managers = DEFAULT.slice();
  var ICON = {
    ph: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z"/></svg>',
    tg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.6 18.9 19c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.2 2.1c-.2.2-.4.4-.9.4l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L7.5 13.1 3 11.7c-1-.3-1-1 .2-1.4l17.4-6.7c.8-.3 1.5.2 1.3 1z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3z"/></svg>'
  };
  var TITLE = { ph: 'Кому зателефонувати?', tg: 'Кому написати в Telegram?', wa: 'Кому написати у WhatsApp?' };
  var LABEL = { ph: 'Дзвінок', tg: 'Telegram', wa: 'WhatsApp' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function digits(s) { return String(s || '').replace(/\D+/g, ''); }
  function fmtPhone(p) { var d = digits(p); return d.length === 12 ? '+' + d.slice(0, 3) + ' ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8, 10) + ' ' + d.slice(10) : (p || ''); }
  function link(m, ch) {
    if (ch === 'ph') return 'tel:+' + digits(m.phone);
    if (ch === 'tg') return (m.telegram && /t\.me\//.test(m.telegram)) ? m.telegram : ('https://t.me/+' + digits(m.phone));
    return m.whatsapp || ('https://wa.me/' + digits(m.phone));
  }
  function initial(n) { return (n || '?').trim().charAt(0).toUpperCase(); }
  function normalize(list) {
    return (list || []).filter(function (m) { return m && m.name && m.phone; }).map(function (m) {
      return { name: m.name, role: m.role || 'Менеджер', phone: '+' + digits(m.phone), telegram: m.telegram || '', whatsapp: m.whatsapp || '' };
    });
  }

  /* ---------- rendering ---------- */
  function btn(m, ch, extra) {
    var ext = ch === 'ph' ? '' : ' target="_blank" rel="noopener noreferrer"';
    return '<a class="et-mgr__btn et-mgr__btn--' + ch + ' ' + (extra || '') + '" data-mgr-direct="1" href="' + esc(link(m, ch)) + '"' + ext + ' aria-label="' + esc(LABEL[ch] + ' — ' + m.name) + '">' + ICON[ch] + '<span>' + LABEL[ch] + '</span></a>';
  }
  function renderCards() {
    var box = document.querySelector('.et-managers__list');
    if (!box) return;
    box.innerHTML = managers.map(function (m, i) {
      return '<div class="et-mgr" style="--i:' + i + '">' +
        '<div class="et-mgr__avatar">' + esc(initial(m.name)) + '<i class="et-mgr__dot"></i></div>' +
        '<div class="et-mgr__info"><span class="et-mgr__name">' + esc(m.name) + ' <em>менеджер</em></span>' +
        '<span class="et-mgr__role">' + esc(m.role) + '</span>' +
        '<a class="et-mgr__phone" data-mgr-direct="1" href="tel:' + esc(m.phone) + '">' + esc(fmtPhone(m.phone)) + '</a></div>' +
        '<div class="et-mgr__actions">' + btn(m, 'ph') + btn(m, 'tg') + btn(m, 'wa') + '</div></div>';
    }).join('');
    var sec = box.closest('.et-managers');
    if (sec && !sec.classList.contains('is-in')) {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { sec.classList.add('is-in'); io.disconnect(); } }); }, { threshold: 0.15 });
        io.observe(sec);
      } else sec.classList.add('is-in');
    }
  }
  function renderFooter() {
    document.querySelectorAll('.et-footer-mgrs').forEach(function (box) {
      box.innerHTML = managers.map(function (m) {
        return '<div class="et-footer-mgr"><a class="et-footer-phone et-footer-phone--sm" data-mgr-direct="1" href="tel:' + esc(m.phone) + '">' + esc(fmtPhone(m.phone)) + '</a>' +
          '<span class="footer__contacts-note">' + esc(m.name) + ' · менеджер · <a data-mgr-direct="1" href="' + esc(link(m, 'tg')) + '" target="_blank" rel="noopener noreferrer">Telegram</a> · <a data-mgr-direct="1" href="' + esc(link(m, 'wa')) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a></span></div>';
      }).join('');
    });
  }
  function renderMobile() {
    var box = document.querySelector('.et-mobile-mgrs');
    if (!box) return;
    box.innerHTML = managers.map(function (m) {
      return '<div class="et-mobile-mgr"><span class="et-mobile-mgr__name">' + esc(m.name) + ' · менеджер</span>' +
        '<a class="et-mobile-mgr__phone" data-mgr-direct="1" href="tel:' + esc(m.phone) + '">' + esc(fmtPhone(m.phone)) + '</a>' +
        '<span class="et-mobile-mgr__links">' + ['ph', 'tg', 'wa'].map(function (ch) {
          return '<a data-mgr-direct="1" href="' + esc(link(m, ch)) + '"' + (ch === 'ph' ? '' : ' target="_blank" rel="noopener noreferrer"') + ' aria-label="' + esc(LABEL[ch] + ' — ' + m.name) + '">' + ICON[ch] + '</a>';
        }).join('') + '</span></div>';
    }).join('');
  }
  function renderAll() { renderCards(); renderFooter(); renderMobile(); }

  /* ---------- chooser sheet ---------- */
  var sheet, lastFocus, closeTimer;
  function buildSheet() {
    sheet = document.createElement('div');
    sheet.className = 'et-pick';
    sheet.hidden = true;
    sheet.innerHTML = '<div class="et-pick__bg" data-pick-close></div>' +
      '<div class="et-pick__panel" role="dialog" aria-modal="true" aria-labelledby="et-pick-title">' +
      '<div class="et-pick__grip"></div>' +
      '<button type="button" class="et-pick__x" data-pick-close aria-label="Закрити">&times;</button>' +
      '<div class="et-pick__head"><span class="et-pick__ico"></span><div><h3 class="et-pick__title" id="et-pick-title"></h3><p class="et-pick__sub">Оберіть менеджера — відповімо швидко</p></div></div>' +
      '<div class="et-pick__list"></div></div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) {
      if (e.target.closest('[data-pick-close]')) closeSheet();
      else if (e.target.closest('.et-pick__item')) setTimeout(closeSheet, 150);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet && !sheet.hidden) closeSheet(); });
  }
  function openSheet(ch) {
    if (!sheet) buildSheet();
    clearTimeout(closeTimer);
    sheet.querySelector('.et-pick__title').textContent = TITLE[ch];
    var ico = sheet.querySelector('.et-pick__ico'); ico.className = 'et-pick__ico et-pick__ico--' + ch; ico.innerHTML = ICON[ch];
    sheet.querySelector('.et-pick__list').innerHTML = managers.map(function (m, i) {
      var ext = ch === 'ph' ? '' : ' target="_blank" rel="noopener noreferrer"';
      return '<a class="et-pick__item" style="--i:' + i + '" href="' + esc(link(m, ch)) + '"' + ext + '>' +
        '<span class="et-pick__av">' + esc(initial(m.name)) + '<i></i></span>' +
        '<span class="et-pick__txt"><b>Менеджер ' + esc(m.name) + '</b><small>' + esc(fmtPhone(m.phone)) + ' · ' + esc(m.role) + '</small></span>' +
        '<span class="et-pick__go et-pick__go--' + ch + '">' + ICON[ch] + '</span></a>';
    }).join('');
    lastFocus = document.activeElement;
    sheet.hidden = false;
    document.documentElement.classList.add('et-pick-open');
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('is-open'); }); });
    var first = sheet.querySelector('.et-pick__item'); if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 350);
  }
  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('is-open');
    document.documentElement.classList.remove('et-pick-open');
    closeTimer = setTimeout(function () { sheet.hidden = true; }, 380);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  function channelOf(a) {
    var h = (a.getAttribute('href') || '').toLowerCase();
    if (h.indexOf('tel:') === 0) return 'ph';
    if (h.indexOf('t.me/') !== -1 || h.indexOf('telegram.me/') !== -1) return 'tg';
    if (h.indexOf('wa.me/') !== -1 || h.indexOf('whatsapp') !== -1) return 'wa';
    return null;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('data-mgr-direct') || a.closest('.et-pick, .et-chat, #et-chat')) return;
    if (a.hasAttribute('data-no-pick')) return;
    // Telegram bot link in the announcement bar should stay direct
    if (/t\.me\/[\w_]*bot(\b|$)/i.test(a.href)) return;
    var ch = channelOf(a);
    if (!ch || managers.length < 2) return;
    e.preventDefault();
    openSheet(ch);
  }, true);

  /* ---------- data ---------- */
  document.addEventListener('site:data', function (e) {
    var d = e.detail || {};
    var list = normalize(d.managers);
    if (list.length) { managers = list; renderAll(); }
  });
  window.__eurotourManagers = { open: openSheet, close: closeSheet, list: function () { return managers.slice(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll); else renderAll();
})();
