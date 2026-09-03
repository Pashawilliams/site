/*! Визиты: одно TG-сообщение + heartbeat + активность для кнопок */
(function () {
  'use strict';

  var SESSION_KEY = 'et_session_id';
  var PAGES_KEY = 'et_visit_pages';
  var MAX_PAGES = 8;
  var HEARTBEAT_MS = 20000;
  var sid = '';

  function rid() {
    try {
      if (window.crypto && crypto.getRandomValues) {
        var a = new Uint8Array(6);
        crypto.getRandomValues(a);
        return Array.prototype.map.call(a, function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      }
    } catch (e) {}
    return String(Date.now()).slice(-8) + Math.random().toString(16).slice(2, 6);
  }

  function getSession() {
    try {
      var s = localStorage.getItem(SESSION_KEY);
      if (s && s.length >= 6 && s.length <= 64) return s;
    } catch (e) {}
    s = rid();
    try {
      localStorage.setItem(SESSION_KEY, s);
    } catch (e2) {}
    return s;
  }

  function post(url, obj, useBeacon) {
    var payload = JSON.stringify(obj);
    if (useBeacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        return;
      } catch (e) {}
    }
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () {});
    } catch (e) {}
  }

  function currentPath() {
    return (location.pathname || '/') + (location.search || '');
  }

  function pageLabel() {
    var title = (document.title || '').split('|')[0].trim();
    var path = currentPath();
    return title ? title + ' (' + path + ')' : path;
  }

  function readPages() {
    try {
      var raw = localStorage.getItem(PAGES_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writePages(pages) {
    try {
      localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
    } catch (e) {}
  }

  function trackVisit() {
    var path = currentPath();
    var title = document.title || '';
    var pages = readPages();
    var last = pages.length ? pages[pages.length - 1] : null;
    if (!last || last.path !== path) {
      pages.push({ path: path, title: title, t: Date.now() });
    } else {
      last.title = title;
      last.t = Date.now();
    }
    while (pages.length > MAX_PAGES) pages.shift();
    writePages(pages);

    post(
      '/api/visit',
      {
        session: sid,
        path: path,
        title: title,
        referrer: document.referrer || '',
        pages: pages,
        lang: navigator.language || '',
        ua: navigator.userAgent || '',
        host: location.host || ''
      },
      false
    );

    post(
      '/api/activity',
      {
        session: sid,
        kind: 'page',
        label: pageLabel(),
        path: path,
        title: title
      },
      true
    );
  }

  function heartbeat() {
    post(
      '/api/activity',
      {
        session: sid,
        kind: 'ping',
        path: currentPath(),
        title: document.title || ''
      },
      true
    );
  }

  function activity(kind, label) {
    if (!label) return;
    post(
      '/api/activity',
      {
        session: sid,
        kind: kind,
        label: String(label).slice(0, 80),
        path: currentPath(),
        title: document.title || ''
      },
      true
    );
  }

  function fieldName(el) {
    if (!el) return '';
    return (
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      el.getAttribute('aria-label') ||
      el.id ||
      el.tagName
    );
  }

  function bindActivity() {
    document.addEventListener(
      'focusin',
      function (e) {
        var el = e.target;
        if (!el || !el.tagName) return;
        var tag = el.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
        if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio') return;
        activity('field', fieldName(el));
      },
      true
    );

    document.addEventListener(
      'change',
      function (e) {
        var el = e.target;
        if (!el || el.tagName.toLowerCase() !== 'select') return;
        var name = fieldName(el);
        var val = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : el.value;
        if (el.id === 'search-from' || el.id === 'search-to' || (el.name && /from|to|direction/i.test(el.name))) {
          activity('ticket', (name || 'Маршрут') + ': ' + String(val || '').slice(0, 40));
        } else {
          activity('field', name);
        }
      },
      true
    );

    document.addEventListener(
      'click',
      function (e) {
        var el = e.target && e.target.closest
          ? e.target.closest('button, a.btnV1, a.btnV2, a.btnv3, .air-open-btn, .search__input-btn')
          : null;
        if (!el) return;
        var label =
          (el.textContent || '').replace(/\s+/g, ' ').trim() ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          'кнопка';
        activity('button', label.slice(0, 60));
        if (/брон|квит|заяв|оплат|пошук|знайти/i.test(label)) {
          activity('ticket', label.slice(0, 60));
        }
      },
      true
    );
  }

  sid = getSession();
  bindActivity();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisit);
  } else {
    trackVisit();
  }

  setInterval(heartbeat, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') heartbeat();
  });
})();
