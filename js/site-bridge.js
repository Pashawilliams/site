/* Bridge: site → Telegram bot (leads + live chat) via ntfy.sh pub/sub.
   The bot subscribes to INBOX topic; replies to a visitor arrive on a per-visitor topic. */
(function () {
  'use strict';
  var NTFY = 'https://ntfy.sh/';
  var CFG = window.__SITE_BRIDGE || {};
  var INBOX = CFG.inbox;            // secret topic name (from data/site.json -> bridge.inbox)
  if (!INBOX) return;

  var SID_KEY = 'et_chat_sid';
  var HIST_KEY = 'et_chat_hist';
  var NAME_KEY = 'et_chat_name';

  function rid() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function sid() {
    var s = null;
    try { s = localStorage.getItem(SID_KEY); } catch (e) {}
    if (!s) { s = rid(); try { localStorage.setItem(SID_KEY, s); } catch (e) {} }
    return s;
  }
  var SESSION = sid();
  var REPLY_TOPIC = INBOX + '-r-' + SESSION;

  function publish(obj) {
    var body = JSON.stringify(obj);
    return fetch(NTFY + INBOX, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json', 'Title': obj.kind || 'event' }, keepalive: true })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  function baseMeta() {
    return {
      sid: SESSION,
      page: location.href,
      ua: navigator.userAgent.slice(0, 120),
      lang: navigator.language,
      ts: new Date().toISOString(),
      ref: document.referrer || ''
    };
  }

  /* ---------------- Leads ---------------- */
  window.siteBridgeLead = function (lead) {
    var payload = Object.assign({ kind: 'lead' }, baseMeta(), { lead: lead || {} });
    // remember locally so a page reload doesn't lose it
    try {
      var q = JSON.parse(localStorage.getItem('et_lead_queue') || '[]');
      q.push(payload); localStorage.setItem('et_lead_queue', JSON.stringify(q.slice(-10)));
    } catch (e) {}
    return publish(payload).then(function (ok) {
      if (ok) { try { var q2 = JSON.parse(localStorage.getItem('et_lead_queue') || '[]'); q2 = q2.filter(function (x) { return x.ts !== payload.ts; }); localStorage.setItem('et_lead_queue', JSON.stringify(q2)); } catch (e) {} }
      return ok;
    });
  };
  // retry queued leads
  try {
    var pending = JSON.parse(localStorage.getItem('et_lead_queue') || '[]');
    pending.forEach(function (p) { publish(p); });
    if (pending.length) localStorage.setItem('et_lead_queue', '[]');
  } catch (e) {}

  /* ---------------- Chat widget ---------------- */
  var hist = [];
  try { hist = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) {}
  var visitorName = '';
  try { visitorName = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
  var lastSeenId = '';
  try { lastSeenId = localStorage.getItem('et_chat_last') || ''; } catch (e) {}
  var unread = 0, open = false, es = null;

  function saveHist() { try { localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(-100))); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtTime(ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  var root = document.createElement('div');
  root.id = 'et-chat';
  root.innerHTML =
    '<button type="button" class="et-chat__fab" aria-label="Онлайн-чат">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<span class="et-chat__badge" hidden>0</span>' +
    '</button>' +
    '<div class="et-chat__win" hidden>' +
      '<div class="et-chat__head"><div><div class="et-chat__title">Онлайн-чат</div><div class="et-chat__sub"><span class="et-chat__dot"></span>Менеджер на звʼязку</div></div>' +
        '<button type="button" class="et-chat__close" aria-label="Закрити">✕</button></div>' +
      '<div class="et-chat__body"></div>' +
      '<div class="et-chat__quick"><button type="button" data-q="Хочу забронювати місце. Підкажіть вільні дати?">Забронювати</button><button type="button" data-q="Скільки коштує проїзд і що входить у ціну?">Ціна</button><button type="button" data-q="Чи можна доставити посилку?">Посилка</button><button type="button" data-q="Потрібен трансфер з аеропорту">Трансфер</button></div>' +
      '<form class="et-chat__form"><input class="et-chat__name" type="text" placeholder="Ваше імʼя (необовʼязково)" maxlength="40">' +
        '<div class="et-chat__row"><textarea class="et-chat__inp" rows="1" placeholder="Напишіть повідомлення…" maxlength="1000" required></textarea>' +
        '<button type="submit" class="et-chat__send" aria-label="Надіслати"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button></div>' +
        '<div class="et-chat__hint">Відповідь прийде сюди, або напишіть у <a class="et-chat__tg" href="#" target="_blank" rel="noopener">Telegram</a></div></form>' +
    '</div>';

  function mount() {
    document.body.appendChild(root);
    var fab = root.querySelector('.et-chat__fab'), win = root.querySelector('.et-chat__win'), body = root.querySelector('.et-chat__body');
    var form = root.querySelector('.et-chat__form'), inp = root.querySelector('.et-chat__inp'), nameInp = root.querySelector('.et-chat__name');
    var badge = root.querySelector('.et-chat__badge');
    var tgLink = root.querySelector('.et-chat__tg');
    if (window.__siteContacts && window.__siteContacts.telegram) tgLink.href = window.__siteContacts.telegram;
    document.addEventListener('site:data', function (e) { if (e.detail && e.detail.contacts && e.detail.contacts.telegram) tgLink.href = e.detail.contacts.telegram; });
    nameInp.value = visitorName;

    function render() {
      if (!hist.length) {
        body.innerHTML = '<div class="et-chat__msg et-chat__msg--in"><div>Вітаємо! 👋 Напишіть ваше питання — менеджер відповість тут протягом кількох хвилин.</div><time>' + fmtTime(Date.now()) + '</time></div>';
      } else {
        body.innerHTML = hist.map(function (m) {
          return '<div class="et-chat__msg et-chat__msg--' + (m.dir === 'in' ? 'in' : 'out') + '"><div>' + esc(m.text) + '</div><time>' + fmtTime(m.ts) + '</time></div>';
        }).join('');
      }
      body.scrollTop = body.scrollHeight;
    }
    function setUnread(n) { unread = n; badge.hidden = !n; badge.textContent = n; }
    function toggle(state) {
      open = state == null ? !open : state;
      win.hidden = !open; fab.classList.toggle('is-open', open);
      if (open) { setUnread(0); render(); setTimeout(function () { inp.focus(); }, 50); connect(); }
    }
    fab.addEventListener('click', function () { toggle(); });
    root.querySelectorAll('.et-chat__quick button').forEach(function (b) {
      b.addEventListener('click', function () { inp.value = b.getAttribute('data-q'); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); });
    });
    function hideQuick() { var q = root.querySelector('.et-chat__quick'); if (q) q.hidden = hist.some(function (m) { return m.dir === 'out'; }); }
    root.querySelector('.et-chat__close').addEventListener('click', function () { toggle(false); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); } });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = inp.value.trim();
      if (!text) return;
      visitorName = nameInp.value.trim().slice(0, 40);
      try { localStorage.setItem(NAME_KEY, visitorName); } catch (err) {}
      var m = { dir: 'out', text: text, ts: Date.now() };
      hist.push(m); saveHist(); render(); hideQuick();
      inp.value = ''; inp.style.height = '';
      if (!root.querySelector('.et-chat__typing')) { var t = document.createElement('div'); t.className = 'et-chat__msg et-chat__msg--in et-chat__typing'; t.innerHTML = '<div><span></span><span></span><span></span></div>'; body.appendChild(t); body.scrollTop = body.scrollHeight; setTimeout(function () { if (t.parentNode) t.remove(); }, 12000); }
      publish(Object.assign({ kind: 'chat' }, baseMeta(), { name: visitorName, text: text, first: hist.filter(function (x) { return x.dir === 'out'; }).length === 1 })).then(function (ok) {
        if (!ok) { hist.push({ dir: 'in', text: '⚠️ Не вдалося надіслати. Спробуйте ще раз або напишіть у Telegram.', ts: Date.now() }); saveHist(); render(); }
      });
    });

    function onReply(text, id) {
      if (id && id === lastSeenId) return;
      var tp = root.querySelector('.et-chat__typing'); if (tp) tp.remove();
      if (id) { lastSeenId = id; try { localStorage.setItem('et_chat_last', id); } catch (e) {} }
      hist.push({ dir: 'in', text: text, ts: Date.now() }); saveHist();
      if (open) render(); else { setUnread(unread + 1); fab.classList.add('is-pulse'); }
      try { if (!open && 'Notification' in window && Notification.permission === 'granted') new Notification('Відповідь менеджера', { body: text }); } catch (e) {}
    }

    function connect() {
      if (es) return;
      try {
        var since = lastSeenId ? lastSeenId : '24h';
        es = new EventSource(NTFY + REPLY_TOPIC + '/sse?since=' + encodeURIComponent(since));
        es.onmessage = function (ev) {
          try {
            var d = JSON.parse(ev.data);
            if (d.event === 'message' && d.message) {
              var payload; try { payload = JSON.parse(d.message); } catch (e) { payload = { text: d.message }; }
              if (payload && payload.text) onReply(payload.text, d.id);
            }
          } catch (e) {}
        };
        es.onerror = function () { /* EventSource auto-reconnects */ };
      } catch (e) { es = null; }
    }
    // connect in background if a conversation exists (to catch replies while closed)
    if (hist.some(function (m) { return m.dir === 'out'; })) connect();
    render(); hideQuick();
    inp.addEventListener('input', function () { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px'; });
    window.siteChatOpen = function () { toggle(true); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
