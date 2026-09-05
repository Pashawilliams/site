/* Eurotour live chat (standalone page). Transport: ntfy.sh pub/sub.
   visitor → INBOX topic (JSON or file+meta); bot → INBOX-r-<sid> topic. */
(function () {
  'use strict';
  var NTFY = 'https://ntfy.sh/';
  var CFG = window.__SITE_BRIDGE || {};
  var INBOX = CFG.inbox;
  var $ = function (id) { return document.getElementById(id); };
  var el = { list: $('list'), body: $('body'), form: $('form'), inp: $('inp'), send: $('send'), name: $('name'), nameRow: $('nameRow'), quick: $('quick'),
    status: $('status'), dot: $('dot'), title: $('title'), ava: $('ava'), menu: $('menu'), menuBtn: $('menuBtn'), closeBtn: $('closeBtn'), back: $('back'),
    file: $('file'), attach: $('attach'), strip: $('strip'), jump: $('jump'), jumpN: $('jumpN'), offline: $('offline'), toast: $('toast'),
    lightbox: $('lightbox'), lbImg: $('lbImg'), lbDl: $('lbDl'), lbClose: $('lbClose') };
  if (!INBOX) { el.list.innerHTML = '<div class="ch__sys">Чат тимчасово недоступний</div>'; return; }

  /* ---------- identity & storage ---------- */
  var K = { sid: 'et_chat_sid', hist: 'et_chat_hist2', name: 'et_chat_name', last: 'et_chat_last', mgr: 'et_chat_mgr', unread: 'et_chat_unread' };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function rid(n) { var a = new Uint8Array(n || 8); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  var SID = ls(K.sid); if (!SID) { SID = rid(8); ls(K.sid, SID); }
  var TOPIC_IN = INBOX + '-r-' + SID;
  var hist = []; try { hist = JSON.parse(ls(K.hist) || '[]'); } catch (e) {}
  // migrate from old widget history
  if (!hist.length) { try { var old = JSON.parse(ls('et_chat_hist') || '[]'); if (old.length) { hist = old.map(function (m) { return { id: rid(4), dir: m.dir, text: m.text, ts: m.ts, sent: true, seen: !!m.seen, auto: !!m.auto }; }); } } catch (e) {} }
  var visitorName = ls(K.name) || '';
  var lastId = ls(K.last) || '';
  var manager = null; try { manager = JSON.parse(ls(K.mgr) || 'null'); } catch (e) {}
  var ended = false;
  function save() { ls(K.hist, JSON.stringify(hist.slice(-150))); }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'; }); }
  function pad(n) { return ('0' + n).slice(-2); }
  function fmtTime(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayLabel(ts) {
    var d = new Date(ts), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
    if (dayKey(ts) === dayKey(now)) return 'Сьогодні'; if (dayKey(ts) === dayKey(y)) return 'Вчора';
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  }
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : b > 1024 ? Math.round(b / 1024) + ' КБ' : b + ' Б'; }
  function ext(name) { var m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toUpperCase() : 'FILE'; }
  function toast(t) { el.toast.textContent = t; el.toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.toast.hidden = true; }, 2600); }
  function meta() { return { sid: SID, page: document.referrer || location.href, ua: navigator.userAgent.slice(0, 120), lang: navigator.language, ts: new Date().toISOString(), name: visitorName }; }
  function atBottom() { return el.body.scrollHeight - el.body.scrollTop - el.body.clientHeight < 80; }
  function scrollBottom(force) { if (force || atBottom()) { el.body.scrollTop = el.body.scrollHeight; el.jump.hidden = true; unseenBelow = 0; } }
  var unseenBelow = 0, stick = true;

  /* ---------- rendering ---------- */
  function bubble(m) {
    var out = m.dir === 'out';
    var html = '';
    if (m.att) {
      if (m.att.image && (m.att.thumb || m.att.url)) {
        html += '<a class="ch__img" href="' + esc(m.att.url || m.att.thumb) + '" data-lb="' + esc(m.att.url || m.att.thumb) + '"><img src="' + esc(m.att.thumb || m.att.url) + '" alt="' + esc(m.att.name || 'фото') + '" loading="lazy"></a>';
      } else {
        html += '<a class="ch__file" href="' + esc(m.att.url || '#') + '" target="_blank" rel="noopener" ' + (m.att.url ? 'download' : '') + '><span class="ch__file-ic">' + esc(ext(m.att.name)) + '</span><span class="ch__file-t"><b>' + esc(m.att.name || 'Файл') + '</b><small>' + (m.att.size ? esc(fmtSize(m.att.size)) : '') + (m.att.expired ? ' · термін зберігання минув' : '') + '</small>' + (m.uploading ? '<span class="ch__progress"><i style="width:' + (m.progress || 0) + '%"></i></span>' : '') + '</span></a>';
      }
    }
    if (m.text) html += '<div class="ch__bub">' + linkify(m.text) + '</div>';
    var tick = '';
    if (out) tick = m.failed ? '<i class="ch__tick ch__tick--fail" data-retry="' + m.id + '">не надіслано · повторити</i>' : m.seen ? '<i class="ch__tick ch__tick--seen">✓✓</i>' : m.sent ? '<i class="ch__tick">✓</i>' : '<i class="ch__tick">🕓</i>';
    var from = (!out && m.by) ? '<div class="ch__from">' + esc(m.by) + '</div>' : '';
    return '<div class="ch__msg ch__msg--' + (out ? 'out' : 'in') + (m.auto ? ' ch__msg--auto' : '') + '" data-id="' + m.id + '">' + from + html + '<div class="ch__meta"><span>' + fmtTime(m.ts) + '</span>' + tick + '</div></div>';
  }
  function sysRow(m) {
    if (m.type === 'join') return '<div class="ch__sys ch__sys--join"><span class="ch__sys-av">' + esc((m.by || 'M').charAt(0).toUpperCase()) + '</span><span>Менеджер <b>' + esc(m.by || '') + '</b> приєднався до чату</span></div>';
    if (m.type === 'end') return '<div class="ch__sys ch__sys--end">Діалог завершено · напишіть, якщо залишились питання</div>';
    return '<div class="ch__sys">' + esc(m.text || '') + '</div>';
  }
  function render() {
    var html = '', lastDay = '', prev = null;
    if (!hist.length) {
      html += '<div class="ch__day">Сьогодні</div>' + bubble({ id: 'hello', dir: 'in', ts: Date.now(), text: 'Вітаємо! 👋 Напишіть ваше питання, надішліть фото чи документ (до 2 МБ) — менеджер відповість тут протягом кількох хвилин.' });
    }
    hist.forEach(function (m) {
      var dk = dayKey(m.ts);
      if (dk !== lastDay) { html += '<div class="ch__day">' + dayLabel(m.ts) + '</div>'; lastDay = dk; prev = null; }
      if (m.sys) { html += sysRow(m); prev = null; return; }
      var b = bubble(m);
      if (prev && prev.dir === m.dir && !prev.sys && m.by === prev.by && m.ts - prev.ts < 120000) b = b.replace('class="ch__msg ', 'class="ch__msg ch__grp ');
      html += b; prev = m;
    });
    var t = el.list.querySelector('.ch__typing');
    el.list.innerHTML = html;
    if (t) el.list.appendChild(t);
    el.quick.hidden = hist.some(function (m) { return m.dir === 'out'; });
    el.nameRow.hidden = !!visitorName || hist.some(function (m) { return m.dir === 'out'; }) && !!visitorName;
  }
  function appendMsg(m) {
    hist.push(m); save();
    render();
    if (stick || m.dir === 'out') { stick = true; scrollBottom(true); } else { unseenBelow++; el.jumpN.textContent = unseenBelow; el.jumpN.hidden = false; el.jump.hidden = false; }
  }
  function setStatus(text, online) {
    el.status.innerHTML = '<span>' + esc(text) + '</span>';
    if (online != null) el.dot.classList.toggle('is-off', !online);
  }
  function applyManager() {
    if (manager && manager.name) {
      el.title.textContent = manager.name;
      el.ava.innerHTML = '<span class="ch__letter">' + esc(manager.name.charAt(0).toUpperCase()) + '</span><i class="ch__dot" id="dot"></i>'; el.dot = $('dot');
      setStatus(ended ? 'Діалог завершено' : 'Менеджер Eurotour · онлайн', !ended);
    } else {
      el.title.textContent = 'Eurotour';
      el.ava.innerHTML = '<img src="images/cropped-apple-touch-icon-192x192.png" alt=""><i class="ch__dot" id="dot"></i>'; el.dot = $('dot');
      setStatus('Онлайн-чат · менеджер на звʼязку', true);
    }
  }

  /* ---------- transport ---------- */
  function publishJson(obj) {
    return fetch(NTFY + INBOX, { method: 'POST', body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json', 'Title': obj.kind || 'event' } }).then(function (r) { if (r.status === 429 && obj.kind === 'chat') toast('Забагато повідомлень поспіль — зачекайте хвилину'); return r.ok; }).catch(function () { return false; });
  }
  function b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function publishFile(file, obj, onProgress) {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      x.open('PUT', NTFY + INBOX, true);
      x.setRequestHeader('Title', 'chat');
      x.setRequestHeader('Filename', file.name || ('photo-' + Date.now() + '.jpg'));
      x.setRequestHeader('Message', '=?UTF-8?B?' + b64utf8(JSON.stringify(obj)) + '?=');
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) {} if (x.status === 413) toast('Файл завеликий (макс. 2 МБ)'); else if (x.status === 429) toast('Ліміт надсилання файлів — спробуйте за кілька хвилин'); resolve(x.status >= 200 && x.status < 300 ? (r || {}) : null); };
      x.onerror = function () { resolve(null); };
      x.send(file);
    });
  }
  var lastTyping = 0;
  function sendTyping() { var n = Date.now(); if (n - lastTyping < 4000) return; lastTyping = n; publishJson(Object.assign({ kind: 'chat_typing' }, meta())); }

  var es = null, reconnectT = null;
  function connect() {
    if (es) { try { es.close(); } catch (e) {} }
    var since = lastId || '24h';
    es = new EventSource(NTFY + TOPIC_IN + '/sse?since=' + encodeURIComponent(since));
    es.onopen = function () { el.offline.hidden = true; };
    es.onmessage = function (ev) {
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.event !== 'message') return;
      if (d.id && d.id === lastId) return;
      var p = {}; try { p = JSON.parse(d.message || '{}'); } catch (e) { p = { text: d.message }; }
      if (d.attachment) p.attachment = d.attachment;
      handleIncoming(p, d.id, d.time ? d.time * 1000 : Date.now());
    };
    es.onerror = function () { /* auto-reconnect by browser */ };
  }
  function markId(id) { if (id) { lastId = id; ls(K.last, id); } }
  function handleIncoming(p, id, ts) {
    if (p.typing) { showTyping(true); return; }
    if (p.seen) { hist.forEach(function (m) { if (m.dir === 'out') m.seen = true; }); save(); render(); return; }
    markId(id);
    if (p.joined) {
      manager = { name: p.joined }; ls(K.mgr, JSON.stringify(manager)); ended = false; applyManager();
      appendMsg({ id: id || rid(4), sys: true, type: 'join', by: p.joined, ts: ts }); return;
    }
    if (p.ended) {
      ended = true; applyManager();
      appendMsg({ id: id || rid(4), sys: true, type: 'end', ts: ts }); return;
    }
    if (p.text || p.attachment) {
      showTyping(false);
      hist.forEach(function (m) { if (m.dir === 'out') m.seen = true; });
      var m = { id: id || rid(4), dir: 'in', text: p.text || '', ts: ts, by: p.by || (manager && manager.name) || '', auto: !!p.auto };
      if (p.by && (!manager || manager.name !== p.by)) { manager = { name: p.by }; ls(K.mgr, JSON.stringify(manager)); ended = false; applyManager(); }
      if (p.attachment) {
        m.att = { name: p.attachment.name, size: p.attachment.size, url: p.attachment.url, image: /^image\//.test(p.attachment.type || '') };
        if (m.att.image) cacheThumb(p.attachment.url, m);
      }
      appendMsg(m);
      if (document.hidden) { notify(m.by || 'Менеджер', m.text || 'Надіслав файл'); }
    }
  }
  function cacheThumb(url, m) {
    // keep a small thumbnail locally: ntfy attachments expire after a few hours
    var img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = function () {
      try { var c = document.createElement('canvas'), s = Math.min(1, 480 / Math.max(img.width, img.height)); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); m.att.thumb = c.toDataURL('image/jpeg', .8); save(); render(); } catch (e) {}
    };
    img.src = url;
  }
  var typingT = null;
  function showTyping(on) {
    var t = el.list.querySelector('.ch__typing');
    if (!on) { if (t) t.remove(); if (typingT) { clearTimeout(typingT); typingT = null; } applyManager(); return; }
    if (!t) { t = document.createElement('div'); t.className = 'ch__msg ch__msg--in ch__typing'; t.innerHTML = '<div class="ch__bub"><span></span><span></span><span></span></div>'; el.list.appendChild(t); scrollBottom(); }
    setStatus('друкує…', true);
    clearTimeout(typingT); typingT = setTimeout(function () { showTyping(false); }, 12000);
  }
  function notify(title, body) {
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body, icon: 'images/cropped-apple-touch-icon-192x192.png' }); } catch (e) {}
    document.title = '● ' + title + ' — нове повідомлення';
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) document.title = 'Онлайн-чат — Eurotour'; });

  /* ---------- sending ---------- */
  var pendingFiles = [];
  function renderStrip() {
    el.strip.hidden = !pendingFiles.length;
    el.strip.innerHTML = pendingFiles.map(function (f, i) {
      return '<div class="ch__att' + (f.ready ? '' : ' is-busy') + '">' + (f.preview ? '<img src="' + f.preview + '" alt="">' : esc(ext(f.file.name))) + '<button type="button" data-rm="' + i + '" aria-label="Прибрати">✕</button></div>';
    }).join('');
    updateSend();
  }
  var MAX_FILE = 2 * 1048576; // ntfy attachment limit
  function compressImage(file, maxSide, q) {
    return new Promise(function (res) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var s = Math.min(1, maxSide / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (bl) { URL.revokeObjectURL(u); if (!bl) return res(file); var nm = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg'; res(new File([bl], nm, { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', q);
        } catch (e) { URL.revokeObjectURL(u); res(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(file); };
      img.src = u;
    });
  }
  function prepare(file) {
    if (/^image\/(jpeg|png|webp|heic|heif|bmp|gif)$/i.test(file.type) && file.size > 600 * 1024) {
      return compressImage(file, 1600, .82).then(function (f) { return f.size > MAX_FILE ? compressImage(f, 1200, .7) : f; });
    }
    return Promise.resolve(file);
  }
  function addFiles(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (pendingFiles.length >= 5) { toast('Не більше 5 файлів за раз'); return; }
      if (!/^image\//.test(file.type) && file.size > MAX_FILE) { toast('Файл завеликий (макс. 2 МБ): ' + file.name); return; }
      var item = { file: file, preview: null, ready: false };
      pendingFiles.push(item); renderStrip();
      prepare(file).then(function (f) {
        if (f.size > MAX_FILE) { toast('Фото завелике навіть після стиснення'); pendingFiles.splice(pendingFiles.indexOf(item), 1); renderStrip(); return; }
        item.file = f; item.ready = true;
        if (/^image\//.test(f.type)) { var r = new FileReader(); r.onload = function () { item.preview = r.result; renderStrip(); }; r.readAsDataURL(f); } else renderStrip();
      });
    });
    renderStrip();
  }
  function updateSend() { el.send.disabled = !(el.inp.value.trim() || (pendingFiles.length && pendingFiles.every(function (f) { return f.ready; }))); }
  function thumbFromFile(file) {
    return new Promise(function (res) {
      if (!/^image\//.test(file.type)) return res(null);
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { try { var c = document.createElement('canvas'), s = Math.min(1, 480 / Math.max(img.width, img.height)); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .8)); } catch (e) { res(null); } URL.revokeObjectURL(u); };
      img.onerror = function () { res(null); };
      img.src = u;
    });
  }
  function firstOut() { return !hist.some(function (m) { return m.dir === 'out'; }); }
  function sendText(text) {
    var m = { id: rid(4), dir: 'out', text: text, ts: Date.now() };
    var payload = Object.assign({ kind: 'chat', text: text, mid: m.id, first: firstOut() }, meta());
    appendMsg(m);
    return publishJson(payload).then(function (ok) { m.sent = ok; m.failed = !ok; m.payload = ok ? null : payload; save(); render(); if (!ok) el.offline.hidden = navigator.onLine; });
  }
  function sendFile(item, caption) {
    var file = item.file;
    var m = { id: rid(4), dir: 'out', text: caption || '', ts: Date.now(), uploading: true, progress: 0, att: { name: file.name, size: file.size, image: /^image\//.test(file.type), thumb: item.preview } };
    appendMsg(m);
    thumbFromFile(file).then(function (th) { if (th) { m.att.thumb = th; save(); render(); } });
    var payload = Object.assign({ kind: 'chat', text: caption || '', mid: m.id, first: firstOut(), file: { name: file.name, size: file.size, type: file.type } }, meta());
    return publishFile(file, payload, function (p) { m.progress = p; var bar = el.list.querySelector('[data-id="' + m.id + '"] .ch__progress i'); if (bar) bar.style.width = p + '%'; }).then(function (r) {
      m.uploading = false;
      if (r) { m.sent = true; if (r.attachment) m.att.url = r.attachment.url; } else { m.failed = true; toast('Не вдалося надіслати файл'); }
      save(); render();
    });
  }
  function submit() {
    var text = el.inp.value.trim();
    if (!text && !pendingFiles.length) return;
    if (el.name && el.name.value.trim()) { visitorName = el.name.value.trim().slice(0, 40); ls(K.name, visitorName); }
    el.inp.value = ''; el.inp.style.height = ''; updateSend();
    var files = pendingFiles.slice(); pendingFiles = []; renderStrip();
    if (files.length) {
      files.forEach(function (f, i) { sendFile(f, i === 0 ? text : ''); });
    } else sendText(text);
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
    connect();
  }
  el.form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  el.inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) { e.preventDefault(); submit(); } });
  el.inp.addEventListener('input', function () { el.inp.style.height = 'auto'; el.inp.style.height = Math.min(el.inp.scrollHeight, 140) + 'px'; updateSend(); if (el.inp.value.trim()) sendTyping(); });
  el.quick.addEventListener('click', function (e) { var b = e.target.closest('button[data-q]'); if (!b) return; el.inp.value = b.getAttribute('data-q'); submit(); });
  el.attach.addEventListener('click', function () { el.file.click(); });
  el.file.addEventListener('change', function () { addFiles(el.file.files); el.file.value = ''; el.inp.focus(); });
  el.strip.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) { pendingFiles.splice(+b.getAttribute('data-rm'), 1); renderStrip(); } });
  document.addEventListener('paste', function (e) { var items = e.clipboardData && e.clipboardData.files; if (items && items.length) { addFiles(items); e.preventDefault(); } });
  ['dragenter', 'dragover'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); document.body.classList.add('ch__drop'); }); });
  ['dragleave', 'drop'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); document.body.classList.remove('ch__drop'); if (t === 'drop' && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }); });
  el.list.addEventListener('click', function (e) {
    var lb = e.target.closest('[data-lb]');
    if (lb) { e.preventDefault(); el.lbImg.src = lb.getAttribute('data-lb'); el.lbDl.href = lb.getAttribute('href'); el.lightbox.hidden = false; return; }
    var rt = e.target.closest('[data-retry]');
    if (rt) { var id = rt.getAttribute('data-retry'); var m = hist.filter(function (x) { return x.id === id; })[0]; if (m && m.payload) { m.failed = false; render(); publishJson(m.payload).then(function (ok) { m.sent = ok; m.failed = !ok; if (ok) m.payload = null; save(); render(); }); } else if (m) { toast('Надішліть файл ще раз'); } }
  });
  el.lbClose.addEventListener('click', function () { el.lightbox.hidden = true; });
  el.lightbox.addEventListener('click', function (e) { if (e.target === el.lightbox) el.lightbox.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { el.lightbox.hidden = true; el.menu.hidden = true; } });
  el.body.addEventListener('scroll', function () { stick = atBottom(); if (stick) { el.jump.hidden = true; unseenBelow = 0; } }, { passive: true });
  // images load after render and grow the list → keep pinned to the bottom
  el.list.addEventListener('load', function (e) { if (e.target.tagName === 'IMG' && stick) scrollBottom(true); }, true);
  el.jump.addEventListener('click', function () { stick = true; });
  el.jump.addEventListener('click', function () { scrollBottom(true); });

  /* ---------- menu / close ---------- */
  function goBack() { if (document.referrer && document.referrer.indexOf(location.host) !== -1 && history.length > 1) history.back(); else location.href = 'index.html'; }
  el.closeBtn.addEventListener('click', goBack);
  el.back.addEventListener('click', function (e) { e.preventDefault(); goBack(); });
  el.menuBtn.addEventListener('click', function () { el.menu.hidden = !el.menu.hidden; el.menuBtn.setAttribute('aria-expanded', String(!el.menu.hidden)); });
  document.addEventListener('click', function (e) { if (!e.target.closest('#menu, #menuBtn')) el.menu.hidden = true; });
  el.menu.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return; el.menu.hidden = true;
    var act = b.getAttribute('data-act');
    if (act === 'tg') { window.open('https://t.me/pereviznyk_support', '_blank', 'noopener'); }
    if (act === 'name') { el.nameRow.hidden = false; el.name.value = visitorName; el.name.focus(); }
    if (act === 'end') { if (confirm('Завершити діалог з менеджером?')) { publishJson(Object.assign({ kind: 'chat_end' }, meta())); ended = true; appendMsg({ id: rid(4), sys: true, type: 'end', ts: Date.now() }); applyManager(); } }
    if (act === 'clear') { if (confirm('Очистити історію чату на цьому пристрої?')) { hist = []; save(); manager = null; ls(K.mgr, null); ended = false; applyManager(); render(); scrollBottom(true); } }
  });
  el.name.addEventListener('change', function () { visitorName = el.name.value.trim().slice(0, 40); ls(K.name, visitorName); if (visitorName) { toast('Дякуємо, ' + visitorName + '!'); el.nameRow.hidden = true; publishJson(Object.assign({ kind: 'chat_name' }, meta())); } });
  window.addEventListener('online', function () { el.offline.hidden = true; connect(); hist.forEach(function (m) { if (m.failed && m.payload) { m.failed = false; publishJson(m.payload).then(function (ok) { m.sent = ok; m.failed = !ok; if (ok) m.payload = null; save(); render(); }); } }); });
  window.addEventListener('offline', function () { el.offline.hidden = false; });
  // keep composer visible above the on-screen keyboard (iOS)
  if (window.visualViewport) { var vv = window.visualViewport; var fix = function () { document.documentElement.style.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px'); $('app').style.height = vv.height + 'px'; scrollBottom(); }; vv.addEventListener('resize', fix); vv.addEventListener('scroll', fix); }

  /* ---------- boot ---------- */
  applyManager(); render(); scrollBottom(true);
  ls(K.unread, '0');
  if (!navigator.onLine) el.offline.hidden = false;
  connect();
  publishJson(Object.assign({ kind: 'chat_open' }, meta()));
  el.inp.focus({ preventScroll: true });
  window.__chat = { hist: function () { return hist; }, sid: SID };
})();
