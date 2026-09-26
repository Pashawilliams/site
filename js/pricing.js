/*!
 * Eurotour Pricing & Duration Engine
 * - Dynamic OSRM/NBU rate calculation with fallback
 * - Manual route price overrides support
 * - Dynamic route card prices & discount badges
 * - Duration lookup & sync
 */
(function () {
  'use strict';

  var P = {
    currency: 'UAH',
    eur_rate: 51.45,
    rate_auto: true,
    extra_hours: 3.0,
    tiers: [
      [6, 8, 90, 120],
      [8, 10, 100, 140],
      [10, 12, 130, 170],
      [12, 14, 140, 180],
      [14, 16, 150, 190],
      [16, 18, 160, 200],
      [18, 20, 160, 200],
      [20, 22, 170, 210],
      [22, 24, 180, 220],
      [24, 27, 190, 230],
      [27, 30, 200, 240],
      [30, 33, 210, 250],
      [33, 36, 210, 250],
      [36, 39, 220, 260],
      [39, 42, 230, 270],
      [42, 45, 240, 280],
      [45, 999, 250, 290]
    ],
    discounts: [
      { label: 'Пенсіонерам', pct: 10 },
      { label: 'Дітям', pct: 15 }
    ]
  };

  var durations = {};
  var manualPrices = {}; // "From|To" -> { price, old_price }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function norm(city) {
    return String(city || '').trim().toLowerCase();
  }

  function getDuration(from, to) {
    var key = from + '|' + to;
    var revKey = to + '|' + from;
    if (durations[key]) return durations[key];
    if (durations[revKey]) return durations[revKey];

    // Normalized search
    var nf = norm(from), nt = norm(to);
    for (var k in durations) {
      var parts = k.split('|');
      if (parts.length === 2) {
        if (norm(parts[0]) === nf && norm(parts[1]) === nt) return durations[k];
        if (norm(parts[0]) === nt && norm(parts[1]) === nf) return durations[k];
      }
    }
    return null;
  }

  function quote(from, to, cls) {
    cls = (cls || 'comfort').toLowerCase();
    
    // Check manual override first
    var key = from + '|' + to;
    var revKey = to + '|' + from;
    var manual = manualPrices[key] || manualPrices[revKey];
    if (!manual) {
      var nf = norm(from), nt = norm(to);
      for (var mk in manualPrices) {
        var mparts = mk.split('|');
        if (mparts.length === 2) {
          if (norm(mparts[0]) === nf && norm(mparts[1]) === nt) { manual = manualPrices[mk]; break; }
          if (norm(mparts[0]) === nt && norm(mparts[1]) === nf) { manual = manualPrices[mk]; break; }
        }
      }
    }

    if (manual && manual.price) {
      var dur = getDuration(from, to);
      var hours = dur ? dur.hours : null;
      var km = dur ? dur.km : null;
      var p = manual.price;
      var pLux = Math.round(p * 1.3 / 50) * 50;
      var resPrice = (cls === 'lux') ? pLux : p;
      return {
        hours: hours,
        km: km,
        eur: Math.round(resPrice / P.eur_rate),
        uah: resPrice,
        uah_comfort: p,
        uah_lux: pLux,
        manual: true,
        old_price: manual.old_price || null,
        cls: cls
      };
    }

    var d = getDuration(from, to);
    if (!d) return null;
    var h = d.hours;
    var tier = null;
    for (var i = 0; i < P.tiers.length; i++) {
      var row = P.tiers[i];
      if (h >= row[0] && h < row[1]) {
        tier = row;
        break;
      }
    }
    if (!tier) {
      tier = h < P.tiers[0][0] ? P.tiers[0] : P.tiers[P.tiers.length - 1];
    }
    var eur = cls === 'lux' ? tier[3] : tier[2];
    var uah = Math.round((eur * P.eur_rate) / 50) * 50;
    var uahComfort = Math.round((tier[2] * P.eur_rate) / 50) * 50;
    var uahLux = Math.round((tier[3] * P.eur_rate) / 50) * 50;
    return {
      hours: h,
      km: d.km,
      eur: eur,
      uah: uah,
      uah_comfort: uahComfort,
      uah_lux: uahLux,
      open: tier[1] >= 999,
      cls: cls
    };
  }

  function fmt(n) {
    return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function fmtHours(h) {
    var ih = Math.floor(h);
    var m = Math.round((h - ih) * 60);
    return m > 0 ? ih + ' год ' + m + ' хв' : ih + ' год';
  }

  function applyToCards() {
    var cards = document.querySelectorAll('.direction-element');
    cards.forEach(function (card) {
      var fromEl = card.querySelector('.direction-from, [data-from]');
      var toEl = card.querySelector('.direction-to, [data-to]');
      if (!fromEl || !toEl) return;
      var from = (fromEl.getAttribute('data-from') || fromEl.textContent).trim();
      var to = (toEl.getAttribute('data-to') || toEl.textContent).trim();
      if (!from || !to) return;
      
      var q = quote(from, to, 'comfort');
      if (!q) return;

      var priceEl = card.querySelector('.cost-number, .direction-price, [data-price-val]');
      if (priceEl) {
        priceEl.textContent = fmt(q.uah);
      }
      var timeEl = card.querySelector('.direction-time, [data-time-val], .time-val');
      if (timeEl && q.hours) {
        timeEl.textContent = '~' + fmtHours(q.hours);
      }
      
      var oldPriceEl = card.querySelector('.direction-element__old-cost, .old-price, [data-old-price]');
      if (q.old_price) {
        if (!oldPriceEl) {
          oldPriceEl = document.createElement('span');
          oldPriceEl.className = 'direction-element__old-cost';
          if (priceEl && priceEl.parentNode) {
            priceEl.parentNode.insertBefore(oldPriceEl, priceEl);
          }
        }
        if (oldPriceEl) {
          oldPriceEl.textContent = fmt(q.old_price) + ' грн';
          oldPriceEl.style.display = '';
        }
      } else if (oldPriceEl) {
        oldPriceEl.style.display = 'none';
      }
    });
  }

  function updateNbuNote() {
    var notes = document.querySelectorAll('.et-nbu-note, [data-nbu-rate]');
    notes.forEach(function (el) {
      el.textContent = 'Курс НБУ: €1 = ' + Number(P.eur_rate).toFixed(2) + ' ₴';
    });
  }

  function renderDiscountsBlock() {
    var disc = document.querySelector('.et-discounts');
    if (!disc || !P.discounts || !P.discounts.length) return;
    disc.innerHTML = '<span class="et-discounts__t">Знижки</span>' + P.discounts.map(function (x) {
      return '<span class="et-discounts__i"><b>−' + x.pct + '%</b> ' + esc(x.label) + '</span>';
    }).join('') + (P.eur_rate ? '<span class="et-discounts__note et-nbu-note">€1 = ' + Number(P.eur_rate).toFixed(2) + ' ₴</span>' : '');
  }

  function mountSwitchers() {
    renderDiscountsBlock();
    updateNbuNote();
    applyToCards();
  }

  document.addEventListener('site:data', function (e) {
    var d = e.detail || {};
    if (d.pricing) {
      P = Object.assign(P, d.pricing);
    }
    if (d.durations) {
      durations = Object.assign(durations, d.durations);
    }
    if (Array.isArray(d.routes)) {
      manualPrices = {};
      d.routes.forEach(function (r) {
        if (r && r.from && r.to) {
          var k = r.from + '|' + r.to;
          if (r.price != null && r.price > 0) {
            manualPrices[k] = { price: Number(r.price), old_price: r.old_price ? Number(r.old_price) : null };
          }
        }
      });
    }
    mountSwitchers();
  });

  window.__eurotourPricing = {
    cfg: function () { return P; },
    durations: function () { return durations; },
    quote: quote,
    fmt: fmt,
    fmtHours: fmtHours,
    applyToCards: applyToCards
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSwitchers);
  } else {
    mountSwitchers();
  }
})();
