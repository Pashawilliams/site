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

  /* ---------------- Chat entry (separate page chat.html) ---------------- */
  var CHAT_URL = 'chat.html';
  var unread = 0; try { unread = parseInt(localStorage.getItem('et_chat_unread') || '0', 10) || 0; } catch (e) {}
  var lastSeenId = ''; try { lastSeenId = localStorage.getItem('et_chat_last') || ''; } catch (e) {}
  var hasChat = false; try { hasChat = JSON.parse(localStorage.getItem('et_chat_hist2') || localStorage.getItem('et_chat_hist') || '[]').some(function (m) { return m.dir === 'out'; }); } catch (e) {}

  var root = document.createElement('div');
  root.id = 'et-chat';
  root.innerHTML =
    '<a class="et-chat__fab" href="' + CHAT_URL + '" aria-label="Онлайн-чат з менеджером">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<span class="et-chat__badge" hidden>0</span>' +
      '<span class="et-chat__tip">Онлайн-чат</span>' +
    '</a>';
  function mount() {
    document.body.appendChild(root);
    var badge = root.querySelector('.et-chat__badge'), fab = root.querySelector('.et-chat__fab');
    function setUnread(n) { unread = n; badge.hidden = !n; badge.textContent = n > 9 ? '9+' : n; try { localStorage.setItem('et_chat_unread', String(n)); } catch (e) {} if (n) fab.classList.add('is-pulse'); }
    setUnread(unread);
    window.siteChatOpen = function () { location.href = CHAT_URL; };
    // count replies that arrive while the visitor browses the site
    if (hasChat && window.EventSource) {
      var seenIds = {};
      try {
        var es = new EventSource(NTFY + REPLY_TOPIC + '/sse?since=' + encodeURIComponent(lastSeenId || '5m'));
        es.onmessage = function (ev) {
          try {
            var d = JSON.parse(ev.data);
            if (d.event !== 'message' || !d.id || d.id === lastSeenId || seenIds[d.id]) return;
            seenIds[d.id] = 1;
            var p = {}; try { p = JSON.parse(d.message || '{}'); } catch (e) { p = { text: d.message }; }
            if (p.text || d.attachment || p.joined) setUnread(unread + 1);
          } catch (e) {}
        };
      } catch (e) {}
    }
    // sync badge when the chat page (other tab) marks read
    window.addEventListener('storage', function (e) { if (e.key === 'et_chat_unread') setUnread(parseInt(e.newValue || '0', 10) || 0); });
    setTimeout(function () { fab.classList.add('is-in'); }, 600);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
