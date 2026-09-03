/*! Локальная валидация + выбор способа покупки (статическая копия Eurotour) */
(function () {
  'use strict';

  var SUCCESS_SVG =
    '<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 12C4 7.58172 7.58172 4 12 4H52C56.4183 4 60 7.58172 60 12V52C60 56.4183 56.4183 60 52 60H12C7.58172 60 4 56.4183 4 52V12Z" fill="#00D26A"/>' +
    '<path d="M26.484 46C25.7176 46 24.9513 45.7132 24.3659 45.1383L12.8771 33.8556C11.7076 32.7071 11.7076 30.844 12.8771 29.6955C14.0466 28.547 15.9437 28.547 17.1132 29.6955L26.484 38.8982L46.8868 18.8614C48.0563 17.7129 49.9534 17.7129 51.1229 18.8614C52.2924 20.0099 52.2924 21.873 51.1229 23.0215L28.602 45.1383C28.0179 45.7132 27.2503 46 26.484 46Z" fill="#F4F4F4"/>' +
    '</svg>';

  function assetPrefix() {
    var s = document.getElementById('eurotour-local-forms-js');
    if (!s || !s.getAttribute('src')) return './';
    var src = s.getAttribute('src');
    return src.replace(/js\/local-forms\.js.*$/, '');
  }

  function digitsPhone(v) {
    return String(v || '').replace(/\D+/g, '');
  }

  var PHONE_COUNTRIES = [
    { code: '+380', label: 'UA +380', iso: '380', len: 12 },
    { code: '+48', label: 'PL +48', iso: '48', len: 11 },
    { code: '+49', label: 'DE +49', iso: '49', min: 11, max: 14 },
    { code: '+420', label: 'CZ +420', iso: '420', min: 12, max: 12 },
    { code: '+421', label: 'SK +421', iso: '421', min: 12, max: 12 },
    { code: '+36', label: 'HU +36', iso: '36', min: 11, max: 12 },
    { code: '+43', label: 'AT +43', iso: '43', min: 12, max: 13 },
    { code: '+40', label: 'RO +40', iso: '40', min: 11, max: 12 },
    { code: '+373', label: 'MD +373', iso: '373', min: 11, max: 11 },
    { code: '+33', label: 'FR +33', iso: '33', min: 11, max: 12 },
    { code: '+39', label: 'IT +39', iso: '39', min: 11, max: 13 },
    { code: '+31', label: 'NL +31', iso: '31', min: 11, max: 12 },
    { code: '+32', label: 'BE +32', iso: '32', min: 11, max: 12 },
    { code: '+41', label: 'CH +41', iso: '41', min: 11, max: 12 },
    { code: '+370', label: 'LT +370', iso: '370', min: 11, max: 11 },
    { code: '+371', label: 'LV +371', iso: '371', min: 11, max: 11 },
    { code: '+372', label: 'EE +372', iso: '372', min: 10, max: 11 },
  ];

  function stripPhoneInputMask(el) {
    if (!el) return;
    try {
      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.inputmask) {
        window.jQuery(el).inputmask('remove');
      }
    } catch (err) {}
    try {
      if (el.inputmask && typeof el.inputmask.remove === 'function') {
        el.inputmask.remove();
      }
    } catch (err2) {}
  }

  function phoneCountryMeta(code) {
    var cc = digitsPhone(code || '+380');
    for (var i = 0; i < PHONE_COUNTRIES.length; i++) {
      if (PHONE_COUNTRIES[i].iso === cc) return PHONE_COUNTRIES[i];
    }
    return null;
  }

  function phoneNationalMax(meta) {
    if (!meta) return 9;
    if (meta.len) return meta.len - meta.iso.length;
    if (meta.max) return meta.max - meta.iso.length;
    return 10;
  }

  function formatNationalPhone(d, meta) {
    if (meta && meta.iso === '380') {
      var parts = [];
      if (d.length > 0) parts.push(d.slice(0, 2));
      if (d.length > 2) parts.push(d.slice(2, 5));
      if (d.length > 5) parts.push(d.slice(5, 7));
      if (d.length > 7) parts.push(d.slice(7, 9));
      return parts.join(' ');
    }
    return d;
  }

  function clampPhoneNationalValue(el, countryCode) {
    var meta = phoneCountryMeta(countryCode || '+380');
    var max = phoneNationalMax(meta);
    var d = digitsPhone(el.value).replace(/^0+/, '');
    if (d.length > max) d = d.slice(0, max);
    el.value = formatNationalPhone(d, meta);
    el.setAttribute('maxlength', String(meta && meta.iso === '380' ? max + 3 : max));
  }

  function bindPhoneInputGuard(el, sel) {
    if (el.dataset.etPhoneGuard === '1') return;
    el.dataset.etPhoneGuard = '1';
    el.addEventListener('input', function () {
      clampPhoneNationalValue(el, sel.value);
    });
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text') || '';
      el.value = text;
      clampPhoneNationalValue(el, sel.value);
    });
    clampPhoneNationalValue(el, sel.value);
  }

  function getPhoneFieldValue(el) {
    if (!el) return '';
    var wrap = el.closest('.et-phone-intl');
    if (!wrap) return String(el.value || '').trim();
    var sel = wrap.querySelector('.et-phone-intl__country');
    var cc = sel ? String(sel.value || '+380').trim() : '+380';
    var national = String(el.value || '').trim();
    if (national.indexOf('+') === 0) return national;
    var ccD = digitsPhone(cc);
    var nD = digitsPhone(national).replace(/^0+/, '');
    if (!nD) return '';
    return '+' + ccD + nD;
  }

  function setPhoneFieldValue(el, value) {
    if (!el) return;
    var v = String(value || '').trim();
    var wrap = el.closest('.et-phone-intl');
    if (!wrap) {
      el.value = v;
      return;
    }
    var sel = wrap.querySelector('.et-phone-intl__country');
    if (!v) {
      el.value = '';
      return;
    }
    if (v.charAt(0) === '+') {
      var d = digitsPhone(v);
      var matched = false;
      PHONE_COUNTRIES.forEach(function (c) {
        if (matched) return;
        if (d.indexOf(c.iso) === 0) {
          sel.value = c.code;
          el.value = d.slice(c.iso.length).replace(/^0+/, '');
          matched = true;
        }
      });
      if (!matched) el.value = v;
      return;
    }
    el.value = v;
  }

  function bindInternationalPhone(el) {
    if (!el || el.closest('.et-phone-intl')) return;
    if (el.type !== 'tel' && !el.classList.contains('phone-input') && !el.classList.contains('wpcf7-validates-as-tel')) {
      return;
    }
    if (el.dataset.etIntlPhone === '1' && el.closest('.inp-form--intl-phone')) {
      var row = el.closest('.inp-form');
      if (row && !row.querySelector('.inp-form__icon-wrapper')) return;
      el.dataset.etIntlPhone = '0';
    }

    el.dataset.etIntlPhone = '1';
    stripPhoneInputMask(el);

    var formRow = el.closest('.inp-form');
    var searchWrap = el.closest('.search__input-wrapper');
    var host = formRow
      ? formRow.querySelector('.inp-form__inp-wrapper')
      : searchWrap || el.closest('.delivery-form__phone-field') || el.parentElement;
    if (!host) return;

    if (formRow) {
      formRow.classList.add('inp-form--intl-phone');
      var iconWrap = formRow.querySelector('.inp-form__icon-wrapper');
      if (iconWrap) iconWrap.remove();
    }

    var oldWrap = el.closest('.et-phone-intl');
    if (oldWrap) {
      oldWrap.parentNode.insertBefore(el, oldWrap);
      oldWrap.remove();
    }

    host.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'et-phone-intl';

    var sel = document.createElement('select');
    sel.className = 'et-phone-intl__country';
    sel.setAttribute('aria-label', 'Код країни');
    PHONE_COUNTRIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });

    var inputWrap = document.createElement('div');
    inputWrap.className = 'et-phone-intl__input';
    inputWrap.appendChild(el);
    wrap.appendChild(sel);
    wrap.appendChild(inputWrap);
    host.appendChild(wrap);

    el.classList.add('et-phone-intl__tel');
    el.classList.remove('inp-form__inp');
    el.placeholder = 'Номер телефону';
    el.setAttribute('inputmode', 'tel');
    el.setAttribute('autocomplete', 'tel-national');
    if (el.id === 'phone') {
      el.classList.add('search__input');
      el.placeholder = '512 345 678';
    }

    sel.addEventListener('change', function () {
      clampPhoneNationalValue(el, sel.value);
      markInvalid(el, false);
      if (el.id === 'phone') {
        el.placeholder = digitsPhone(sel.value) === '380' ? 'XX XXX XX XX' : 'Номер телефону';
      }
    });
    bindPhoneInputGuard(el, sel);
  }

  function initInternationalPhones(root) {
    root = root || document;
    root.querySelectorAll('input[type="tel"], .phone-input, .wpcf7-validates-as-tel').forEach(function (el) {
      var formRow = el.closest('.inp-form');
      if (formRow && !formRow.classList.contains('inp-form--intl-phone')) {
        el.dataset.etIntlPhone = '0';
      }
      stripPhoneInputMask(el);
      bindInternationalPhone(el);
    });
  }

  function disableLegacyPhoneMasks() {
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.inputmask) {
      try {
        window.jQuery('#phone, .phone-input, #input-phonefprm, .delivery-form__phone').inputmask('remove');
      } catch (err) {}
    }
    document.querySelectorAll('input[type="tel"], .phone-input, .wpcf7-validates-as-tel').forEach(stripPhoneInputMask);
  }

  function isPhoneValid(v, el) {
    var raw = el ? getPhoneFieldValue(el) : String(v || '');
    if (/[_\uFF3F]/.test(raw)) return false;
    var d = digitsPhone(raw);
    if (!d) return false;
    var meta = null;
    if (el && el.closest('.et-phone-intl')) {
      var sel = el.closest('.et-phone-intl').querySelector('.et-phone-intl__country');
      meta = phoneCountryMeta(sel ? sel.value : '+380');
    } else if (d.indexOf('380') === 0) {
      meta = phoneCountryMeta('+380');
    } else if (d.indexOf('48') === 0) {
      meta = phoneCountryMeta('+48');
    }
    if (meta) {
      if (meta.len) return d.length === meta.len;
      return d.length >= meta.min && d.length <= meta.max;
    }
    if (d.indexOf('38') === 0) return d.length === 12;
    if (d.charAt(0) === '0') return d.length === 10;
    return d.length >= 10 && d.length <= 15;
  }

  function isEmailValid(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  }

  /** ПІБ / ім'я: без цифр, перша літера кожного слова велика */
  function sanitizePersonName(v) {
    var cleaned = String(v || '').replace(/[0-9]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned.replace(/(^|[\s\-'])(\S)/g, function (_, sep, ch) {
      return sep + ch.toLocaleUpperCase('uk-UA');
    });
  }

  function isPersonNameValid(v) {
    var s = String(v || '').trim();
    if (!s) return false;
    if (/[0-9]/.test(s)) return false;
    return /[A-Za-zА-Яа-яЁёІіЇїЄєҐґ]/.test(s);
  }

  function bindPersonNameInput(el) {
    if (!el || el.dataset.personNameBound === '1') return;
    el.dataset.personNameBound = '1';
    el.setAttribute('inputmode', 'text');
    el.setAttribute('autocomplete', 'name');
    el.addEventListener('input', function () {
      var start = el.selectionStart;
      var before = el.value;
      var next = sanitizePersonName(before);
      if (next !== before) {
        el.value = next;
        try {
          var pos = Math.min(start, next.length);
          el.setSelectionRange(pos, pos);
        } catch (err) { /* ignore */ }
      }
    });
    el.addEventListener('blur', function () {
      el.value = sanitizePersonName(el.value).trim();
    });
  }

  function initPersonNameFields() {
    document.querySelectorAll(
      '#fullname, input[name="fullname"], ' +
      '[data-air="review-form"] input[name="text-581"], ' +
      '.popup-air[data-air="review-form"] input[type="text"]:not([type="tel"])'
    ).forEach(bindPersonNameInput);
  }

  function markInvalid(el, on, msg) {
    if (!el) return;
    el.setAttribute('aria-invalid', on ? 'true' : 'false');
    el.classList.toggle('wpcf7-not-valid', !!on);
    var wrap = el.closest('.wpcf7-form-control-wrap') || el.parentElement;
    if (!wrap) return;
    var tip = wrap.querySelector('.wpcf7-not-valid-tip');
    if (on) {
      if (!tip) {
        tip = document.createElement('span');
        tip.className = 'wpcf7-not-valid-tip';
        tip.setAttribute('aria-hidden', 'true');
        wrap.appendChild(tip);
      }
      tip.textContent = msg || 'Заповніть це поле';
    } else if (tip) {
      tip.remove();
    }
  }

  function clearFormErrors(form) {
    form.querySelectorAll('.wpcf7-not-valid-tip').forEach(function (n) { n.remove(); });
    form.querySelectorAll('[aria-invalid="true"]').forEach(function (el) {
      el.setAttribute('aria-invalid', 'false');
      el.classList.remove('wpcf7-not-valid');
    });
    var out = form.querySelector('.wpcf7-response-output');
    if (out) {
      out.textContent = '';
      out.classList.remove('wpcf7-validation-errors', 'wpcf7-mail-sent-ok');
      out.setAttribute('aria-hidden', 'true');
      out.style.display = 'none';
    }
  }

  function validateWpcf7Form(form) {
    clearFormErrors(form);
    var ok = true;
    var required = form.querySelectorAll(
      'input[aria-required="true"], textarea[aria-required="true"], select[aria-required="true"], .wpcf7-validates-as-required'
    );
    required.forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        var name = el.name;
        var group = form.querySelectorAll('[name="' + name + '"]');
        var any = Array.prototype.some.call(group, function (g) { return g.checked; });
        if (!any) {
          markInvalid(el, true);
          ok = false;
        }
        return;
      }
      if (!String(el.value || '').trim()) {
        markInvalid(el, true);
        ok = false;
      } else {
        markInvalid(el, false);
      }
    });

    var isReview = !!(form.closest('[data-air="review-form"]'));
    if (isReview) {
      form.querySelectorAll('input[name="text-581"], input[placeholder*="м\'я"], input[placeholder*="м’я"]').forEach(function (el) {
        if (el.type === 'tel') return;
        el.value = sanitizePersonName(el.value).trim();
        if (!isPersonNameValid(el.value)) {
          markInvalid(el, true, 'Ім\'я без цифр, з великої літери');
          ok = false;
        }
      });
    }

    form.querySelectorAll('input[type="tel"], .wpcf7-validates-as-tel, .phone-input').forEach(function (el) {
      var val = String(el.value || '').trim();
      var required =
        el.getAttribute('aria-required') === 'true' ||
        el.classList.contains('wpcf7-validates-as-required') ||
        el.required;
      if (!val) {
        if (required) {
          markInvalid(el, true, 'Вкажіть номер телефону');
          ok = false;
        }
        return;
      }
      if (!isPhoneValid(val, el)) {
        markInvalid(el, true, 'Введіть повний номер телефону');
        ok = false;
      } else {
        markInvalid(el, false);
      }
    });

    // ПІБ у формі бронювання
    if (isBookingForm(form)) {
      form.querySelectorAll('input[name="text-449"], input[placeholder*="ПІБ"], input[placeholder*="Ім"]').forEach(function (el) {
        if (el.type === 'tel' || el.type === 'email') return;
        el.value = sanitizePersonName(el.value).trim();
        if (!isPersonNameValid(el.value)) {
          markInvalid(el, true, 'ПІБ без цифр, з великої літери');
          ok = false;
        }
      });
    }

    form.querySelectorAll('input[type="email"], .wpcf7-validates-as-email').forEach(function (el) {
      var v = String(el.value || '').trim();
      if (!v) return;
      if (!isEmailValid(v)) {
        markInvalid(el, true, 'Введіть коректну електронну пошту');
        ok = false;
      }
    });

    var acceptance = form.querySelector('input[name="acceptance-oferta"]');
    if (acceptance && !acceptance.checked) {
      markInvalid(acceptance, true, 'Потрібно погодитись з умовами Оферти');
      ok = false;
    }

    var out = form.querySelector('.wpcf7-response-output');
    if (!ok && out) {
      out.textContent = 'Одне або кілька полів містять помилку. Будь ласка, перевірте їх і спробуйте ще раз.';
      out.classList.add('wpcf7-validation-errors');
      out.setAttribute('aria-hidden', 'false');
      out.style.display = 'block';
    }
    return ok;
  }

  var popupScrollY = 0;
  var touchLockBound = false;
  var scrollLockDocWatch = false;

  function isPopupOpen() {
    return !!document.querySelector('.air-conteiner.air-conteiner_active');
  }

  function isMobileMenuOpen() {
    return !!document.querySelector('.header__mobile.header__mobile-active');
  }

  function getScrollParent(node) {
    var el = node;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.nodeType === 1) {
        var style = window.getComputedStyle(el);
        var oy = style.overflowY;
        if (
          (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  function canScrollTouchTarget(target) {
    if (!target || !target.closest) return false;
    // Скрол лише всередині білої форми (тема: .main-form { overflow-y:auto })
    var form = target.closest('.main-form.air-popup_active');
    if (form && form.closest('.air-conteiner_active')) {
      if (form.scrollHeight > form.clientHeight + 1) return true;
      var inner = getScrollParent(target);
      if (inner && form.contains(inner)) return true;
    }
    if (target.closest('.booking-form__cal-panel.is-open')) return true;
    var mob = target.closest('.header__mobile.header__mobile-active');
    if (mob) {
      var mobScroll = getScrollParent(target);
      if (mobScroll && mob.contains(mobScroll)) return true;
    }
    return false;
  }

  function onLockTouchMove(e) {
    if (!document.documentElement.classList.contains('et-scroll-lock')) return;
    if (canScrollTouchTarget(e.target)) return;
    e.preventDefault();
  }

  function bindTouchScrollLock() {
    if (touchLockBound) return;
    touchLockBound = true;
    document.addEventListener('touchmove', onLockTouchMove, { passive: false });
    document.addEventListener(
      'wheel',
      function (e) {
        if (!document.documentElement.classList.contains('et-scroll-lock')) return;
        if (canScrollTouchTarget(e.target)) return;
        e.preventDefault();
      },
      { passive: false }
    );
  }

  function setBodyFixedLock(lock) {
    var html = document.documentElement;
    var body = document.body;
    var header = document.querySelector('.header');
    if (lock) {
      if (!html.classList.contains('et-scroll-lock')) {
        popupScrollY = window.scrollY || window.pageYOffset || 0;
        var sbw = window.innerWidth - html.clientWidth;
        html.classList.add('et-scroll-lock');
        // Фіксуємо body на місці — без overflow:hidden (він скидає scroll і дає ривок)
        body.style.position = 'fixed';
        body.style.top = '-' + popupScrollY + 'px';
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';
        if (sbw > 0) {
          body.style.paddingRight = sbw + 'px';
          if (header) header.style.paddingRight = sbw + 'px';
        }
      }
      bindTouchScrollLock();
    } else if (html.classList.contains('et-scroll-lock')) {
      html.classList.remove('et-scroll-lock');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.paddingRight = '';
      if (header) header.style.paddingRight = '';
      window.scrollTo(0, popupScrollY);
    }
  }

  function syncPopupScrollLock() {
    var popupOpen = isPopupOpen();
    var menuOpen = isMobileMenuOpen();
    var html = document.documentElement;

    if (popupOpen) {
      html.classList.add('et-popup-open');
    } else if (html.classList.contains('et-popup-open')) {
      html.classList.remove('et-popup-open');
      document.querySelectorAll('.booking-form__cal-panel.is-open').forEach(function (p) {
        p.classList.remove('is-open');
      });
    }

    setBodyFixedLock(popupOpen || menuOpen);
  }

  function closeAllPopups() {
    document.querySelectorAll('.popup-air').forEach(function (p) {
      p.classList.remove('air-popup_active', 'active', 'open', 'is-active');
    });
    var box = document.querySelector('.air-conteiner');
    if (box) box.classList.remove('air-conteiner_active');
    syncPopupScrollLock();
  }

  function bindClose(popup) {
    var icon = popup.querySelector('.air-close');
    if (!icon || icon.dataset.boundClose === '1') return;
    icon.dataset.boundClose = '1';
    icon.addEventListener('click', function () {
      popup.classList.remove('air-popup_active');
      var anyOpen = document.querySelector('.popup-air.air-popup_active');
      if (!anyOpen) {
        var box = document.querySelector('.air-conteiner');
        if (box) box.classList.remove('air-conteiner_active');
      }
      syncPopupScrollLock();
    });
  }

  function openPopup(name) {
    var popup = document.querySelector('.popup-air[data-air="' + name + '"]');
    if (!popup) return;
    document.querySelectorAll('.popup-air').forEach(function (p) {
      p.classList.remove('air-popup_active', 'active', 'open', 'is-active');
    });
    var box = popup.closest('.air-conteiner') || document.querySelector('.air-conteiner');
    if (box) box.classList.add('air-conteiner_active');
    popup.classList.add('air-popup_active');
    bindClose(popup);
    syncPopupScrollLock();
    disableLegacyPhoneMasks();
    initInternationalPhones(popup);
  }

  var lastBookingLead = null;

  function collectBookingLead(form) {
    function val(sel) {
      var el = form.querySelector(sel);
      return el ? String(el.value || '').trim() : '';
    }
    var lead = {
      type: 'booking',
      name: val('[name="text-449"]') || val('input.wpcf7-text[aria-required="true"]'),
      phone: (function () {
        var el = form.querySelector('[name="tel-609"]') || form.querySelector('input[type="tel"]');
        return el ? getPhoneFieldValue(el) : '';
      })(),
      direction: val('.booking-form__direction-visible') || val('[name="text-direction-visible"]') || val('.booking-form__direction'),
      date: val('.booking-form__date') || val('[name="text-search-date"]'),
      time: val('.booking-form__time') || val('[name="text-search-time"]'),
      path: (location.pathname || '/') + (location.search || ''),
      title: document.title || ''
    };
    if (window.__eurotourLastPrice && window.__eurotourLastPrice.amount) {
      lead.price = window.__eurotourLastPrice.amount;
      lead.price_text =
        window.__eurotourRouteData && window.__eurotourRouteData.formatPriceLabel
          ? window.__eurotourRouteData.formatPriceLabel(window.__eurotourLastPrice.amount)
          : 'Ціна ' + window.__eurotourLastPrice.amount + ' грн';
    }
    return lead;
  }

  function leadFromLast(type, extra) {
    var base = lastBookingLead ? Object.assign({}, lastBookingLead) : {
      name: '',
      phone: '',
      direction: '',
      date: '',
      time: '',
      path: (location.pathname || '/') + (location.search || ''),
      title: document.title || ''
    };
    base.type = type || 'booking';
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        base[k] = extra[k];
      });
    }
    return base;
  }

  var _etLeadLastTs = 0;
  function trackFbLead(payload) {}

  // доступно для live-chat.js та інших скриптів
  window.__eurotourTrackLead = trackFbLead;

  function classifyContactLink(a) {
    if (!a || !a.getAttribute) return null;
    var href = String(a.getAttribute('href') || '').toLowerCase();
    var cls = String(a.className || '').toLowerCase();
    var title = String(a.getAttribute('title') || '').toLowerCase();
    if (
      href.indexOf('t.me/') !== -1 ||
      href.indexOf('telegram.me/') !== -1 ||
      href.indexOf('telegram.org') !== -1 ||
      cls.indexOf('telegram') !== -1 ||
      a.classList.contains('js-telegram-link') ||
      title.indexOf('telegram') !== -1
    ) {
      return 'telegram';
    }
    if (href.indexOf('viber') !== -1 || cls.indexOf('viber') !== -1 || title.indexOf('viber') !== -1) {
      return 'viber';
    }
    if (
      href.indexOf('wa.me/') !== -1 ||
      href.indexOf('whatsapp') !== -1 ||
      cls.indexOf('whatsapp') !== -1 ||
      title.indexOf('whatsapp') !== -1
    ) {
      return 'whatsapp';
    }
    if (href.indexOf('tel:') === 0 || cls.indexOf('phone') !== -1) {
      return 'phone';
    }
    if (
      cls.indexOf('et-chat-fab') !== -1 ||
      cls.indexOf('et-livechat') !== -1 ||
      a.getAttribute('aria-label') === 'Відкрити чат'
    ) {
      return 'live_chat';
    }
    return null;
  }

  function trackContactLead(channel, href) {
    trackFbLead({
      type: 'contact_' + channel,
      channel: channel,
      href: href || '',
      path: (location.pathname || '/') + (location.search || ''),
      title: document.title || ''
    });
  }

  function initContactLeadPixel() {
    if (document.documentElement.dataset.etContactLeadBound === '1') return;
    document.documentElement.dataset.etContactLeadBound = '1';
    document.addEventListener(
      'click',
      function (e) {
        var a = e.target && e.target.closest
          ? e.target.closest(
              'a[href^="tel:"], a[href*="t.me/"], a[href*="telegram.me/"], a[href*="viber"], a[href*="wa.me/"], a[href*="whatsapp"], ' +
                'a.js-telegram-link, a.btn.telegram, a.btn.viber, a.btn.whatsapp, a.telegram, a.viber, a.whatsapp, a.phone, ' +
                'a.manager-contact__msg-link, a.manager-contact__phone-link, a.et-phone-msg__link, ' +
                'a.contacts-body-sec__social, a.contacts-body-sec__phone-link, a.footer__phone-link, ' +
                'a.header__phone, a.et-chat-fab, a.et-livechat__btn'
            )
          : null;
        if (!a) return;
        var channel = classifyContactLink(a);
        if (!channel) return;
        // анти-дубль на швидкі подвійні кліки
        var now = Date.now();
        var last = parseInt(a.dataset.etLeadTs || '0', 10) || 0;
        if (now - last < 1500) return;
        a.dataset.etLeadTs = String(now);
        trackContactLead(channel, a.getAttribute('href') || '');
      },
      true
    );
  }

  // Universal: collect every meaningful field of a form into {label: value}
  var FIELD_LABELS = {
    'text-327': 'Звідки', 'text-328': 'Куди', 'text-329': 'Телефон (2)',
    'text-449': 'Імʼя', 'tel-609': 'Телефон', 'text-direction-visible': 'Маршрут', 'text-search-time': 'Час відправлення', 'text-search-date': 'Дата рейсу',
    'text-581': 'Імʼя', 'tel-4': 'Телефон', 'textarea-12': 'Відгук',
    'text-delivery-direction': 'Маршрут', 'text-delivery-package': 'Тип посилки', 'text-delivery-date': 'Дата відправлення', 'text-delivery-name': 'Імʼя', 'text-delivery-phone': 'Телефон',
    'from': 'Звідки', 'To': 'Куди', 'Date': 'Дата', 'Passanger': 'Пасажирів',
    'fullname': 'Імʼя', 'phone': 'Телефон', 'manager-phone': 'Телефон', 'email': 'Email'
  };
  function collectAllFields(form) {
    var out = {};
    if (!form) return out;
    var els = form.querySelectorAll('input, textarea, select');
    Array.prototype.forEach.call(els, function (el) {
      var type = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button') return;
      if (/^acceptance/.test(el.name || '')) return;
      var name = el.getAttribute('name') || el.id || '';
      var label = FIELD_LABELS[name] || el.getAttribute('placeholder') || el.getAttribute('aria-label') || name;
      label = String(label || '').replace(/\*/g, '').trim();
      if (!label) return;
      var val;
      if (type === 'checkbox' || type === 'radio') { if (!el.checked) return; val = el.value && el.value !== 'on' ? el.value : 'так'; }
      else if (type === 'tel' || /phone|tel/i.test(name)) { val = typeof getPhoneFieldValue === 'function' ? getPhoneFieldValue(el) : el.value; }
      else val = String(el.value || '').trim();
      if (!val) return;
      if (out[label] && out[label] === val) return;
      if (out[label]) label = label + ' (2)';
      out[label] = val;
    });
    return out;
  }
  function pageContext() {
    var ctx = {};
    try {
      var d = typeof getMainSearchDirection === 'function' ? getMainSearchDirection() : '';
      var dt = typeof getMainSearchDate === 'function' ? getMainSearchDate() : '';
      if (d) ctx['Пошук: маршрут'] = d;
      if (dt) ctx['Пошук: дата'] = dt;
    } catch (e) {}
    if (window.__eurotourLastPrice && window.__eurotourLastPrice.amount) ctx['Розрахована ціна'] = window.__eurotourLastPrice.amount + ' грн';
    return ctx;
  }
  var _sentLeads = {};
  function sendLead(type, form, extra) {
    var fields = Object.assign({}, collectAllFields(form), extra || {});
    var payload = { type: type, fields: fields, context: pageContext(),
      name: fields['Імʼя'] || '', phone: fields['Телефон'] || '', direction: fields['Маршрут'] || (fields['Звідки'] ? fields['Звідки'] + ' → ' + fields['Куди'] : ''),
      date: fields['Дата рейсу'] || fields['Дата'] || fields['Дата відправлення'] || '', time: fields['Час відправлення'] || '',
      path: (location.pathname || '/') + (location.search || ''), title: document.title || '' };
    var key = type + '|' + JSON.stringify(fields);
    var now = Date.now();
    if (_sentLeads[key] && now - _sentLeads[key] < 60000) return payload; // dedupe within 1 min
    _sentLeads[key] = now;
    notifyLead(payload);
    return payload;
  }

  function notifyLead(payload) {
    try {
      if (typeof window.siteBridgeLead === 'function') window.siteBridgeLead(payload);
      else document.addEventListener('DOMContentLoaded', function () { if (window.siteBridgeLead) window.siteBridgeLead(payload); });
    } catch (err) {}
  }

  function homeHref() {
    var prefix = assetPrefix();
    return prefix + 'index.html';
  }

  function ensureStyles() {
    var href = assetPrefix() + 'css/local-et.css?v=20260903f';
    var existing = document.getElementById('eurotour-local-payment-css');
    if (existing) {
      if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
      return;
    }
    var link = document.createElement('link');
    link.id = 'eurotour-local-payment-css';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  try { ensureStyles(); /* early */ } catch (e) {}

  function makePopup(dataAir, innerHtml) {
    var el = document.createElement('div');
    el.className = 'popup-air main-form';
    el.setAttribute('data-air', dataAir);
    el.innerHTML = '<div class="main-form__wrapper">' + innerHtml + '</div><div class="air-close"></div>';
    return el;
  }

  function ensurePaymentPopups() {
    if (document.querySelector('.popup-air[data-air="purchase-method-popup"]')) return;

    var box = document.querySelector('.air-conteiner');
    if (!box) {
      box = document.createElement('div');
      box.className = 'air-conteiner';
      var footer = document.querySelector('footer');
      if (footer && footer.parentNode) footer.parentNode.insertBefore(box, footer.nextSibling);
      else document.body.appendChild(box);
    }

    var method = makePopup(
      'purchase-method-popup',
      '<p class="main-form__title">Для покупки зв\'яжіться з менеджером</p>' +
        '<p class="main-form__subtitle">Напишіть нам у месенджер — допоможемо оформити квиток</p>' +
        '<div class="purchase-method__actions">' +
        '<button type="button" class="btnV2 purchase-method__btn" data-purchase-choice="manager">Зв\'язатися з менеджером</button>' +
        '</div>'
    );

    var imgBase = assetPrefix() + 'images/';
    var manager = makePopup(
      'manager-contact-popup',
      '<p class="main-form__title">Зв\'язатися з менеджером</p>' +
        '<p class="main-form__subtitle">Залиште номер — ми передзвонимо</p>' +
        '<form class="manager-contact-form" novalidate>' +
        '<div class="inp-form">' +
        '<div class="inp-form__icon-wrapper"><p><img src="' +
        assetPrefix() +
        'images/ic-phon.svg" alt="" class="inp-form__icon" /></p></div>' +
        '<div class="inp-form__inp-wrapper">' +
        '<span class="wpcf7-form-control-wrap">' +
        '<input type="tel" name="manager-phone" class="wpcf7-form-control wpcf7-tel inp-form__inp" placeholder="Номер телефону" required aria-required="true" autocomplete="tel">' +
        '</span></div></div>' +
        '<div class="inp-form-btn-wrapper">' +
        '<button type="submit" class="btnV2">Надіслати номер</button>' +
        '</div>' +
        '<div class="wpcf7-response-output manager-contact-form__error" aria-hidden="true" style="display:none"></div>' +
        '</form>' +
        '<p class="manager-contact__or">Або напишіть нам у месенджер</p>' +
        '<div class="manager-contact__msg">' +
        '<a class="manager-contact__msg-link" href="https://t.me/pereviznyk_support" target="_blank" rel="noopener noreferrer" title="Telegram">' +
        '<img src="' +
        imgBase +
        'i-telegram.png" alt="Telegram" width="36" height="36">' +
        '</a>' +
        '<a class="manager-contact__msg-link" href="https://wa.me/380973452025" target="_blank" rel="noopener noreferrer" title="WhatsApp">' +
        '<img src="' +
        imgBase +
        'i-whtsap.png" alt="WhatsApp" width="36" height="36">' +
        '</a>' +
        '</div>'
    );

    var card = makePopup(
      'card-payment-popup',
      '<p class="main-form__title">Оплата онлайн</p>' +
        '<p class="main-form__subtitle">Вкажіть дані картки та email для надсилання квитків</p>' +
        '<form class="card-payment-form" novalidate>' +
        '<div class="inp-form">' +
        '<div class="inp-form__icon-wrapper"><span class="inp-form__icon-text">@</span></div>' +
        '<div class="inp-form__inp-wrapper">' +
        '<span class="wpcf7-form-control-wrap">' +
        '<input type="email" name="pay-email" class="wpcf7-form-control wpcf7-email inp-form__inp" placeholder="Email для квитків" required aria-required="true">' +
        '</span></div></div>' +
        '<div class="inp-form">' +
        '<div class="inp-form__icon-wrapper"><span class="inp-form__icon-text">№</span></div>' +
        '<div class="inp-form__inp-wrapper">' +
        '<span class="wpcf7-form-control-wrap">' +
        '<input type="text" name="pay-card" class="wpcf7-form-control inp-form__inp" inputmode="numeric" autocomplete="cc-number" placeholder="Номер картки" maxlength="19" required aria-required="true">' +
        '</span></div></div>' +
        '<div class="card-payment-form__row">' +
        '<div class="inp-form">' +
        '<div class="inp-form__icon-wrapper"><span class="inp-form__icon-text">ММ</span></div>' +
        '<div class="inp-form__inp-wrapper">' +
        '<span class="wpcf7-form-control-wrap">' +
        '<input type="text" name="pay-exp" class="wpcf7-form-control inp-form__inp" inputmode="numeric" autocomplete="cc-exp" placeholder="ММ/РР" maxlength="5" required aria-required="true">' +
        '</span></div></div>' +
        '<div class="inp-form">' +
        '<div class="inp-form__icon-wrapper"><span class="inp-form__icon-text">CVC</span></div>' +
        '<div class="inp-form__inp-wrapper">' +
        '<span class="wpcf7-form-control-wrap">' +
        '<input type="text" name="pay-cvc" class="wpcf7-form-control inp-form__inp" inputmode="numeric" autocomplete="cc-csc" placeholder="CVC" maxlength="4" required aria-required="true">' +
        '</span></div></div>' +
        '</div>' +
        '<div class="inp-form">' +
        '<div class="inp-form__icon-wrapper"><span class="inp-form__icon-text">Aa</span></div>' +
        '<div class="inp-form__inp-wrapper">' +
        '<span class="wpcf7-form-control-wrap">' +
        '<input type="text" name="pay-name" class="wpcf7-form-control inp-form__inp" autocomplete="cc-name" placeholder="Ім\'я на картці" required aria-required="true">' +
        '</span></div></div>' +
        '<div class="inp-form-btn-wrapper">' +
        '<button type="submit" class="btnV2">Оплатити</button>' +
        '</div>' +
        '<div class="wpcf7-response-output" aria-hidden="true" style="display:none"></div>' +
        '</form>'
    );

    var payOk = makePopup(
      'form-send-payment',
      '<div class="form-send__done">' + SUCCESS_SVG + '</div>' +
        '<p class="main-form__title">Успіх</p>' +
        '<p class="main-form__subtitle">Квитки буде надіслано на вказану електронну пошту</p>' +
        '<div class="inp-form-btn-wrapper"><a href="' + homeHref() + '" class="btnV2">На головну</a></div>'
    );

    box.appendChild(method);
    box.appendChild(manager);
    box.appendChild(card);
    box.appendChild(payOk);

    method.querySelectorAll('[data-purchase-choice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var choice = btn.getAttribute('data-purchase-choice');
        if (choice === 'manager') {
          var phoneInp = manager.querySelector('[name="manager-phone"]');
          if (phoneInp && lastBookingLead && lastBookingLead.phone) {
            setPhoneFieldValue(phoneInp, lastBookingLead.phone);
          }
          var err = manager.querySelector('.manager-contact-form__error');
          if (err) {
            err.style.display = 'none';
            err.textContent = '';
          }
          openPopup('manager-contact-popup');
        } else if (choice === 'site') {
          openPopup('card-payment-popup');
        }
      });
    });

    var managerForm = manager.querySelector('.manager-contact-form');
    if (managerForm) {
      managerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var phoneEl = managerForm.querySelector('[name="manager-phone"]');
        var err = managerForm.querySelector('.manager-contact-form__error');
        var phoneVal = phoneEl ? getPhoneFieldValue(phoneEl) : '';
        if (!phoneVal || !isPhoneValid(phoneVal, phoneEl)) {
          if (err) {
            err.style.display = 'block';
            err.textContent = phoneVal
              ? 'Введіть коректний номер телефону'
              : 'Вкажіть номер телефону';
          }
          if (phoneEl) phoneEl.focus();
          return;
        }
        if (err) {
          err.style.display = 'none';
          err.textContent = '';
        }
        sendLead('manager', managerForm, Object.assign({}, (lastBookingLead && lastBookingLead.fields) || {}, { 'Телефон': phoneVal, 'Крок': 'Після бронювання: просить звʼязок менеджера' }));
        resetBookingForms();
        setFormSendMessage('Успіх', 'Наш менеджер зв\'яжеться з вами найближчим часом');
        openPopup('form-send');
      });
    }

    var cardForm = card.querySelector('.card-payment-form');
    if (cardForm) {
      cardForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validateCardForm(cardForm)) return;
        var emailEl = cardForm.querySelector('[name="pay-email"]');
        var cardEl = cardForm.querySelector('[name="pay-card"]');
        var nameEl = cardForm.querySelector('[name="pay-name"]');
        var cardDigits = digitsPhone(cardEl && cardEl.value);
        sendLead('payment', null, Object.assign({}, (lastBookingLead && lastBookingLead.fields) || {}, {
          'Email': emailEl ? String(emailEl.value || '').trim() : '',
          'Імʼя на картці': nameEl ? String(nameEl.value || '').trim() : '',
          'Картка': cardDigits ? '•••• ' + cardDigits.slice(-4) : '',
          'Крок': 'Після бронювання: обрав оплату карткою'
        }));
        cardForm.reset();
        clearFormErrors(cardForm);
        resetBookingForms();
        openPopup('form-send-payment');
      });

      var cardInput = cardForm.querySelector('[name="pay-card"]');
      var expInput = cardForm.querySelector('[name="pay-exp"]');
      if (cardInput) {
        cardInput.addEventListener('input', function () {
          var d = digitsPhone(cardInput.value).slice(0, 16);
          cardInput.value = d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
        });
      }
      if (expInput) {
        expInput.addEventListener('input', function () {
          var d = digitsPhone(expInput.value).slice(0, 4);
          if (d.length >= 3) expInput.value = d.slice(0, 2) + '/' + d.slice(2);
          else expInput.value = d;
        });
      }
    }
    initInternationalPhones(box);
  }

  function validateCardForm(form) {
    clearFormErrors(form);
    var ok = true;
    var email = form.querySelector('[name="pay-email"]');
    var card = form.querySelector('[name="pay-card"]');
    var exp = form.querySelector('[name="pay-exp"]');
    var cvc = form.querySelector('[name="pay-cvc"]');
    var name = form.querySelector('[name="pay-name"]');

    if (!email || !isEmailValid(email.value)) {
      markInvalid(email, true, 'Введіть коректну електронну пошту');
      ok = false;
    } else markInvalid(email, false);

    var cardDigits = digitsPhone(card && card.value);
    if (!card || cardDigits.length < 16) {
      markInvalid(card, true, 'Введіть номер картки (16 цифр)');
      ok = false;
    } else markInvalid(card, false);

    var expVal = String(exp && exp.value || '');
    if (!/^\d{2}\/\d{2}$/.test(expVal)) {
      markInvalid(exp, true, 'Формат ММ/РР');
      ok = false;
    } else {
      var mm = parseInt(expVal.slice(0, 2), 10);
      if (mm < 1 || mm > 12) {
        markInvalid(exp, true, 'Невірний місяць');
        ok = false;
      } else markInvalid(exp, false);
    }

    var cvcDigits = digitsPhone(cvc && cvc.value);
    if (!cvc || cvcDigits.length < 3) {
      markInvalid(cvc, true, 'Введіть CVC');
      ok = false;
    } else markInvalid(cvc, false);

    if (!name || !String(name.value || '').trim()) {
      markInvalid(name, true, 'Вкажіть ім\'я на картці');
      ok = false;
    } else markInvalid(name, false);

    var out = form.querySelector('.wpcf7-response-output');
    if (!ok && out) {
      out.textContent = 'Одне або кілька полів містять помилку. Будь ласка, перевірте їх і спробуйте ще раз.';
      out.classList.add('wpcf7-validation-errors');
      out.setAttribute('aria-hidden', 'false');
      out.style.display = 'block';
    }
    return ok;
  }

  function isBookingForm(form) {
    return !!(form.closest('[data-air="booking-form-popup"]') || form.closest('.booking-form'));
  }

  function resetBookingForms() {
    document.querySelectorAll('.booking-form form.wpcf7-form, [data-air="booking-form-popup"] form.wpcf7-form').forEach(function (f) {
      f.reset();
      clearFormErrors(f);
    });
  }

  function successTargetFor(form) {
    if (form.closest('[data-air="review-form"]')) return 'form-send-review';
    return 'form-send';
  }

  function setFormSendMessage(title, subtitle) {
    var popup = document.querySelector('.popup-air[data-air="form-send"]');
    if (!popup) return;
    var t = popup.querySelector('.main-form__title');
    var s = popup.querySelector('.main-form__subtitle');
    if (t && title) t.textContent = title;
    if (s && subtitle) s.textContent = subtitle;
  }

  function clearBannerErrors(form) {
    form.querySelectorAll('.banner-form-error').forEach(function (n) { n.remove(); });
    form.querySelectorAll('.search__input').forEach(function (el) {
      el.classList.remove('search__input--invalid');
      el.style.borderColor = '';
    });
  }

  function validateBannerForm(form) {
    var name = form.querySelector('[name="fullname"], #fullname');
    var phone = form.querySelector('[name="phone"], #phone, input[type="tel"]');
    var ok = true;
    clearBannerErrors(form);

    function fail(el, msg) {
      ok = false;
      if (!el) return;
      el.classList.add('search__input--invalid');
      el.style.borderColor = '#e11';
      var tip = document.createElement('span');
      tip.className = 'banner-form-error';
      tip.textContent = msg;
      tip.style.cssText = 'display:block;color:#e11;font-size:13px;margin-top:6px;';
      var wrap = el.closest('.search__input-wrapper') || el.parentElement;
      if (wrap) wrap.appendChild(tip);
    }

    if (!name || !String(name.value || '').trim()) {
      fail(name, 'Вкажіть ПІБ');
    } else {
      name.value = sanitizePersonName(name.value).trim();
      if (!isPersonNameValid(name.value)) {
        fail(name, 'ПІБ без цифр, з великої літери');
      }
    }
    if (!phone || !getPhoneFieldValue(phone)) {
      fail(phone, 'Вкажіть номер телефону');
    } else if (!isPhoneValid(phone.value, phone)) {
      fail(phone, 'Введіть коректний номер телефону');
    }
    return ok;
  }

  function showBannerSuccess(form) {
    sendLead('manager', form);
    setFormSendMessage(
      'Успіх',
      'Заявку успішно надіслано. Наш менеджер зв\'яжеться з вами найближчим часом'
    );
    openPopup('form-send');
    if (form && typeof form.reset === 'function') {
      form.reset();
    }
    if (form) clearBannerErrors(form);
  }

  function onBannerFormSubmit(e) {
    var form = e.target;
    if (!form || !form.classList || !form.classList.contains('banenr-sec__form')) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (!validateBannerForm(form)) return;
    showBannerSuccess(form);
  }

  function onSubmit(e) {
    var form = e.target;
    if (!form || !form.classList) return;

    if (form.classList.contains('banenr-sec__form')) {
      onBannerFormSubmit(e);
      return;
    }

    if (form.closest('[data-air="main-form"]')) {
      e.preventDefault(); e.stopPropagation();
      var nm = form.querySelector('[name="fullname"]'), ph = form.querySelector('[name="phone"]');
      if (!nm || !nm.value.trim() || !ph || !getPhoneFieldValue(ph)) { (nm && !nm.value.trim() ? nm : ph).focus(); return; }
      sendLead('callback', form);
      closeAllPopups();
      setFormSendMessage('Успіх', 'Заявку надіслано. Наш менеджер звʼяжеться з вами найближчим часом');
      openPopup('form-send');
      form.reset();
      return;
    }
    if (!form.classList.contains('wpcf7-form')) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    if (!validateWpcf7Form(form)) return;

    if (isBookingForm(form)) {
      lastBookingLead = collectBookingLead(form);
      lastBookingLead.fields = collectAllFields(form);
      sendLead('booking', form);
      // не сбрасываем сразу — данные заявки остаются до выбора способа
      ensurePaymentPopups();
      openPopup('purchase-method-popup');
      return;
    }

    var target = successTargetFor(form);
    var ftype = form.closest('[data-air="review-form"]') ? 'review' : form.closest('[data-air="delivery-form-popup"]') ? 'delivery' : form.closest('[data-air="transfer-form"]') ? 'transfer' : 'form';
    sendLead(ftype, form);
    closeAllPopups();
    openPopup(target);
    form.reset();
    clearFormErrors(form);
  }

  document.addEventListener('submit', onSubmit, true);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest(
      '#banner-find-trip-btn, .banenr-sec__form button, .banenr-sec__form .search__input-btn, .banenr-sec__btn-wrapper .btnV2'
    );
    if (!btn) return;
    var form = btn.closest('form.banenr-sec__form');
    if (!form) return;

    // Блокуємо штатний air-open-btn — спочатку валідація
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    if (!validateBannerForm(form)) return;
    showBannerSuccess(form);
  }, true);

  function watchPopupScrollLock() {
    function attach(el) {
      if (!el || el.dataset.scrollLockWatch === '1') return;
      el.dataset.scrollLockWatch = '1';
      new MutationObserver(function () {
        syncPopupScrollLock();
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    }

    attach(document.querySelector('.air-conteiner'));
    attach(document.querySelector('.header__mobile'));

    if (!scrollLockDocWatch && document.body) {
      scrollLockDocWatch = true;
      new MutationObserver(function () {
        attach(document.querySelector('.air-conteiner'));
        attach(document.querySelector('.header__mobile'));
        syncPopupScrollLock();
      }).observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // На всякий случай при клике на открытие попапа
    document.addEventListener(
      'click',
      function (e) {
        if (!e.target.closest('.air-open-btn, [data-popup-current], .air-close')) return;
        setTimeout(syncPopupScrollLock, 0);
        setTimeout(syncPopupScrollLock, 50);
        setTimeout(syncPopupScrollLock, 300);
      },
      true
    );

    syncPopupScrollLock();
  }

  function closeAllCalPanels(except) {
    document.querySelectorAll('.booking-form__cal-panel.is-open').forEach(function (p) {
      if (except && p === except) return;
      p.classList.remove('is-open');
      p.style.left = '';
      p.style.top = '';
      p.style.width = '';
      p.style.position = '';
      p.style.zIndex = '';
      p.style.removeProperty('display');
    });
    document.querySelectorAll('.booking-form__time-panel.is-open').forEach(function (p) {
      if (except && p === except) return;
      p.classList.remove('is-open');
    });
  }

  var DEPARTURE_TIMES = ['07:00', '18:00'];

  function tomorrowDate() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  }

  function formatUkDate(d) {
    return d.toLocaleDateString('uk-UA');
  }

  function formatIsoDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function normalizeDepartureTime(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var m = raw.match(/\b(\d{1,2}):(\d{2})\b/);
    if (!m) return '';
    var t = String(m[1]).padStart(2, '0') + ':' + m[2];
    return DEPARTURE_TIMES.indexOf(t) >= 0 ? t : '';
  }

  function cityOnlyLabel(value) {
    return (value || '').replace(/\s*\([^)]*\)\s*/g, '').trim();
  }

  function getMainSearchDirection() {
    var fromSel = document.getElementById('search-from');
    var toSel = document.getElementById('search-to');
    var from = '';
    var to = '';
    if (fromSel && fromSel.selectedIndex >= 0) {
      var fromOpt = fromSel.options[fromSel.selectedIndex];
      if (fromOpt && String(fromOpt.value || '').trim()) {
        from = cityOnlyLabel(fromOpt.textContent || fromOpt.text || '');
      }
    }
    if (toSel && toSel.selectedIndex >= 0) {
      var toOpt = toSel.options[toSel.selectedIndex];
      if (toOpt && String(toOpt.value || '').trim()) {
        to = cityOnlyLabel(toOpt.textContent || toOpt.text || '');
      }
    }
    if (from && to) return from + ' - ' + to;

    var deliveryRoot = document.querySelector('[data-delivery-search-root]');
    if (deliveryRoot) {
      var dFrom = deliveryRoot.querySelector('[data-delivery-input="from"]');
      var dTo = deliveryRoot.querySelector('[data-delivery-input="to"]');
      from = cityOnlyLabel(dFrom && dFrom.value);
      to = cityOnlyLabel(dTo && dTo.value);
      if (from && to) return from + ' - ' + to;
    }

    var tFrom = document.querySelector(
      '.search__input-location-from .search__inp-element'
    );
    var tTo = document.querySelector(
      '.search__input-location-to .search__inp-element'
    );
    if (tFrom || tTo) {
      from = cityOnlyLabel(tFrom && tFrom.value);
      to = cityOnlyLabel(tTo && tTo.value);
      if (from && to) return from + ' - ' + to;
    }

    if (lastBookingLead && lastBookingLead.direction) return lastBookingLead.direction;
    return '';
  }

  function getSearchDateRaw() {
    var ids = ['calendar2', 'delivery-calendar', 'calendar3'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      var val = String(el.value || '').trim();
      if (val) return val;
    }
    var deliveryDate = document.querySelector('[data-delivery-input="date"]');
    if (deliveryDate) {
      var dVal = String(deliveryDate.value || '').trim();
      if (dVal) return dVal;
    }
    return '';
  }

  function getMainSearchDate() {
    var val = getSearchDateRaw();
    if (val) return val;
    if (lastBookingLead && lastBookingLead.date) return lastBookingLead.date;
    return formatUkDate(new Date());
  }

  function collectBannerLead(form) {
    var nameEl = form.querySelector('[name="fullname"], #fullname');
    var phoneEl = form.querySelector('[name="phone"], #phone, input[type="tel"]');
    return {
      type: 'manager',
      name: nameEl ? String(nameEl.value || '').trim() : '',
      phone: phoneEl ? getPhoneFieldValue(phoneEl) : '',
      direction: getMainSearchDirection(),
      date: getMainSearchDate(),
      path: (location.pathname || '/') + (location.search || ''),
      title: document.title || ''
    };
  }

  function getRoutePageCities() {
    var mob = document.querySelector('.route-list__element-top-mob');
    if (mob) {
      var mobCities = mob.querySelectorAll('.direction-location-element__city');
      if (mobCities.length >= 2) {
        return {
          from: mobCities[0].textContent.trim(),
          to: mobCities[1].textContent.trim(),
        };
      }
    }
    var dep = document.querySelector(
      '.route-list__route-col1 .route-list__route-city'
    );
    var arr = document.querySelector(
      '.route-list__route-col2 .route-list__route-city'
    );
    if (dep && arr) {
      return {
        from: dep.textContent.trim(),
        to: arr.textContent.trim(),
      };
    }
    return null;
  }

  function fixBookingDirectionCities(form) {
    if (!form) return;
    var startInput =
      form.querySelector('.booking-form__start-point') ||
      form.querySelector('[name*="start-point"]');
    var endInput =
      form.querySelector('.booking-form__end-point') ||
      form.querySelector('[name*="end-point"]');
    var dirInput =
      form.querySelector('.booking-form__direction') ||
      form.querySelector('[name*="direction"]:not([name*="direction-visible"])');
    var dirVis =
      form.querySelector('.booking-form__direction-visible') ||
      form.querySelector('[name*="direction-visible"]');

    var routeCities = getRoutePageCities();
    var from = routeCities
      ? routeCities.from
      : cityOnlyLabel(startInput && startInput.value);
    var to = routeCities
      ? routeCities.to
      : cityOnlyLabel(endInput && endInput.value);

    if ((!from || !to) && dirVis && dirVis.value) {
      var parts = dirVis.value.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        from = cityOnlyLabel(parts[0]);
        to = cityOnlyLabel(parts[1]);
      }
    }

    if (!from || !to) return;

    var directionText = from + ' - ' + to;
    if (dirInput) dirInput.value = directionText;
    if (dirVis) dirVis.value = directionText;
    if (startInput) startInput.value = from;
    if (endInput) endInput.value = to;
  }

  function parseSearchDateToUk(raw) {
    var val = String(raw || '').trim();
    if (!val) return '';
    var iso = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return formatUkDate(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    }
    return val;
  }

  function applyMainSearchToBookingForm(form) {
    if (!form) return false;
    var mainDir = getMainSearchDirection();
    if (!mainDir) return false;
    var parts = mainDir.split(/\s*[-–—]\s*/);
    if (parts.length < 2) return false;
    var from = cityOnlyLabel(parts[0]);
    var to = cityOnlyLabel(parts[1]);
    if (!from || !to) return false;
    var directionText = from + ' - ' + to;
    var startInput =
      form.querySelector('.booking-form__start-point') ||
      form.querySelector('[name*="start-point"]');
    var endInput =
      form.querySelector('.booking-form__end-point') ||
      form.querySelector('[name*="end-point"]');
    var dirInput =
      form.querySelector('.booking-form__direction') ||
      form.querySelector('[name*="direction"]:not([name*="direction-visible"])');
    var dirVis =
      form.querySelector('.booking-form__direction-visible') ||
      form.querySelector('[name*="direction-visible"]');
    if (dirInput) dirInput.value = directionText;
    if (dirVis) dirVis.value = directionText;
    if (startInput) startInput.value = from;
    if (endInput) endInput.value = to;
    return true;
  }

  function applyBookingFormDefaults(form, useMainSearch) {
    if (!form) return;
    if (useMainSearch && applyMainSearchToBookingForm(form)) {
      // direction from main search
    } else {
      fixBookingDirectionCities(form);
    }
    var dateInput =
      form.querySelector('.booking-form__date') ||
      form.querySelector('input[name="text-search-date"]');
    if (dateInput) {
      var fromSearch = '';
      if (useMainSearch) {
        fromSearch = parseSearchDateToUk(getSearchDateRaw());
      }
      dateInput.value = fromSearch || formatUkDate(tomorrowDate());
      try {
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {}
    }

    var timeInput =
      form.querySelector('.booking-form__time') ||
      form.querySelector('input[name="text-search-time"]');
    if (timeInput) {
      var normalized = normalizeDepartureTime(timeInput.value);
      timeInput.value = normalized || DEPARTURE_TIMES[0];
      try {
        timeInput.dispatchEvent(new Event('input', { bubbles: true }));
        timeInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {}
    }
  }

  function openBookingFromMainSearch() {
    ensurePaymentPopups();
    if (typeof initBookingFormExtras === 'function') {
      try {
        initBookingFormExtras();
      } catch (err) {}
    }
    // Open via theme button so popup animation/classes match «Забронювати»
    var openBtn = document.querySelector(
      '.air-open-btn[data-popup-current="booking-form-popup"]'
    );
    if (openBtn) {
      openBtn.click();
    } else {
      openPopup('booking-form-popup');
    }
    function fill() {
      initBookingTimePickers();
      initBookingDatePickers();
      document
        .querySelectorAll('.booking-form form, [data-air="booking-form-popup"] form')
        .forEach(function (f) {
          applyBookingFormDefaults(f, true);
        });
    }
    setTimeout(fill, 0);
    setTimeout(fill, 60);
    setTimeout(fill, 150);
    setTimeout(fill, 350);
  }

  window.__eurotourOpenBookingFromSearch = openBookingFromMainSearch;

  function ensureSearchDateFilled(dateEl) {
    if (!dateEl || String(dateEl.value || '').trim()) return;
    try {
      dateEl.value = formatIsoDate(tomorrowDate());
      dateEl.dispatchEvent(new Event('input', { bubbles: true }));
      dateEl.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) {}
  }

  function formatUah(n) {
    try {
      if (window.__eurotourRouteData && typeof window.__eurotourRouteData.formatPrice === 'function') {
        return window.__eurotourRouteData.formatPrice(n);
      }
    } catch (e0) {}
    return String(n);
  }

  function formatPriceLabel(n) {
    try {
      if (window.__eurotourRouteData && typeof window.__eurotourRouteData.formatPriceLabel === 'function') {
        return window.__eurotourRouteData.formatPriceLabel(n);
      }
    } catch (e0) {}
    return 'Ціна ' + formatUah(n) + ' грн';
  }

  function calcSelectedSearchPrice() {
    var fromEl = document.getElementById('search-from');
    var toEl = document.getElementById('search-to');
    if (!fromEl || !toEl) return null;
    var fromName = fromEl.options[fromEl.selectedIndex]
      ? String(fromEl.options[fromEl.selectedIndex].textContent || '').trim()
      : '';
    var toName = toEl.options[toEl.selectedIndex]
      ? String(toEl.options[toEl.selectedIndex].textContent || '').trim()
      : '';
    if (!fromName || !toName || !fromEl.value || !toEl.value) return null;
    var rd = window.__eurotourRouteData;
    if (!rd || typeof rd.calcPriceByNames !== 'function') return null;
    var res = rd.calcPriceByNames(fromName, toName);
    if (!res || !res.amount) return null;
    window.__eurotourLastPrice = res;
    return res;
  }

  function ensureSearchPriceBox() {
    var host =
      document.querySelector('#main-search-route .front-sec__search') ||
      document.querySelector('.front-sec__search') ||
      document.querySelector('.main-search') ||
      document.getElementById('search-button') && document.getElementById('search-button').parentElement;
    if (!host) return null;
    var box = document.getElementById('et-search-price');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'et-search-price';
    box.className = 'et-search-price';
    box.hidden = true;
    var btn = document.getElementById('search-button');
    if (btn && btn.parentElement) {
      btn.parentElement.insertAdjacentElement('afterend', box);
    } else {
      host.appendChild(box);
    }
    return box;
  }

  function showSearchPrice(priceObj) {
    var box = ensureSearchPriceBox();
    if (!box || !priceObj) return;
    var amount = formatUah(priceObj.amount);
    box.hidden = false;
    box.innerHTML =
      '<div class="et-search-price__inner">' +
      '<span class="et-search-price__label">Ціна квитка</span>' +
      '<span class="et-search-price__now"><strong>' +
      amount +
      '</strong> <span class="et-search-price__currency">грн</span></span>' +
      '</div>';
  }

  function injectBookingPrice(priceObj) {
    if (!priceObj) return;
    var amount = formatUah(priceObj.amount);
    document
      .querySelectorAll(
        '.booking-form form, [data-air="booking-form-popup"] form, [data-air="booking-form-popup"] .main-form__wrapper'
      )
      .forEach(function (root) {
        var wrap = root.classList && root.classList.contains('main-form__wrapper')
          ? root
          : root.closest('.main-form__wrapper') || root;
        var doorNote = wrap.querySelector('.et-door-booking-note');
        var summary = wrap.querySelector('.et-booking-summary');
        if (!summary) {
          summary = document.createElement('div');
          summary.className = 'et-booking-summary';
          var anchor = doorNote || wrap.querySelector('.wpcf7') || wrap.querySelector('form');
          if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(summary, anchor);
          } else {
            wrap.appendChild(summary);
          }
        }
        if (doorNote && doorNote.parentNode !== summary) {
          summary.insertBefore(doorNote, summary.firstChild);
        }
        var box = wrap.querySelector('.et-booking-price');
        if (!box) {
          box = document.createElement('div');
          box.className = 'et-booking-price';
          summary.appendChild(box);
        } else if (box.parentNode !== summary) {
          summary.appendChild(box);
        }
        box.innerHTML =
          '<span class="et-booking-price__label">Ціна квитка</span>' +
          '<span class="et-booking-price__value"><strong>' +
          amount +
          '</strong> <span class="et-search-price__currency">грн</span></span>';
        var hidden = wrap.querySelector('input[name="et-route-price"]');
        if (!hidden) {
          hidden = document.createElement('input');
          hidden.type = 'hidden';
          hidden.name = 'et-route-price';
          var form = wrap.querySelector('form') || wrap;
          form.appendChild(hidden);
        }
        hidden.value = String(priceObj.amount);
      });
  }

  function setSearchError(err, isError) {
    if (!err) return;
    if (isError) {
      err.style.display = 'block';
      err.classList.add('is-visible');
      err.classList.add('search__input-wrapper-send-error_active');
    } else {
      err.style.display = '';
      err.classList.remove('is-visible');
      err.classList.remove('search__input-wrapper-send-error_active');
    }
  }

  function bindSearchOpenBooking(btn, validateFn) {
    if (!btn || btn.dataset.etBookingBound === '1') return;
    btn.dataset.etBookingBound = '1';
    btn.addEventListener(
      'click',
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        if (!validateFn()) return;
        var priceObj = null;
        try {
          priceObj = calcSelectedSearchPrice();
        } catch (errPrice) {}
        if (priceObj) {
          showSearchPrice(priceObj);
          setTimeout(function () {
            injectBookingPrice(priceObj);
          }, 80);
          setTimeout(function () {
            injectBookingPrice(priceObj);
          }, 250);
        }
        openBookingFromMainSearch();
        if (priceObj) {
          setTimeout(function () {
            injectBookingPrice(priceObj);
          }, 400);
        }
      },
      true
    );
  }

  function initMainSearchBookingButton() {
    bindSearchOpenBooking(document.getElementById('search-button'), function () {
      var fromEl = document.getElementById('search-from');
      var toEl = document.getElementById('search-to');
      var dateEl = document.getElementById('calendar2');
      var err = document.querySelector('.search__input-wrapper-send-error');
      var fromId = fromEl ? String(fromEl.value || '').trim() : '';
      var toId = toEl ? String(toEl.value || '').trim() : '';
      if (!fromId || !toId) {
        setSearchError(err, true);
        return false;
      }
      setSearchError(err, false);
      ensureSearchDateFilled(dateEl);
      return true;
    });
  }

  function deliverySearchButtons() {
    var root = document.querySelector('[data-delivery-search-root]');
    if (!root) return [];
    var exact = root.querySelectorAll('[data-delivery-action="search"]');
    if (exact.length) return Array.prototype.slice.call(exact);
    return Array.prototype.slice
      .call(root.querySelectorAll('button.search__input-btn, button.btnV2'))
      .filter(function (btn) {
        return /Знайти\s*рейс/i.test(btn.textContent || '');
      });
  }

  function initDeliverySearchBookingButton() {
    deliverySearchButtons().forEach(function (btn) {
      bindSearchOpenBooking(btn, function () {
        var root =
          btn.closest('[data-delivery-search-root]') ||
          document.querySelector('[data-delivery-search-root]');
        if (!root) return false;
        var fromInput = root.querySelector('[data-delivery-input="from"]');
        var toInput = root.querySelector('[data-delivery-input="to"]');
        var dateInput =
          root.querySelector('[data-delivery-input="date"]') ||
          document.getElementById('delivery-calendar');
        var fromIdInput = root.querySelector('[data-delivery-field="from-id"]');
        var toIdInput = root.querySelector('[data-delivery-field="to-id"]');
        var err = root.querySelector('.search__input-wrapper-send-error');
        var fromLabel = cityOnlyLabel(fromInput && fromInput.value);
        var toLabel = cityOnlyLabel(toInput && toInput.value);
        var fromId = fromIdInput ? String(fromIdInput.value || '').trim() : '';
        var toId = toIdInput ? String(toIdInput.value || '').trim() : '';
        if ((!fromId || !toId) && (!fromLabel || !toLabel)) {
          setSearchError(err, true);
          return false;
        }
        if (!fromLabel || !toLabel) {
          setSearchError(err, true);
          return false;
        }
        setSearchError(err, false);
        ensureSearchDateFilled(dateInput);
        return true;
      });
    });
  }

  function initTransferSearchBookingButton() {
    document
      .querySelectorAll('[data-transfer-search="true"]')
      .forEach(function (btn) {
        bindSearchOpenBooking(btn, function () {
          var wrap =
            btn.closest('.front-sec__search, .main-search, .search') ||
            document;
          var fromInput = wrap.querySelector(
            '.search__input-location-from .search__inp-element'
          );
          var toInput = wrap.querySelector(
            '.search__input-location-to .search__inp-element'
          );
          var dateInput =
            wrap.querySelector('#calendar3') ||
            document.getElementById('calendar3');
          var err =
            wrap.querySelector('.search__input-wrapper-send-error') ||
            document.querySelector('.search__input-wrapper-send-error');
          var fromLabel = cityOnlyLabel(fromInput && fromInput.value);
          var toLabel = cityOnlyLabel(toInput && toInput.value);
          if (!fromLabel || !toLabel) {
            setSearchError(err, true);
            return false;
          }
          setSearchError(err, false);
          ensureSearchDateFilled(dateInput);
          return true;
        });
      });
  }

  function initBookingTimePickers() {
    var inputs = document.querySelectorAll(
      '.booking-form__time, input[name="text-search-time"].inp-form__inp'
    );
    inputs.forEach(function (input) {
      if (input.dataset.timeBound === '1') return;
      input.dataset.timeBound = '1';
      input.setAttribute('readonly', 'readonly');
      input.style.cursor = 'pointer';
      input.setAttribute('autocomplete', 'off');

      var parent = input.parentNode;
      if (!parent) return;

      var wrap = document.createElement('div');
      wrap.className = 'booking-form__time-wrap';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);

      var panel = document.createElement('div');
      panel.className = 'booking-form__time-panel';
      panel.innerHTML = DEPARTURE_TIMES.map(function (t) {
        return (
          '<button type="button" class="booking-form__time-option" data-time="' +
          t +
          '">' +
          t +
          '</button>'
        );
      }).join('');
      wrap.appendChild(panel);

      function syncActive() {
        var cur = normalizeDepartureTime(input.value) || '';
        panel.querySelectorAll('.booking-form__time-option').forEach(function (btn) {
          btn.classList.toggle('is-active', btn.getAttribute('data-time') === cur);
        });
      }

      panel.addEventListener('click', function (ev) {
        var opt = ev.target.closest('.booking-form__time-option');
        if (!opt) return;
        ev.preventDefault();
        ev.stopPropagation();
        input.value = opt.getAttribute('data-time') || '';
        panel.classList.remove('is-open');
        syncActive();
        try {
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (err) {}
      });

      input.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var willOpen = !panel.classList.contains('is-open');
        closeAllCalPanels();
        if (willOpen) {
          syncActive();
          panel.classList.add('is-open');
        }
      });

      input.addEventListener('focus', function (ev) {
        ev.preventDefault();
        input.blur();
      });

      if (!normalizeDepartureTime(input.value)) {
        input.value = DEPARTURE_TIMES[0];
      }
      syncActive();
    });
  }

  function initBookingOpenDefaults() {
    document.addEventListener(
      'click',
      function (e) {
        var btn = e.target.closest(
          '.air-open-btn[data-popup-current="booking-form-popup"]'
        );
        if (!btn) return;
        setTimeout(function () {
          initBookingTimePickers();
          initBookingDatePickers();
          document
            .querySelectorAll(
              '.booking-form form, [data-air="booking-form-popup"] form'
            )
            .forEach(applyBookingFormDefaults);
        }, 0);
      },
      false
    );
  }

  function initHeaderPhoneMessengers() { /* header contacts are static in HTML */ }

  function initRouteDestinationNote() {
    var dest = document.getElementById('single-route-destination');
    if (!dest) return;
    var wrapper = dest.closest('.search__input-wrapper');
    if (!wrapper || wrapper.dataset.etDestDone) return;
    wrapper.dataset.etDestDone = '1';

    var header = dest.closest('.search__input-header');
    if (header) header.style.display = 'none';

    dest.setAttribute('tabindex', '-1');
    dest.setAttribute('aria-hidden', 'true');
    dest.style.cssText =
      'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;clip:rect(0,0,0,0);';

    if (wrapper.querySelector('.et-dest-box')) return;

    var box = document.createElement('div');
    box.className = 'et-dest-box';
    box.innerHTML =
      '<p class="et-dest-note">Доставляємо прямо на адресу, яку ви вкажете під час бронювання.</p>';

    if (header && header.parentNode === wrapper) {
      header.insertAdjacentElement('afterend', box);
    } else {
      wrapper.appendChild(box);
    }
  }

  function initRouteMobileBusAnimation() {
    document
      .querySelectorAll('.route-list__element-top-mob .moving-bus-icon-mob')
      .forEach(function (el) {
        el.removeAttribute('onclick');
        el.style.removeProperty('top');
        el.style.removeProperty('left');
        el.style.removeProperty('transform');
        el.style.animation = 'etDriveBusMobH 15s linear infinite';
        el.addEventListener('click', function () {
          this.style.animation = 'none';
          void this.offsetHeight;
          this.style.animation = 'etDriveBusMobH 15s linear infinite';
        });
      });
  }

  function ensureRouteInfoWidthStyle() {
    if (document.getElementById('eurotour-route-info-width')) return;
    if (!document.querySelector('.route-list__element-hidden-info-wrapper')) return;
    var style = document.createElement('style');
    style.id = 'eurotour-route-info-width';
    style.textContent =
      '@media (max-width:768px){.route-list__element-hidden-info-wrapper{width:80%!important;max-width:80%!important;padding:12px 14px!important;margin-left:auto!important;margin-right:auto!important;box-sizing:border-box!important}.route-list__element-hidden-info-element{flex:0 1 auto!important}}';
    document.body.appendChild(style);
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureStyles();
    ensureRouteInfoWidthStyle();
    disableLegacyPhoneMasks();
    initInternationalPhones();
    initMainSearchBookingButton();
    initDeliverySearchBookingButton();
    initTransferSearchBookingButton();
    initPersonNameFields();
    initRouteDestinationNote();
    initRouteMobileBusAnimation();
    setTimeout(initPersonNameFields, 400);
    // ждём, пока оригинальный popupAir создаст .air-conteiner
    setTimeout(ensurePaymentPopups, 50);
    setTimeout(ensurePaymentPopups, 400);
    setTimeout(watchPopupScrollLock, 50);
    setTimeout(watchPopupScrollLock, 400);
    setTimeout(initBookingDatePickers, 100);
    setTimeout(initBookingDatePickers, 500);
    setTimeout(initBookingTimePickers, 100);
    setTimeout(initBookingTimePickers, 500);
    initBookingOpenDefaults();
    initHeaderPhoneMessengers();
    initMobileSocialFocusFix();
    initContactLeadPixel();
    setTimeout(disableLegacyPhoneMasks, 0);
    setTimeout(initInternationalPhones, 0);
    setTimeout(disableLegacyPhoneMasks, 300);
    setTimeout(initInternationalPhones, 300);
    setTimeout(disableLegacyPhoneMasks, 1200);
    setTimeout(initInternationalPhones, 1200);
    watchPopupPhones();
  });

  window.addEventListener('load', function () {
    disableLegacyPhoneMasks();
    initInternationalPhones();
  });

  function watchPopupPhones() {
    if (window.__etPopupPhoneObs) return;
    window.__etPopupPhoneObs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type !== 'attributes' || m.attributeName !== 'class') return;
        var t = m.target;
        if (!t.classList || !t.classList.contains('popup-air')) return;
        if (t.classList.contains('air-popup_active')) {
          disableLegacyPhoneMasks();
          initInternationalPhones(t);
        }
      });
    });
    document.querySelectorAll('.popup-air').forEach(function (p) {
      window.__etPopupPhoneObs.observe(p, { attributes: true, attributeFilter: ['class'] });
    });
    var box = document.querySelector('.air-conteiner');
    if (box && window.MutationObserver) {
      new MutationObserver(function () {
        document.querySelectorAll('.popup-air').forEach(function (p) {
          if (!p.__etPhoneObs) {
            p.__etPhoneObs = 1;
            window.__etPopupPhoneObs.observe(p, { attributes: true, attributeFilter: ['class'] });
          }
        });
      }).observe(box, { childList: true, subtree: true });
    }
  }

  function initMobileSocialFocusFix() {
    document.addEventListener(
      'pointerup',
      function (e) {
        var link = e.target.closest(
          '.header__mobile-contacts .contacts-body-sec__social'
        );
        if (!link) return;
        setTimeout(function () {
          try {
            link.blur();
          } catch (err) {}
        }, 0);
      },
      true
    );
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('.booking-form__cal-panel') || e.target.closest('.booking-form__date-wrap')) {
      return;
    }
    if (e.target.closest('.booking-form__time-panel') || e.target.closest('.booking-form__time-wrap')) {
      return;
    }
    closeAllCalPanels();
  });

  function initBookingDatePickers() {
    if (typeof window.VanillaCalendar !== 'function') return;

    var inputs = document.querySelectorAll(
      '.booking-form__date, input[name="text-search-date"].inp-form__inp'
    );
    inputs.forEach(function (input, index) {
      if (input.dataset.calendarBound === '1') return;
      if (!input.id) {
        input.id = 'booking-form-date-' + index;
      }
      input.dataset.calendarBound = '1';
      input.setAttribute('readonly', 'readonly');
      input.style.cursor = 'pointer';
      input.setAttribute('autocomplete', 'off');

      var parent = input.parentNode;
      if (!parent) return;

      var wrap = document.createElement('div');
      wrap.className = 'booking-form__date-wrap';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);

      var panel = document.createElement('div');
      panel.className = 'booking-form__cal-panel';
      var holder = document.createElement('div');
      holder.id = input.id + '-cal';
      panel.appendChild(holder);
      wrap.appendChild(panel);

      var tomorrow = tomorrowDate();
      if (!String(input.value || '').trim()) {
        input.value = formatUkDate(tomorrow);
      }

      var minDate = formatIsoDate(tomorrow);
      var maxD = tomorrowDate();
      maxD.setFullYear(maxD.getFullYear() + 1);
      var maxDate = formatIsoDate(maxD);

      function parseYMD(iso) {
        var p = String(iso).split('-');
        return {
          y: Number(p[0]),
          m: Number(p[1]) - 1,
          d: Number(p[2]),
        };
      }
      function monthIndex(y, m) {
        return y * 12 + m;
      }
      var minParts = parseYMD(minDate);
      var maxParts = parseYMD(maxDate);
      var minMonthIdx = monthIndex(minParts.y, minParts.m);
      var maxMonthIdx = monthIndex(maxParts.y, maxParts.m);

      var options = {
        date: {
          min: minDate,
          max: maxDate,
        },
        actions: {
          clickDay: function (e, self) {
            if (!self.selectedDates[0]) return;
            var picked = self.selectedDates[0];
            if (/^\d{4}-\d{2}-\d{2}$/.test(picked)) {
              var parts = picked.split('-');
              var parsed = new Date(
                Number(parts[0]),
                Number(parts[1]) - 1,
                Number(parts[2])
              );
              input.value = isNaN(parsed.getTime()) ? picked : formatUkDate(parsed);
            } else {
              input.value = picked;
            }
            panel.classList.remove('is-open');
            try {
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (err) {}
          },
          clickMonth: function (e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          },
          clickYear: function (e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          },
          clickArrow: function () {
            setTimeout(syncMonthArrows, 0);
          },
        },
        settings: {
          lang: 'define',
          range: {
            min: minDate,
            max: maxDate,
            disablePast: true,
          },
          selection: {
            day: 'single',
            month: false,
            year: false,
          },
          visibility: {
            theme: 'light',
            daysOutside: false,
          },
        },
        locale: {
          months: [
            'Січень',
            'Лютий',
            'Березень',
            'Квітень',
            'Травень',
            'Червень',
            'Липень',
            'Серпень',
            'Вересень',
            'Жовтень',
            'Листопад',
            'Грудень',
          ],
          weekday: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
        },
      };

      try {
        var calendar = new window.VanillaCalendar('#' + holder.id, options);
        calendar.init();

        // На мобілці — у body + fixed, щоб не обрізало overflow попапу
        var panelInBody = false;
        function ensurePanelHost() {
          var mobile = window.matchMedia('(max-width: 768px)').matches;
          if (mobile && !panelInBody) {
            document.body.appendChild(panel);
            panelInBody = true;
          } else if (!mobile && panelInBody) {
            wrap.appendChild(panel);
            panelInBody = false;
            panel.style.left = '';
            panel.style.top = '';
            panel.style.width = '';
            panel.style.position = '';
            panel.style.zIndex = '';
            panel.style.removeProperty('display');
          }
        }

        function placeBookingCalPanel() {
          ensurePanelHost();
          if (!panelInBody) return;
          var rect = wrap.getBoundingClientRect();
          var width = Math.min(300, window.innerWidth - 16);
          var height = 320;
          var left = rect.left;
          if (left + width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - width - 8);
          }
          // На телефоні завжди відкриваємо вгору
          var top = Math.max(8, rect.top - height - 8);
          panel.style.position = 'fixed';
          panel.style.left = left + 'px';
          panel.style.top = top + 'px';
          panel.style.width = width + 'px';
          panel.style.zIndex = '100060';
          panel.style.setProperty('display', 'block', 'important');
        }

        function currentMonthIdx() {
          var monthsUa = [
            'Січень',
            'Лютий',
            'Березень',
            'Квітень',
            'Травень',
            'Червень',
            'Липень',
            'Серпень',
            'Вересень',
            'Жовтень',
            'Листопад',
            'Грудень',
          ];
          var header =
            holder.querySelector('.vanilla-calendar-header__content') ||
            holder.querySelector('.vanilla-calendar-header');
          if (header) {
            var text = String(header.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();
            var yearMatch = text.match(/(\d{4})/);
            if (yearMatch) {
              var year = Number(yearMatch[1]);
              for (var i = 0; i < monthsUa.length; i++) {
                if (text.indexOf(monthsUa[i]) !== -1) {
                  return monthIndex(year, i);
                }
              }
            }
          }

          var y = typeof calendar.selectedYear === 'number' ? calendar.selectedYear : minParts.y;
          var m = typeof calendar.selectedMonth === 'number' ? calendar.selectedMonth : minParts.m;
          var yEl = holder.querySelector('[data-calendar-selected-year]');
          var mEl = holder.querySelector('[data-calendar-selected-month]');
          if (yEl) y = Number(yEl.getAttribute('data-calendar-selected-year'));
          if (mEl) m = Number(mEl.getAttribute('data-calendar-selected-month'));
          return monthIndex(y, m);
        }

        function setArrowState(btn, enabled) {
          if (!btn) return;
          if (enabled) {
            btn.removeAttribute('disabled');
            btn.classList.remove('is-arrow-disabled');
            btn.style.setProperty('pointer-events', 'auto', 'important');
            btn.style.setProperty('opacity', '1', 'important');
            btn.style.setProperty('visibility', 'visible', 'important');
            btn.style.setProperty('cursor', 'pointer', 'important');
          } else {
            btn.setAttribute('disabled', 'disabled');
            btn.classList.add('is-arrow-disabled');
            btn.style.setProperty('pointer-events', 'none', 'important');
            btn.style.setProperty('opacity', '0.28', 'important');
          }
        }

        function syncMonthArrows() {
          var cur = currentMonthIdx();
          var prev = holder.querySelector('.vanilla-calendar-arrow_prev');
          var next = holder.querySelector('.vanilla-calendar-arrow_next');
          setArrowState(prev, cur > minMonthIdx);
          setArrowState(next, cur < maxMonthIdx);
        }

        holder.addEventListener(
          'click',
          function (e) {
            var prev = e.target.closest('.vanilla-calendar-arrow_prev');
            var next = e.target.closest('.vanilla-calendar-arrow_next');
            if (!prev && !next) return;
            // Даємо VanillaCalendar змінити місяць, потім оновлюємо стан стрілок
            setTimeout(syncMonthArrows, 0);
            setTimeout(syncMonthArrows, 50);
            var cur = currentMonthIdx();
            if (prev && cur <= minMonthIdx) {
              e.preventDefault();
              e.stopPropagation();
              if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
              syncMonthArrows();
              return;
            }
            if (next && cur >= maxMonthIdx) {
              e.preventDefault();
              e.stopPropagation();
              if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
              syncMonthArrows();
            }
          },
          true
        );

        holder.addEventListener(
          'click',
          function (e) {
            var btn = e.target.closest('.vanilla-calendar-month, .vanilla-calendar-year');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          },
          true
        );

        syncMonthArrows();
        var arrowWatcher = new MutationObserver(function () {
          syncMonthArrows();
        });
        arrowWatcher.observe(holder, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            'data-calendar-selected-month',
            'data-calendar-selected-year',
            'class',
            'disabled',
          ],
        });

        input.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var willOpen = !panel.classList.contains('is-open');
          closeAllCalPanels();
          if (willOpen) {
            panel.classList.add('is-open');
            placeBookingCalPanel();
            setTimeout(syncMonthArrows, 0);
            setTimeout(syncMonthArrows, 50);
          }
        });
        input.addEventListener('focus', function (ev) {
          ev.preventDefault();
          input.blur();
        });
        window.addEventListener(
          'resize',
          function () {
            if (panel.classList.contains('is-open')) placeBookingCalPanel();
          },
          { passive: true }
        );
      } catch (err) {
        input.dataset.calendarBound = '0';
        if (panel.parentNode) panel.parentNode.removeChild(panel);
      }
    });
  }
  // одразу (скрипт може бути в кінці body)
  try { initContactLeadPixel(); } catch (e0) {}
})();
