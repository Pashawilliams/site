/*!
 * Eurotour Site Data Synchronizer
 * Loads data/site.json and dynamically hydrates all DOM elements:
 * - Hero (title, subtitle)
 * - Advantages (icon list)
 * - Contacts (phone, telegram, whatsapp, header note)
 * - Routes (sync existing cards, generate dynamic cards, handle badges, old prices, visibility)
 * - Reviews (slider elements with star ratings)
 * - FAQ (featured + general list with accordion interaction)
 * - Announcements banner (with close toggle)
 * - Maintenance mode overlay
 */
(function () {
  'use strict';

  var DATA_URL = 'data/site.json';
  var POLL_INTERVAL = 30000; // 30s poll for live admin updates

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtPhone(p) {
    var d = String(p || '').replace(/\D+/g, '');
    return d.length === 12
      ? '+' + d.slice(0, 3) + ' ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8, 10) + ' ' + d.slice(10)
      : (p || '');
  }

  function digits(s) {
    return String(s || '').replace(/\D+/g, '');
  }

  /* ------------------------------------------------ Hero */
  function applyHero(h) {
    if (!h) return;
    if (h.title) {
      document.querySelectorAll('.front-sec__title, .hero__title, h1.main-title, .hero-content h1').forEach(function (el) {
        el.textContent = h.title;
      });
    }
    if (h.subtitle) {
      document.querySelectorAll('.front-sec__subtitle, .hero__subtitle, .hero-content p, .front-sec__desc').forEach(function (el) {
        el.textContent = h.subtitle;
      });
    }
  }

  /* ------------------------------------------------ Advantages */
  function applyAdvantages(list) {
    if (!Array.isArray(list) || !list.length) return;
    
    // Main advantages section (.advantages-sec__icon-container)
    var container = document.querySelector('.advantages-sec__icon-container, .advantages__list, .et-advantages');
    if (container) {
      var existingItems = container.querySelectorAll('.advantages-sec__wrapper, .advantage__item');
      if (existingItems.length > 0) {
        var defaultIcons = [
          'images/ad-ico-1.svg', 'images/ad-ico-2.svg', 'images/ad-ico-3.svg', 'images/ad-ico-4.svg',
          'images/ad-ico-5.svg', 'images/ad-ico-6.svg', 'images/ad-ico-7.svg', 'images/ad-ico-8.svg',
          'images/ad-ico-9.svg', 'images/ad-ico-10.svg'
        ];
        
        container.innerHTML = list.map(function (txt, idx) {
          var iconSrc = defaultIcons[idx % defaultIcons.length];
          return '<div class="advantages-sec__wrapper">' +
            '<div class="advantages-sec__icon"><img class="advantages-sec__icon-img" src="' + iconSrc + '" alt=""></div>' +
            '<div class="advantages-sec__icon-text">' + esc(txt) + '</div>' +
            '</div>';
        }).join('');
      }
    }
  }

  /* ------------------------------------------------ Contacts */
  function applyContacts(c) {
    if (!c) return;
    var phone = c.phone || '+380966973130';
    var phoneDisp = c.phone_display || fmtPhone(phone);
    var d = digits(phone);
    var tg = c.telegram || 'https://t.me/pereviznyk_support';
    var wa = c.whatsapp || ('https://wa.me/' + d);
    var note = c.support_note || 'Щоденні рейси Україна ⇄ Європа';

    document.querySelectorAll('a[href^="tel:"]:not([data-mgr-direct])').forEach(function (a) {
      a.href = 'tel:+' + d;
      var hasIcon = a.querySelector('svg, img, i');
      if (!hasIcon && a.textContent.trim().length > 3) {
        a.textContent = phoneDisp;
      }
    });

    document.querySelectorAll('.header__phone, .footer__phone, .header-phone-val').forEach(function (el) {
      el.textContent = phoneDisp;
      if (el.tagName === 'A') el.href = 'tel:+' + d;
    });

    document.querySelectorAll('a[href*="t.me"]:not([data-mgr-direct]), a[href*="telegram.me"]:not([data-mgr-direct])').forEach(function (a) {
      if (!/t\.me\/[\w_]*bot(\b|$)/i.test(a.href)) {
        a.href = tg;
      }
    });

    document.querySelectorAll('a[href*="wa.me"]:not([data-mgr-direct]), a[href*="whatsapp.com"]:not([data-mgr-direct])').forEach(function (a) {
      a.href = wa;
    });

    document.querySelectorAll('.header__note, .header__work-time, .support-note').forEach(function (el) {
      el.textContent = note;
    });
  }

  /* ------------------------------------------------ Routes */
  function applyRoutes(routes) {
    if (!Array.isArray(routes) || !routes.length) return;

    var container = document.querySelector('.direction-sec__wrapper, .routes-list, .directions-grid');
    var existingCards = document.querySelectorAll('.direction-element');
    var matchedRoutes = new Set();

    existingCards.forEach(function (card) {
      var fromEl = card.querySelector('.direction-from, [data-from]');
      var toEl = card.querySelector('.direction-to, [data-to]');
      if (!fromEl || !toEl) return;
      var f = (fromEl.getAttribute('data-from') || fromEl.textContent).trim().toLowerCase();
      var t = (toEl.getAttribute('data-to') || toEl.textContent).trim().toLowerCase();

      var r = routes.find(function (x) {
        return (x.from || '').trim().toLowerCase() === f && (x.to || '').trim().toLowerCase() === t;
      });

      if (!r) {
        // Check reverse route
        r = routes.find(function (x) {
          return (x.from || '').trim().toLowerCase() === t && (x.to || '').trim().toLowerCase() === f;
        });
      }

      if (r) {
        matchedRoutes.add(r);
        // Visibility
        if (r.visible === false) {
          card.style.display = 'none';
        } else {
          card.style.display = '';
        }

        // Badge
        var badgeEl = card.querySelector('.direction-badge, .direction-element__badge, [data-badge]');
        if (r.badge) {
          if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.className = 'direction-element__badge';
            card.insertBefore(badgeEl, card.firstChild);
          }
          badgeEl.textContent = r.badge;
          badgeEl.style.display = '';
        } else if (badgeEl) {
          badgeEl.style.display = 'none';
        }

        // Price manual override
        if (r.price) {
          var priceEl = card.querySelector('.cost-number, .direction-price, [data-price-val]');
          if (priceEl) {
            priceEl.textContent = String(r.price).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
          }
        }
        if (r.old_price) {
          var oldPriceEl = card.querySelector('.direction-element__old-cost, .old-price, [data-old-price]');
          if (!oldPriceEl) {
            oldPriceEl = document.createElement('span');
            oldPriceEl.className = 'direction-element__old-cost';
            var pNode = card.querySelector('.cost-number, .direction-price');
            if (pNode && pNode.parentNode) {
              pNode.parentNode.insertBefore(oldPriceEl, pNode);
            }
          }
          if (oldPriceEl) {
            oldPriceEl.textContent = String(r.old_price).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн';
            oldPriceEl.style.display = '';
          }
        }
      }
    });

    // Dynamically add route cards for any new routes not present in static markup
    if (container) {
      routes.forEach(function (r) {
        if (!r || !r.from || !r.to || r.visible === false) return;
        if (matchedRoutes.has(r)) return;

        var card = document.createElement('div');
        card.className = 'direction-element direction-element--dynamic';
        card.innerHTML =
          (r.badge ? '<div class="direction-element__badge">' + esc(r.badge) + '</div>' : '') +
          '<div class="direction-element__wrapper">' +
          '<div class="direction-col">' +
          '<h3 class="direction-city direction-from" data-from="' + esc(r.from) + '">' + esc(r.from) + '</h3>' +
          '<p class="direction-sub">Центральний автовокзал</p>' +
          '</div>' +
          '<div class="direction-arrow">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</div>' +
          '<div class="direction-col">' +
          '<h3 class="direction-city direction-to" data-to="' + esc(r.to) + '">' + esc(r.to) + '</h3>' +
          '<p class="direction-sub">Автовокзал</p>' +
          '</div>' +
          '</div>' +
          '<div class="direction-element__bottom">' +
          '<div class="direction-cost">' +
          (r.old_price ? '<span class="direction-element__old-cost">' + esc(r.old_price) + ' грн</span>' : '') +
          '<span class="cost-val">від <b class="cost-number">' + esc(r.price || '—') + '</b> грн</span>' +
          '</div>' +
          '<a class="btnV3 order-open-btn" href="#lead-modal" data-from="' + esc(r.from) + '" data-to="' + esc(r.to) + '">Замовити</a>' +
          '</div>';
        container.appendChild(card);
      });
    }

    if (window.__eurotourPricing && typeof window.__eurotourPricing.applyToCards === 'function') {
      window.__eurotourPricing.applyToCards();
    }
  }

  /* ------------------------------------------------ Reviews */
  function applyReviews(reviews) {
    if (!Array.isArray(reviews) || !reviews.length) return;
    var slider = document.querySelector('.reviews-sec__slider, #reviews .slider, .reviews__list');
    if (!slider) return;

    var starSvg = '<svg width="18" height="17" viewBox="0 0 18 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.04894 0.927049C8.3483 0.00573802 9.6517 0.00574017 9.95106 0.927051L11.2451 4.90983C11.379 5.32185 11.763 5.60081 12.1962 5.60081H16.3839C17.3527 5.60081 17.7554 6.84043 16.9717 7.40983L13.5838 9.87132C13.2333 10.126 13.0866 10.5773 13.2205 10.9894L14.5146 14.9721C14.8139 15.8934 13.7595 16.6596 12.9757 16.0902L9.58778 13.6287C9.2373 13.374 8.7627 13.374 8.41221 13.6287L5.02426 16.0902C4.24054 16.6596 3.18607 15.8934 3.48542 14.9721L4.7795 10.9894C4.91338 10.5773 4.7667 10.126 4.41622 9.87132L1.02827 7.40983C0.244563 6.84043 0.647285 5.60081 1.61609 5.60081H5.80379C6.23703 5.60081 6.62099 5.32185 6.75487 4.90983L8.04894 0.927049Z" fill="#FFA800"/></svg>';

    slider.innerHTML = reviews.map(function (r) {
      var starsCount = Math.max(1, Math.min(5, parseInt(r.stars || 5, 10)));
      var starsHtml = '';
      for (var s = 0; s < starsCount; s++) starsHtml += starSvg;
      var initChar = (r.name || '?').trim().charAt(0).toUpperCase();

      return '<div class="reviews-sec__slider-element">' +
        '<div class="reviews-sec__slider-element-wrapper">' +
        '<p class="reviews-sec__text">' + esc(r.text) + '</p>' +
        '<div class="reviews-sec__data-row">' +
        '<div class="reviews-sec__name-wrapper">' +
        '<p class="reviews-sec__name" data-initial="' + esc(initChar) + '">' + esc(r.name) + '</p>' +
        '<p class="reviews-sec__date">' + esc(r.date || '') + '</p>' +
        '</div>' +
        '<div class="reviews-sec__star-row">' + starsHtml + '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ------------------------------------------------ FAQ */
  function applyFaq(faqList) {
    if (!Array.isArray(faqList) || !faqList.length) return;
    var wrapper = document.querySelector('.faq-sec__wrapper, .faq__container, #faq .container');
    if (!wrapper) return;

    var first = faqList[0];
    var rest = faqList.slice(1);

    var html = '<div class="faq-sec__col-small">' +
      '<div class="faq-sec__elementV1">' +
      '<h3 class="faq-sec__title">' + esc(first.q) + '</h3>' +
      '<p class="faq-sec__text">' + esc(first.a) + '</p>' +
      '</div></div>' +
      '<div class="faq-sec__col-big">' +
      rest.map(function (f) {
        return '<div class="faq-sec__elementV2">' +
          '<h3 class="faq-sec__elementV2-title">' + esc(f.q) + '</h3>' +
          '<p class="faq-sec__elementV2-subtitle">' + esc(f.a) + '</p>' +
          '</div>';
      }).join('') +
      '</div>';

    wrapper.innerHTML = html;
  }

  // Delegated accordion click handler for FAQ items
  document.addEventListener('click', function (e) {
    var faqHeader = e.target.closest('.faq-sec__elementV2-title, .faq-sec__elementV1 .faq-sec__title');
    if (!faqHeader) return;
    var parent = faqHeader.closest('.faq-sec__elementV2, .faq-sec__elementV1');
    if (parent) {
      parent.classList.toggle('is-active');
    }
  });

  /* ------------------------------------------------ Announcement */
  function applyAnnouncement(ann) {
    var bar = document.getElementById('et-announcement');
    if (!ann || !ann.enabled || !ann.text) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'et-announcement';
      bar.className = 'et-announcement';
      document.body.insertBefore(bar, document.body.firstChild);
    }
    var linkHtml = ann.link && ann.link !== '-' ? ' <a href="' + esc(ann.link) + '" target="_blank" rel="noopener noreferrer">Детальніше &rarr;</a>' : '';
    bar.innerHTML = '<div class="et-announcement__content">' + esc(ann.text) + linkHtml + '</div>' +
      '<button type="button" class="et-announcement__close" aria-label="Закрити">&times;</button>';
    
    var closeBtn = bar.querySelector('.et-announcement__close');
    if (closeBtn) {
      closeBtn.onclick = function () { bar.style.display = 'none'; };
    }
  }

  /* ------------------------------------------------ Maintenance Mode */
  function applyMaintenance(isMaint) {
    var existing = document.getElementById('et-maintenance');
    if (isMaint) {
      if (!existing) {
        var modal = document.createElement('div');
        modal.id = 'et-maintenance';
        modal.className = 'et-maintenance-overlay';
        modal.innerHTML = '<div class="et-maintenance-box">' +
          '<h2>🛠 Технічні роботи</h2>' +
          '<p>На сайті триває планове оновлення. Ми повернемося через кілька хвилин!</p>' +
          '<p>Для термінового бронювання зв\'яжіться з менеджером:</p>' +
          '<a class="btnV2" href="tel:+380966973130">+380 96 697 31 30</a>' +
          '</div>';
        document.body.appendChild(modal);
        document.body.classList.add('is-maintenance');
      }
    } else {
      if (existing) existing.remove();
      document.body.classList.remove('is-maintenance');
      document.querySelectorAll('.et-maintenance-overlay, .et-maint').forEach(function (el) { el.remove(); });
    }
  }

  /* ------------------------------------------------ Main Hydration */
  function applyData(data) {
    if (!data) return;
    try { applyHero(data.hero); } catch (e) { console.warn('applyHero error', e); }
    try { applyAdvantages(data.advantages); } catch (e) { console.warn('applyAdvantages error', e); }
    try { applyContacts(data.contacts); } catch (e) { console.warn('applyContacts error', e); }
    try { applyRoutes(data.routes); } catch (e) { console.warn('applyRoutes error', e); }
    try { applyReviews(data.reviews); } catch (e) { console.warn('applyReviews error', e); }
    try { applyFaq(data.faq); } catch (e) { console.warn('applyFaq error', e); }
    try { applyAnnouncement(data.site && data.site.announcement); } catch (e) { console.warn('applyAnnouncement error', e); }
    try { applyMaintenance(data.site && data.site.maintenance); } catch (e) { console.warn('applyMaintenance error', e); }

    document.dispatchEvent(new CustomEvent('site:data', { detail: data }));
  }

  function fetchData() {
    fetch(DATA_URL + '?v=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        applyData(data);
      })
      .catch(function (err) {
        console.warn('site-data sync fallback:', err);
      });
  }

  // Initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchData);
  } else {
    fetchData();
  }

  // Periodic polling
  setInterval(fetchData, POLL_INTERVAL);

  window.__eurotourSync = {
    fetchData: fetchData,
    applyData: applyData
  };
})();
