/* Eurotour — theme toggle, reveal-on-scroll, back-to-top */
(function () {
  var KEY = 'et-theme';
  var link = document.getElementById('et-dark-css');
  var html = document.documentElement;

  function apply(theme) {
    var dark = theme !== 'light';
    if (link) link.disabled = !dark;
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b0d14' : '#ffffff');
    var btn = document.querySelector('.et-theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', dark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему');
      btn.title = btn.getAttribute('aria-label');
      btn.querySelector('.ico-sun').style.display = dark ? 'block' : 'none';
      btn.querySelector('.ico-moon').style.display = dark ? 'none' : 'block';
    }
  }

  function current() {
    try { return localStorage.getItem(KEY) || 'dark'; } catch (e) { return 'dark'; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Theme toggle button
    var btn = document.createElement('button');
    btn.className = 'et-theme-toggle';
    btn.type = 'button';
    btn.innerHTML =
      '<svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>' +
      '<svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    btn.addEventListener('click', function () {
      var next = current() === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });
    document.body.appendChild(btn);

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

    // Reveal on scroll
    var targets = document.querySelectorAll(
      '.direction-element, .advantages-sec__icon-container, .reviews-sec__slider-element, .faq-sec__elementV1, .faq-sec__elementV2, .banenr-sec__info, .banenr-sec__form'
    );
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      targets.forEach(function (el, i) {
        el.classList.add('et-reveal');
        el.style.transitionDelay = (i % 4) * 60 + 'ms';
        io.observe(el);
      });
    }

    apply(current());
  });

  // Apply early to avoid flash
  apply(current());
})();
