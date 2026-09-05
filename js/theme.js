/* Eurotour — theme toggle, reveal-on-scroll, back-to-top */
(function () {
  var KEY = 'et-theme';
  var link = document.getElementById('et-dark-css');
  var link2 = document.getElementById('et-dark-css-2');
  var html = document.documentElement;

  function apply() { html.setAttribute('data-theme', 'light'); try { localStorage.removeItem(KEY); } catch (e) {} }
  function current() { return 'light'; }

  document.addEventListener('DOMContentLoaded', function () {
    // Back to top
    var top = document.createElement('button');
    top.className = 'et-to-top';
    top.type = 'button';
    top.setAttribute('aria-label', 'Догори');
    top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(top);
    var onScroll = function () { top.classList.toggle('is-visible', window.scrollY > 600); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Direction cards: move action buttons out of the price column
    function fixCards(root) {
      (root || document).querySelectorAll('.direction-element').forEach(function (card) {
        var btns = card.querySelector('.direction-element__buttons');
        if (btns && !btns.classList.contains('et-card-actions')) {
          btns.classList.add('et-card-actions');
          card.appendChild(btns);
        }
      });
    }
    fixCards();
    var cardsRoot = document.querySelector('.direction-sec__direction') || document.body;
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function (muts) { if (muts.some(function (m) { return m.addedNodes.length; })) fixCards(cardsRoot); });
      mo.observe(cardsRoot, { childList: true, subtree: false });
    }

    // Reveal on scroll
    var targets = document.querySelectorAll(
      '.advantages-sec__icon-container, .faq-sec__elementV1, .faq-sec__elementV2, .banenr-sec__info, .banenr-sec__form'
    );
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      targets.forEach(function (el, i) {
        el.classList.add('et-reveal');
        
        io.observe(el);
      });
    }

    apply(current());
  });

  // Apply early to avoid flash
  apply(current());
})();
