/* Eurotour — menu actions: anchors, route prefill, popups, details */
(function () {
  function openPopup(name) {
    var trig = document.createElement('button');
    trig.className = 'air-open-btn'; trig.setAttribute('data-popup-current', name); trig.style.display = 'none';
    document.body.appendChild(trig); trig.click(); setTimeout(function () { trig.remove(); }, 0);
  }
  function closeMobile() {
    var m = document.querySelector('.header__mobile.header__mobile-active');
    if (m) { var b = document.querySelector('.burger'); if (b) b.click(); }
  }
  function scrollToId(id) {
    var el = document.getElementById(id); if (!el) return;
    var top = el.getBoundingClientRect().top + window.pageYOffset - 84;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }
  function setSelect(sel, val) {
    if (!sel) return false;
    var ok = Array.prototype.some.call(sel.options, function (o) { return o.value === val; });
    if (!ok) return false;
    sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }
  function prefillRoute(fromId, toId) {
    var from = document.getElementById('search-from'), to = document.getElementById('search-to');
    var swap = document.getElementById('search-swap');
    if (!setSelect(from, fromId) && swap) { swap.click(); setSelect(from, fromId); }
    setSelect(to, toId);
    scrollToId('main-search-route');
    var box = document.querySelector('#main-search-route .search, #main-search-route .front-sec__search');
    if (box) { box.classList.add('et-flash'); setTimeout(function () { box.classList.remove('et-flash'); }, 1600); }
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-popup], a[data-route], a[data-action], a[data-details], a[href^="#"]');
    if (!a) return;
    if (a.closest('.menu-item-has-children') && a.parentElement.classList.contains('menu-item-has-children') && window.innerWidth <= 985) return; // mobile submenu toggler handled elsewhere
    if (a.dataset.popup) { e.preventDefault(); closeMobile(); openPopup(a.dataset.popup); return; }
    if (a.dataset.route) { e.preventDefault(); closeMobile(); var p = a.dataset.route.split('|'); prefillRoute(p[0], p[1]); return; }
    if (a.dataset.action === 'all-routes') { e.preventDefault(); closeMobile(); var s = document.getElementById('direction-show-all'); if (s && !s.hidden) s.click(); scrollToId('routes'); return; }
    if (a.dataset.details !== undefined) {
      e.preventDefault();
      var card = a.closest('.direction-element');
      var fromN = card ? card.getAttribute('data-from-name') : '', toN = card ? card.getAttribute('data-to-name') : '';
      var price = card ? (card.querySelector('.direction-element__price') || {}).textContent : '';
      var msg = 'Вітаю! Цікавить рейс ' + fromN + ' – ' + toN + (price ? ' (' + price.trim() + ')' : '') + '. Підкажіть, будь ласка, деталі.';
      window.open('https://wa.me/380973452025?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      return;
    }
    var href = a.getAttribute('href');
    if (href && href.length > 1 && href.charAt(0) === '#' && document.getElementById(href.slice(1))) {
      e.preventDefault(); closeMobile(); scrollToId(href.slice(1));
      history.replaceState(null, '', href);
    }
  });
  // highlight current section in menu
  var ids = ['routes', 'services', 'advantages', 'reviews', 'faq', 'contacts'];
  function spy() {
    var y = window.pageYOffset + 140, cur = 'top';
    ids.forEach(function (id) { var el = document.getElementById(id); if (el && el.offsetTop <= y) cur = id; });
    document.querySelectorAll('.header__nav-list > li').forEach(function (li) {
      var a = li.querySelector(':scope > a'); if (!a) return;
      li.classList.toggle('current-menu-item', (a.getAttribute('href') || '') === '#' + cur);
    });
  }
  window.addEventListener('scroll', spy, { passive: true }); document.addEventListener('DOMContentLoaded', spy);
})();
