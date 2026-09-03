/*! Онлайн-чат → Telegram (відповідь через Reply). Інтеграція в #floating-menu */
(function () {
  'use strict';

  var SESSION_KEY = 'et_session_id';
  var AFTER_KEY = 'et_chat_after';
  var OPERATOR_NAME = 'Олена';
  var pollTimer = null;
  var afterId = 0;
  var open = false;
  var sending = false;


  function gatePrefix() {
    var m = String(location.pathname || '').match(/^(\/go\/[^\/]+)/);
    return m ? m[1] : '';
  }

  function absUrl(path) {
    var p = String(path || '');
    if (!p) return p;
    if (/^https?:\/\//i.test(p) || p.indexOf('data:') === 0) return p;
    if (p.charAt(0) !== '/') p = '/' + p;
    return gatePrefix() + p;
  }

  function operatorPhotoUrl() {
    return absUrl('/img/chat-operator.png');
  }

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

  function loadAfter() {
    try {
      var n = parseInt(localStorage.getItem(AFTER_KEY) || '0', 10);
      return isFinite(n) && n > 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveAfter(n) {
    afterId = n;
    try {
      localStorage.setItem(AFTER_KEY, String(n));
    } catch (e) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function chatIconSvg() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">' +
      '<path fill="#fff" d="M12 3c-4.97 0-9 3.58-9 8 0 2.4 1.2 4.55 3.1 6.05-.08.7-.35 1.9-1.2 3.15 1.7-.25 3.05-.95 3.9-1.5C10.05 19.2 11 19.4 12 19.4c4.97 0 9-3.58 9-8S16.97 3 12 3zm-3.2 7.2h6.4a.8.8 0 010 1.6H8.8a.8.8 0 010-1.6zm0 3.2h4.4a.8.8 0 010 1.6H8.8a.8.8 0 010-1.6z"/>' +
      '</svg>'
    );
  }


  function notifyMessenger(kind) {
    try {
      if (typeof window.__eurotourTrackLead === 'function') {
        window.__eurotourTrackLead({
          type: 'contact_' + kind,
          channel: kind,
          path: (location.pathname || '/') + (location.search || ''),
          title: document.title || ''
        });
      } else if (typeof window.fbq === 'function') {
        fbq('track', 'Lead', { content_name: kind, content_category: 'contact_' + kind, status: true });
        fbq('trackCustom', 'отправка заявки', { content_name: kind, content_category: 'contact_' + kind, status: true });
      }
    } catch (e0) {}
    try {
      var sid = getSession();
      var payload = JSON.stringify({
        session: sid,
        messenger: kind,
        path: (location.pathname || '/') + (location.search || ''),
        title: document.title || '',
        host: location.host || ''
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(absUrl('/api/messenger-click'), new Blob([payload], { type: 'application/json' }));
        return;
      }
      fetch(absUrl('/api/messenger-click'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () {});
    } catch (e) {}
  }

  function wireMessengerLinks(root) {
    root = root || document;
    var nodes = root.querySelectorAll(
      'a.btn.viber, a.viber, a[href*="viber"], a.btn.telegram, a.telegram, a.js-telegram-link, a[href*="t.me/"], a[href*="telegram.me/"], a[href*="wa.me/"], a[href*="whatsapp"]'
    );
    Array.prototype.forEach.call(nodes, function (a) {
      if (a.dataset.etMsgWired === '1') return;
      a.dataset.etMsgWired = '1';
      a.addEventListener(
        'click',
        function () {
          var href = (a.getAttribute('href') || '').toLowerCase();
          var kind = 'telegram';
          if (href.indexOf('viber') !== -1 || (a.className || '').indexOf('viber') !== -1) kind = 'viber';
          else if (href.indexOf('wa.me') !== -1 || href.indexOf('whatsapp') !== -1) kind = 'whatsapp';
          else kind = 'telegram';
          notifyMessenger(kind);
        },
        true
      );
    });
  }

  function waIconSvg() {
    return (
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
      '<path fill="#fff" d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm0 1.8c2.16 0 4.2.84 5.73 2.37a8.08 8.08 0 012.37 5.73c0 4.47-3.63 8.1-8.1 8.1-1.43 0-2.82-.37-4.04-1.08l-.29-.17-3.12.82.83-3.04-.19-.31a8.07 8.07 0 01-1.25-4.32c0-4.47 3.63-8.1 8.1-8.1zm4.66 10.78c-.2-.1-1.18-.58-1.36-.65-.18-.07-.31-.1-.45.1-.13.2-.52.65-.64.78-.12.13-.24.15-.44.05-.2-.1-.84-.31-1.6-.99-.59-.53-.99-1.18-1.1-1.38-.12-.2-.01-.3.09-.4.09-.09.2-.24.3-.36.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.61-1.48-.16-.39-.33-.33-.45-.34h-.38c-.13 0-.35.05-.53.25-.18.2-.7.68-.7 1.66 0 .98.72 1.93.82 2.06.1.13 1.41 2.15 3.42 3.01.48.21.85.33 1.14.42.48.15.92.13 1.26.08.39-.06 1.18-.48 1.35-.95.17-.47.17-.87.12-.95-.05-.08-.18-.13-.38-.23z"/>' +
      '</svg>'
    );
  }

  function closeFloatingMenu() {
    try {
      var items = document.querySelector('#floating-menu .menu-items');
      var menuIcon = document.getElementById('menu-icon');
      if (items) items.classList.remove('show');
      if (menuIcon) {
        var src = menuIcon.getAttribute('src') || '';
        if (/x\.png/i.test(src)) {
          menuIcon.setAttribute('src', src.replace(/x\.png/i, 'menu.png'));
        } else if (src.indexOf('menu.png') === -1) {
          menuIcon.setAttribute('src', '_external/img.icons8.com/ios-filled/50/menu.png');
        }
        menuIcon.style.transform = '';
      }
    } catch (e) {}
  }

  function makeChatButton(openChat, extraClass) {
    var chatBtn = el('a', 'btn et-chat-fab' + (extraClass ? ' ' + extraClass : ''));
    chatBtn.href = '#';
    chatBtn.title = 'Чат з Оленою';
    chatBtn.setAttribute('aria-label', 'Відкрити чат');
    if (extraClass && String(extraClass).indexOf('et-chat-fab--mobile') !== -1) {
      chatBtn.innerHTML = chatIconSvg() + '<span class="et-chat-fab-label">Чат з оператором</span>';
    } else {
      chatBtn.innerHTML = '<img class="et-chat-fab-avatar" src="' + operatorPhotoUrl() + '" alt="Олена" width="55" height="55">';
    }
    chatBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (typeof window.__eurotourTrackLead === 'function') {
          window.__eurotourTrackLead({
            type: 'contact_live_chat',
            channel: 'live_chat',
            path: (location.pathname || '/') + (location.search || ''),
            title: document.title || ''
          });
        }
      } catch (errLead) {}
      openChat(true);
      closeFloatingMenu();
      // закрити мобільне меню якщо відкрите
      try {
        var mob = document.querySelector('.header__mobile.header__mobile-active');
        var burger = document.querySelector('.header__burger, .burger, #menu-icon-mobile, .menu-trigger');
        if (mob) mob.classList.remove('header__mobile-active');
        document.body.classList.remove('menu-open', 'overflow-hidden');
      } catch (err) {}
    });
    return chatBtn;
  }

  function integrateFloatingMenu(openChat) {
    var menu = document.getElementById('floating-menu');
    if (!menu) return false;
    var items = menu.querySelector('.menu-items');
    if (!items) return false;

    try {
      var oldBtns = document.querySelectorAll('.et-livechat__btn');
      Array.prototype.forEach.call(oldBtns, function (b) { b.remove(); });
    } catch (e0) {}

    Array.prototype.forEach.call(items.querySelectorAll('a.phone, a[href^="tel:"], a.btn.viber, a.viber, a[href*="viber"]'), function (n) {
      try { n.remove(); } catch (e0) {}
    });

    var row = items.querySelector('.et-social-row');
    if (!row) {
      row = el('div', 'et-social-row');
    }

    var tg = items.querySelector('a.btn.telegram, a.btn.js-telegram-link, a.telegram, a.js-telegram-link');
    var wa = items.querySelector('a.btn.whatsapp, a.whatsapp');

    if (!tg) {
      tg = el('a', 'btn telegram js-telegram-link');
      tg.innerHTML = '<img src="/_external/img.icons8.com/ios-filled/50/telegram.png" alt="Telegram">';
    }
    tg.href = 'https://t.me/eurotour_eu';
    tg.title = 'Telegram';
    tg.target = '_blank';
    tg.rel = 'noopener noreferrer';
    tg.classList.add('js-telegram-link');

    if (!wa) {
      wa = el('a', 'btn whatsapp');
      wa.innerHTML = waIconSvg();
    }
    wa.href = 'https://wa.me/eurotour_eu';
    wa.title = 'WhatsApp';
    wa.target = '_blank';
    wa.rel = 'noopener noreferrer';
    wa.classList.add('btn', 'whatsapp');

    // порядок: кругле фото оператора зверху → Telegram + WhatsApp
    var chatBtn = items.querySelector('.et-chat-fab:not(.et-chat-fab--mobile)');
    if (!chatBtn) chatBtn = makeChatButton(openChat, '');

    // зібрати блок зверху
    if (items.firstChild !== chatBtn) {
      items.insertBefore(chatBtn, items.firstChild);
    }
    if (chatBtn.nextSibling !== row) {
      if (chatBtn.nextSibling) items.insertBefore(row, chatBtn.nextSibling);
      else items.appendChild(row);
    }

    if (tg && tg.parentElement !== row) row.appendChild(tg);
    if (wa && wa.parentElement !== row) row.appendChild(wa);

    // чат НЕ в ряду месенджерів
    if (chatBtn.parentElement === row) {
      items.insertBefore(chatBtn, row);
    }

    wireMessengerLinks(row);
    return true;
  }

  function integrateMobileBurgerChat(openChat) {
    var boxes = document.querySelectorAll('.header__mobile-contacts, .header__mobile-wrapper-down.header__mobile-contacts');
    if (!boxes.length) return false;
    Array.prototype.forEach.call(boxes, function (box) {
      if (box.querySelector('.et-chat-fab--mobile')) return;
      var btn = makeChatButton(openChat, 'et-chat-fab--mobile');
      // після соц-ряду або в кінець блоку контактів
      var social = box.querySelector('.contacts-body-sec__social-row');
      if (social && social.parentElement === box) {
        if (social.nextSibling) box.insertBefore(btn, social.nextSibling);
        else box.appendChild(btn);
      } else {
        box.appendChild(btn);
      }
    });
    return true;
  }

  function buildUI() {
    if (document.getElementById('et-livechat')) return;

    var root = el('div', 'et-livechat');
    root.id = 'et-livechat';

    var panel = el('div', 'et-livechat__panel');
    panel.setAttribute('hidden', '');

    var head = el('div', 'et-livechat__head');
    var avWrap = el('div', 'et-livechat__avatar-wrap');
    var img = document.createElement('img');
    img.className = 'et-livechat__avatar';
    img.src = operatorPhotoUrl();
    img.alt = OPERATOR_NAME;
    img.width = 48;
    img.height = 48;
    img.decoding = 'async';
    img.loading = 'eager';
    avWrap.appendChild(img);
    avWrap.appendChild(el('span', 'et-livechat__online-dot'));

    var headText = el('div', 'et-livechat__head-text');
    headText.appendChild(el('div', 'et-livechat__title', OPERATOR_NAME));
    headText.appendChild(el('div', 'et-livechat__role', 'Консультант · онлайн 24/7'));

    var close = el('button', 'et-livechat__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрити');

    head.appendChild(avWrap);
    head.appendChild(headText);
    head.appendChild(close);

    var msgs = el('div', 'et-livechat__msgs');
    msgs.id = 'et-livechat-msgs';

    var form = el('form', 'et-livechat__form');
    var input = el('textarea', 'et-livechat__input');
    input.rows = 1;
    input.placeholder = 'Ваше повідомлення…';
    input.maxLength = 500;
    var send = el('button', 'et-livechat__send', 'Надіслати');
    send.type = 'submit';
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(head);
    panel.appendChild(msgs);
    panel.appendChild(form);
    root.appendChild(panel);
    document.body.appendChild(root);

    function setOpen(v) {
      open = !!v;
      var fab = document.querySelector('#floating-menu .et-chat-fab');
      var menu = document.getElementById('floating-menu');
      if (v) {
        panel.removeAttribute('hidden');
        root.classList.add('et-livechat--open');
        if (menu) menu.classList.add('et-chat-open');
        if (fab) fab.classList.remove('et-chat-fab--badge');
        input.focus();
        pollNow();
      } else {
        panel.setAttribute('hidden', '');
        root.classList.remove('et-livechat--open');
        if (menu) menu.classList.remove('et-chat-open');
        closeFloatingMenu();
      }
    }

    close.addEventListener('click', function () {
      setOpen(false);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (input.value || '').trim();
      if (!text || sending) return;
      sendMessage(text, input, send);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    // вітальне повідомлення оператора (локально, один раз на сесію UI)
    if (!msgs.children.length) {
      appendMsg(
        {
          id: -1,
          role: 'operator',
          text: 'Вітаю! Підкажу щодо квитків і маршрутів — напишіть ваше питання.'
        },
        msgs
      );
    }

    afterId = loadAfter();
    integrateFloatingMenu(setOpen);
    integrateMobileBurgerChat(setOpen);
    wireMessengerLinks(document);
    setTimeout(function () {
      integrateFloatingMenu(setOpen);
      integrateMobileBurgerChat(setOpen);
      wireMessengerLinks(document);
    }, 800);
    startPolling();

    // експорт на випадок зовнішнього виклику
    window.__eurotourOpenChat = function () {
      setOpen(true);
    };
    window.__eurotourCloseChat = function () {
      setOpen(false);
    };
  }

  function appendMsg(m, box) {
    if (!box) box = document.getElementById('et-livechat-msgs');
    if (!box || !m || m.id == null) return;
    if (box.querySelector('[data-id="' + m.id + '"]')) return;
    var row = el('div', 'et-livechat__msg et-livechat__msg--' + (m.role === 'operator' ? 'op' : 'me'));
    row.setAttribute('data-id', String(m.id));
    var bubble = el('div', 'et-livechat__bubble', m.text || '');
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    if (m.role === 'operator' && m.id > 0 && !open) {
      var fab = document.querySelector('#floating-menu .et-chat-fab');
      if (fab) fab.classList.add('et-chat-fab--badge');
    }
  }

  function applyMessages(list) {
    if (!Array.isArray(list)) return;
    var max = afterId;
    list.forEach(function (m) {
      appendMsg(m);
      if (m.id > max) max = m.id;
    });
    if (max > afterId) saveAfter(max);
  }

  function pollNow() {
    var sid = getSession();
    var url =
      absUrl('/api/chat/poll') +
      '?session=' +
      encodeURIComponent(sid) +
      '&after=' +
      encodeURIComponent(String(afterId));
    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.ok) applyMessages(d.messages || []);
      })
      .catch(function () {});
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      pollNow();
    }, open ? 2000 : 12000);
    pollNow();
  }

  function sendMessage(text, input, sendBtn) {
    sending = true;
    sendBtn.disabled = true;
    var sid = getSession();
    fetch(absUrl('/api/chat/send'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        session: sid,
        text: text,
        path: (location.pathname || '/') + (location.search || ''),
        title: document.title || '',
        host: location.host || ''
      })
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.ok) {
          input.value = '';
          applyMessages(d.messages || []);
        } else {
          alert('Не вдалося надіслати. Спробуйте ще раз.');
        }
      })
      .catch(function () {
        alert('Помилка мережі. Спробуйте ще раз.');
      })
      .finally(function () {
        sending = false;
        sendBtn.disabled = false;
      });
  }

  function boot() {
    buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
