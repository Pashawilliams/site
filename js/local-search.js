/*! Пошук маршруту: регіони UA/EU, swap, календар, скрол до напрямків */
(function () {
  'use strict';

  var ROUTE = window.__eurotourRouteData || {};
  var UA_IDS = ROUTE.UA_IDS || {};
  var UA_CITIES = ROUTE.UA_CITIES || [];

  var REGION_LABEL = { ua: 'Україна', eu: 'Європа' };
  var allCities = [];
  var fromRegion = 'ua';
  var toRegion = 'eu';

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function tomorrowISO() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return toISO(d);
  }

  function plusOneYearISO() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    d.setFullYear(d.getFullYear() + 1);
    return toISO(d);
  }

  function collectCities(select) {
    var list = [];
    Array.prototype.forEach.call(select.options, function (opt) {
      if (!opt.value) return;
      list.push({ id: String(opt.value), name: opt.textContent.trim() });
    });
    return list;
  }

  function fillSelect(select, region, keepValue) {
    var prev = keepValue != null ? String(keepValue) : String(select.value || '');
    var placeholder = select.id === 'search-from' ? 'Звідки' : 'Куди';
    var html =
      '<option value="" disabled selected hidden>' + placeholder + '</option>';
    var list = allCities.slice();
    if (region === 'ua') {
      list = list
        .filter(function (c) { return !!UA_IDS[c.id]; })
        .sort(function (a, b) {
          return (b.pop || 0) - (a.pop || 0) || a.name.localeCompare(b.name, 'uk');
        });
    } else {
      list = list
        .filter(function (c) { return !UA_IDS[c.id]; })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'uk'); });
    }
    list.forEach(function (c) {
      html += '<option value="' + c.id + '">' + c.name + '</option>';
    });
    select.innerHTML = html;
    if (prev && select.querySelector('option[value="' + prev + '"]')) {
      select.value = prev;
    } else {
      select.selectedIndex = 0;
    }
  }

  function updateLabels() {
    var fromLab = document.querySelector('[data-region-for="search-from"]');
    var toLab = document.querySelector('[data-region-for="search-to"]');
    if (fromLab) fromLab.textContent = REGION_LABEL[fromRegion];
    if (toLab) toLab.textContent = REGION_LABEL[toRegion];
  }

  function applyRegions(keepFrom, keepTo) {
    var fromSel = document.getElementById('search-from');
    var toSel = document.getElementById('search-to');
    if (!fromSel || !toSel) return;
    fillSelect(fromSel, fromRegion, keepFrom);
    fillSelect(toSel, toRegion, keepTo);
    updateLabels();
  }

  function swapRegions() {
    var fromSel = document.getElementById('search-from');
    var toSel = document.getElementById('search-to');
    if (!fromSel || !toSel) return;
    var fromVal = fromSel.value;
    var toVal = toSel.value;
    var tmp = fromRegion;
    fromRegion = toRegion;
    toRegion = tmp;
    applyRegions(toVal, fromVal);
  }

  function bindHeaderOpen(select) {
    var header = select.closest('.search__input-header');
    if (!header || header.dataset.openBound === '1') return;
    header.dataset.openBound = '1';
    header.style.cursor = 'pointer';
    header.addEventListener('click', function (e) {
      if (e.target === select) return;
      e.preventDefault();
      try {
        if (typeof select.showPicker === 'function') {
          select.showPicker();
        } else {
          select.focus();
          select.click();
        }
      } catch (err) {
        select.focus();
      }
    });
  }

  function initRegions() {
    var fromSel = document.getElementById('search-from');
    var toSel = document.getElementById('search-to');
    if (!fromSel || !toSel) return;
    var fromHtml = collectCities(fromSel);
    var toHtml = collectCities(toSel);
    var byId = {};
    fromHtml.concat(toHtml).forEach(function (c) {
      if (!c.id) return;
      byId[c.id] = { id: c.id, name: c.name, pop: 0 };
    });
    // повний список UA міст 50к+ (від більшого)
    UA_CITIES.forEach(function (c) {
      byId[c.id] = { id: c.id, name: c.name, pop: c.pop || 0 };
      UA_IDS[c.id] = 1;
    });
    allCities = Object.keys(byId).map(function (k) { return byId[k]; });

    var fromWrap = fromSel.closest('.search__input-wrapper');
    var toWrap = toSel.closest('.search__input-wrapper');
    if (fromWrap && !fromWrap.querySelector('.search__region-label')) {
      var fl = document.createElement('div');
      fl.className = 'search__region-label';
      fl.setAttribute('data-region-for', 'search-from');
      fromWrap.appendChild(fl);
    }
    if (toWrap && !toWrap.querySelector('.search__region-label')) {
      var tl = document.createElement('div');
      tl.className = 'search__region-label';
      tl.setAttribute('data-region-for', 'search-to');
      toWrap.appendChild(tl);
    }

    if (fromWrap && toWrap && !document.getElementById('search-swap')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'search-swap';
      btn.className = 'search__swap-btn';
      btn.setAttribute('aria-label', 'Поміняти місцями');
      btn.title = 'Поміняти місцями';
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M7 7H21M21 7L17 3M21 7L17 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M17 17H3M3 17L7 13M3 17L7 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
      fromWrap.parentNode.insertBefore(btn, toWrap);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        btn.classList.remove('is-swap-anim');
        void btn.offsetWidth;
        btn.classList.add('is-swap-anim');
        window.setTimeout(function () {
          btn.classList.remove('is-swap-anim');
        }, 360);
        swapRegions();
      });
    }

    applyRegions('', '');
    bindHeaderOpen(fromSel);
    bindHeaderOpen(toSel);
  }

  function closeSearchCal() {
    document.querySelectorAll('.search__cal-panel').forEach(function (p) {
      p.classList.remove('is-open');
      p.style.left = '';
      p.style.top = '';
      p.style.width = '';
      p.style.position = '';
      p.style.zIndex = '';
      p.style.setProperty('display', 'none', 'important');
    });
  }

  function placeCalPanel(panel, anchor) {
    var rect = anchor.getBoundingClientRect();
    var width = 300;
    var height = 300;
    var left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    var top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 8);
    }
    panel.style.position = 'fixed';
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.width = width + 'px';
    panel.style.zIndex = '100060';
    panel.style.setProperty('display', 'block', 'important');
  }

  function initMainCalendar() {
    bindSearchCalendar(document.getElementById('calendar2'), 'calendar2-inline');
  }

  function bindSearchCalendar(input, holderId) {
    if (!input || typeof window.VanillaCalendar !== 'function') return;
    if (input.dataset.localCalBound === '1') return;

    // type=date → text, щоб був наш календар
    if (String(input.type || '').toLowerCase() === 'date') {
      input.type = 'text';
    }

    var keepId = input.id || '';
    var clean = input.cloneNode(true);
    input.parentNode.replaceChild(clean, input);
    input = clean;
    if (keepId) input.id = keepId;
    input.dataset.localCalBound = '1';
    input.setAttribute('readonly', 'readonly');
    input.setAttribute('placeholder', 'Дата');
    input.style.cursor = 'pointer';
    input.value = input.value || '';

    document.querySelectorAll('body > .vanilla-calendar.vanilla-calendar_to-input').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    var header = input.closest('.search__input-header');
    var valueBox = input.closest('.select-date__value') || input.parentNode;
    if (!valueBox.querySelector('.search__date-wrap')) {
      var wrap = document.createElement('div');
      wrap.className = 'search__date-wrap';
      valueBox.insertBefore(wrap, input);
      wrap.appendChild(input);
    } else {
      valueBox.querySelector('.search__date-wrap').appendChild(input);
    }
    var dateWrap = input.closest('.search__date-wrap');

    var panel = document.createElement('div');
    panel.className = 'search__cal-panel';
    var holder = document.createElement('div');
    holder.id = holderId || ('search-cal-' + Math.random().toString(36).slice(2, 9));
    panel.appendChild(holder);
    document.body.appendChild(panel);

    var minDate = tomorrowISO();
    var maxDate = plusOneYearISO();

    function parseYMD(iso) {
      var p = String(iso).split('-');
      return {
        y: Number(p[0]),
        m: Number(p[1]) - 1,
        d: Number(p[2])
      };
    }

    function monthIndex(y, m) {
      return y * 12 + m;
    }

    try {
      var minParts = parseYMD(minDate);
      var maxParts = parseYMD(maxDate);
      var minMonthIdx = monthIndex(minParts.y, minParts.m);
      var maxMonthIdx = monthIndex(maxParts.y, maxParts.m);

      var calendar = new window.VanillaCalendar('#' + holder.id, {
        date: {
          min: minDate,
          max: maxDate
        },
        actions: {
          clickDay: function (e, self) {
            if (!self.selectedDates[0]) return;
            input.value = self.selectedDates[0];
            closeSearchCal();
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
          }
        },
        settings: {
          lang: 'define',
          range: {
            min: minDate,
            max: maxDate,
            disablePast: true
          },
          selection: {
            day: 'single',
            month: false,
            year: false
          },
          visibility: {
            theme: 'light',
            daysOutside: false
          }
        },
        locale: {
          months: [
            'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
            'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
          ],
          weekday: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
        }
      });
      calendar.init();

      function currentMonthIdx() {
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
          btn.style.pointerEvents = '';
          btn.style.opacity = '';
        } else {
          btn.setAttribute('disabled', 'disabled');
          btn.classList.add('is-arrow-disabled');
          btn.style.pointerEvents = 'none';
          btn.style.opacity = '0.28';
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
        attributes: true,
        attributeFilter: ['data-calendar-selected-month', 'data-calendar-selected-year']
      });

      function openCal(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        var willOpen = !panel.classList.contains('is-open');
        closeSearchCal();
        if (!willOpen) return;
        panel.classList.add('is-open');
        placeCalPanel(panel, header || dateWrap);
        syncMonthArrows();
      }

      input.addEventListener('click', openCal);
      if (header) {
        header.style.cursor = 'pointer';
        header.addEventListener(
          'click',
          function (e) {
            if (e.target.closest('.search__cal-panel')) return;
            openCal(e);
          },
          true
        );
      }
      input.addEventListener('focus', function () {
        input.blur();
      });
      window.addEventListener(
        'resize',
        function () {
          if (panel.classList.contains('is-open')) {
            placeCalPanel(panel, header || dateWrap);
          }
        },
        { passive: true }
      );
    } catch (err) {
      input.dataset.localCalBound = '0';
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function convertLocationToSelect(wrapper, placeholder) {
    var input = wrapper.querySelector('.search__inp-element');
    if (!input || input.tagName === 'SELECT') return input;
    var items = wrapper.querySelectorAll('.search__input-value-element');
    if (!items.length) return input;

    var sel = document.createElement('select');
    sel.className = 'search__inp-element';
    sel.style.cssText = 'background: transparent; border: none; width: 100%; cursor: pointer;';
    Array.prototype.forEach.call(input.attributes, function (attr) {
      if (
        attr.name === 'class' ||
        attr.name === 'type' ||
        attr.name === 'placeholder' ||
        attr.name === 'value' ||
        attr.name === 'autocomplete' ||
        attr.name === 'style'
      ) {
        return;
      }
      sel.setAttribute(attr.name, attr.value);
    });

    var currentText = String(input.value || '').trim();
    var hidden = wrapper.querySelector('.delivery-search__term-id');
    var currentId = hidden ? String(hidden.value || '') : '';

    var html = '<option value="">' + escapeHtml(placeholder) + '</option>';
    Array.prototype.forEach.call(items, function (li) {
      var name = li.textContent.trim();
      var id = li.getAttribute('data-term-id') || '';
      var selected = false;
      if (currentId && id && id === currentId) selected = true;
      else if (!currentId && currentText && name === currentText) selected = true;
      html +=
        '<option value="' +
        escapeHtml(name) +
        '"' +
        (id ? ' data-term-id="' + escapeHtml(id) + '"' : '') +
        (selected ? ' selected' : '') +
        '>' +
        escapeHtml(name) +
        '</option>';
    });
    sel.innerHTML = html;

    input.parentNode.replaceChild(sel, input);
    var list = wrapper.querySelector('.search__input-value');
    if (list) list.style.display = 'none';

    function syncHidden() {
      if (!hidden) return;
      var opt = sel.options[sel.selectedIndex];
      hidden.value = opt ? opt.getAttribute('data-term-id') || '' : '';
    }
    syncHidden();
    sel.addEventListener('change', syncHidden);
    bindHeaderOpen(sel);
    return sel;
  }

  function downSearchLabels(root) {
    var path = String(location.pathname || '').toLowerCase();
    if (path.indexOf('dostavka') !== -1) {
      var fromId = '';
      var toId = '';
      var fromH = root.querySelector('[data-delivery-field="from-id"]');
      var toH = root.querySelector('[data-delivery-field="to-id"]');
      if (fromH) fromId = fromH.value;
      if (toH) toId = toH.value;
      return {
        from: UA_IDS[fromId] ? 'Україна' : 'Європа',
        to: UA_IDS[toId] ? 'Україна' : 'Європа'
      };
    }
    if (path.indexOf('transwer-to-aeroport') !== -1 || path.indexOf('transfer-to-aeroport') !== -1) {
      return { from: 'Україна', to: 'Аеропорт' };
    }
    return { from: 'Аеропорт', to: 'Україна' };
  }

  function enhanceDownSearchRoot(root) {
    if (!root || root.dataset.localDownBound === '1') return;
    root.dataset.localDownBound = '1';
    root.classList.add('main-search-top');

    var fromWrap = root.querySelector('.search__input-location-from') ||
      root.querySelectorAll('.search__input-location')[0];
    var toWrap = root.querySelector('.search__input-location-to') ||
      root.querySelectorAll('.search__input-location')[1];
    if (!fromWrap || !toWrap) return;

    var fromPh = (fromWrap.querySelector('.search__inp-element') &&
      fromWrap.querySelector('.search__inp-element').getAttribute('placeholder')) || 'Звідки';
    var toPh = (toWrap.querySelector('.search__inp-element') &&
      toWrap.querySelector('.search__inp-element').getAttribute('placeholder')) || 'Куди';

    var fromSel = convertLocationToSelect(fromWrap, fromPh.replace(/\.\.\.$/, ''));
    var toSel = convertLocationToSelect(toWrap, toPh.replace(/\.\.\.$/, ''));

    var labels = downSearchLabels(root);
    if (!fromWrap.querySelector('.search__region-label')) {
      var fl = document.createElement('div');
      fl.className = 'search__region-label';
      fl.setAttribute('data-down-label', 'from');
      fl.textContent = labels.from;
      fromWrap.appendChild(fl);
    }
    if (!toWrap.querySelector('.search__region-label')) {
      var tl = document.createElement('div');
      tl.className = 'search__region-label';
      tl.setAttribute('data-down-label', 'to');
      tl.textContent = labels.to;
      toWrap.appendChild(tl);
    }

    var oldSwitch = root.querySelector('.search__direction-switch');
    if (oldSwitch) oldSwitch.style.display = 'none';

    if (!root.querySelector('.search__swap-btn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search__swap-btn';
      btn.setAttribute('aria-label', 'Поміняти місцями');
      btn.title = 'Поміняти місцями';
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M7 7H21M21 7L17 3M21 7L17 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M17 17H3M3 17L7 13M3 17L7 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
      fromWrap.parentNode.insertBefore(btn, toWrap);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        btn.classList.remove('is-swap-anim');
        void btn.offsetWidth;
        btn.classList.add('is-swap-anim');
        window.setTimeout(function () {
          btn.classList.remove('is-swap-anim');
        }, 360);
        if (!fromSel || !toSel) return;
        var fv = fromSel.value;
        var tv = toSel.value;
        var fi = fromSel.innerHTML;
        var ti = toSel.innerHTML;
        fromSel.innerHTML = ti;
        toSel.innerHTML = fi;
        fromSel.value = tv;
        toSel.value = fv;
        fromSel.dispatchEvent(new Event('change', { bubbles: true }));
        toSel.dispatchEvent(new Event('change', { bubbles: true }));
        var fromLab = fromWrap.querySelector('[data-down-label="from"]');
        var toLab = toWrap.querySelector('[data-down-label="to"]');
        if (fromLab && toLab) {
          var tmp = fromLab.textContent;
          fromLab.textContent = toLab.textContent;
          toLab.textContent = tmp;
        }
        if (typeof window.__eurotourDeliveryFlipReverse === 'function') {
          window.__eurotourDeliveryFlipReverse();
        }
      });
    }

    var dateInput =
      root.querySelector('#calendar3') ||
      root.querySelector('#delivery-calendar') ||
      root.querySelector('.select-date input') ||
      root.querySelector('[data-delivery-input="date"]');
    if (dateInput) {
      var hid = 'cal-inline-' + (dateInput.id || 'down') + '-' + Math.random().toString(36).slice(2, 6);
      bindSearchCalendar(dateInput, hid);
    }
  }

  function initDownSearches() {
    document.querySelectorAll('.main-search-down, [data-delivery-search-root]').forEach(enhanceDownSearchRoot);
  }

  function highlightCard(el) {
    document.querySelectorAll('.direction-element.is-search-highlight').forEach(function (n) {
      n.classList.remove('is-search-highlight');
    });
    el.classList.add('is-search-highlight');
    setTimeout(function () {
      el.classList.remove('is-search-highlight');
    }, 3500);
  }

  function updateDateHint(el, searchDate) {
    var dateHintEl = el.querySelector('.direction-element__date-hint');
    if (!dateHintEl) return;
    if (searchDate) {
      dateHintEl.textContent = 'Відправлення ' + searchDate;
      return;
    }
    var departureTimes = [];
    try {
      departureTimes = JSON.parse(el.getAttribute('data-departure-times') || '[]');
    } catch (e) {}
    var now = new Date();
    var currentTimeVal = now.getHours() * 60 + now.getMinutes();
    var hasLaterBus = false;
    for (var i = 0; i < departureTimes.length; i++) {
      var parts = String(departureTimes[i]).split(':');
      var busTimeVal = Number(parts[0]) * 60 + Number(parts[1] || 0);
      if (busTimeVal > currentTimeVal) {
        hasLaterBus = true;
        break;
      }
    }
    dateHintEl.textContent = hasLaterBus ? 'Відправлення Сьогодні' : 'Відправлення Завтра';
  }

  function cityNameById(id) {
    if (!id) return '';
    for (var i = 0; i < allCities.length; i++) {
      if (String(allCities[i].id) === String(id)) return allCities[i].name;
    }
    var opt =
      document.querySelector('#search-from option[value="' + id + '"]') ||
      document.querySelector('#search-to option[value="' + id + '"]');
    return opt ? opt.textContent.trim() : String(id);
  }

  function findTargetCard(fromId, toId) {
    var elements = Array.prototype.slice.call(document.querySelectorAll('.direction-element'));
    var exact = null;
    var soft = null;

    elements.forEach(function (el) {
      var elFrom = String(el.getAttribute('data-from') || '');
      var elTo = String(el.getAttribute('data-to') || '');
      var stops = (el.getAttribute('data-stops') || '').split(',').filter(Boolean);

      if (!(fromId && toId)) return;

      if (elFrom === fromId && elTo === toId) {
        if (!exact) exact = el;
        return;
      }

      var fromIdx = elFrom === fromId ? -1 : stops.indexOf(fromId);
      var toIdx = elTo === toId ? stops.length : stops.indexOf(toId);
      var fromOk = elFrom === fromId || fromIdx !== -1;
      var toOk = elTo === toId || toIdx !== -1;
      if (!fromOk || !toOk) return;

      var fromPos = elFrom === fromId ? -1 : fromIdx;
      var toPos = elTo === toId ? 999 : toIdx;
      if (fromPos < toPos && !soft) soft = el;
    });

    if (exact) {
      return {
        card: exact,
        via: false,
        fromId: fromId,
        toId: toId
      };
    }
    if (soft) {
      return {
        card: soft,
        via: true,
        fromId: fromId,
        toId: toId
      };
    }
    return null;
  }

  function clearStopNotes() {
    document.querySelectorAll('.direction-element__stop-note').forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }

  function showStopNote(card, fromId, toId) {
    if (!card) return;
    clearStopNotes();

    var routeFrom = card.getAttribute('data-from-name') || cityNameById(card.getAttribute('data-from'));
    var routeTo = card.getAttribute('data-to-name') || cityNameById(card.getAttribute('data-to'));
    var elFrom = String(card.getAttribute('data-from') || '');
    var elTo = String(card.getAttribute('data-to') || '');
    var fromName = cityNameById(fromId);
    var toName = cityNameById(toId);

    var parts = [];
    if (fromId && fromId !== elFrom) {
      parts.push(fromName + ' — проміжна зупинка');
    }
    if (toId && toId !== elTo) {
      parts.push(toName + ' — проміжна зупинка');
    }
    if (!parts.length) return;

    var note = document.createElement('div');
    note.className = 'direction-element__stop-note';
    note.innerHTML =
      '<strong>' +
      parts.join('. ') +
      '</strong>' +
      '<span>на маршруті ' +
      routeFrom +
      ' → ' +
      routeTo +
      '</span>';

    var loc = card.querySelector('.direction-element__location') || card;
    loc.appendChild(note);
  }

  function flashEmptyFields(needFrom, needTo, needDate) {
    var fromSel = document.getElementById('search-from');
    var toSel = document.getElementById('search-to');
    var dateInput = document.getElementById('calendar2');
    var headers = [];
    if (needFrom && fromSel) {
      var fh = fromSel.closest('.search__input-header');
      if (fh) headers.push(fh);
    }
    if (needTo && toSel) {
      var th = toSel.closest('.search__input-header');
      if (th) headers.push(th);
    }
    if (needDate && dateInput) {
      var dh = dateInput.closest('.search__input-header');
      if (dh) headers.push(dh);
    }
    headers.forEach(function (h) {
      h.classList.remove('is-search-field-error', 'is-search-field-error-out');
      void h.offsetWidth;
      h.classList.add('is-search-field-error');
      window.setTimeout(function () {
        h.classList.remove('is-search-field-error');
        h.classList.add('is-search-field-error-out');
        window.setTimeout(function () {
          h.classList.remove('is-search-field-error-out');
        }, 320);
      }, 1400);
    });
  }

  function scrollToCard(card, searchDate, matchInfo) {
    if (!card) return;
    if (searchDate) updateDateHint(card, searchDate);
    if (matchInfo && matchInfo.via) {
      showStopNote(card, matchInfo.fromId, matchInfo.toId);
    } else {
      clearStopNotes();
    }
    var extra = document.getElementById('direction-extra');
    var wasClosed = !!(extra && !extra.classList.contains('is-open'));
    if (typeof window.__eurotourOpenDirections === 'function') {
      window.__eurotourOpenDirections();
    }

    function doScroll() {
      var rect = card.getBoundingClientRect();
      var absoluteTop = (window.pageYOffset || document.documentElement.scrollTop || 0) + rect.top;
      var target = absoluteTop - window.innerHeight / 2 + rect.height / 2;
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      highlightCard(card);
    }

    setTimeout(doScroll, wasClosed ? 650 : 80);
  }

  function enhanceSearchButtons() {
    // «Знайти рейс» на головній відкриває заявку через local-forms.js —
    // тут лише скидання, без competing capture-handler.
    var resetBtn = document.getElementById('reset-button');

    if (resetBtn && resetBtn.dataset.localResetBound !== '1') {
      resetBtn.dataset.localResetBound = '1';
      resetBtn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

          var fromSel = document.getElementById('search-from');
          var toSel = document.getElementById('search-to');
          var cal = document.getElementById('calendar2');
          if (fromSel) fromSel.selectedIndex = 0;
          if (toSel) toSel.selectedIndex = 0;
          if (cal) cal.value = '';
          clearStopNotes();
          document.querySelectorAll('.direction-element').forEach(function (el) {
            updateDateHint(el, null);
          });
          if (typeof window.__eurotourOpenDirections === 'function') {
            window.__eurotourOpenDirections();
          }
          var wrap = document.querySelector('.direction-sec__wrapper');
          if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        true
      );
    }
  }

  function boot() {
    // Синхронно до першої взаємодії — інакше INPUT→SELECT «з’їдає» вибір
    // і стрибає вёрстка через ~250–800 мс.
    try {
      initRegions();
    } catch (e1) {}
    try {
      initDownSearches();
    } catch (e2) {}
    try {
      enhanceSearchButtons();
    } catch (e3) {}
    try {
      initMainCalendar();
    } catch (e4) {}
  }

  document.addEventListener('click', function (e) {
    if (
      e.target.closest('.search__cal-panel') ||
      e.target.closest('#calendar2') ||
      e.target.closest('#calendar3') ||
      e.target.closest('#delivery-calendar') ||
      e.target.closest('.select-date .search__input-header') ||
      e.target.closest('.search__date-wrap')
    ) {
      return;
    }
    closeSearchCal();
  });

  window.addEventListener(
    'scroll',
    function () {
      closeSearchCal();
    },
    true
  );

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
