/*! Eurotour route cities + pricing */
(function (w) {
  'use strict';

  var UA_CITIES = [{"id": "9", "name": "Київ", "pop": 2950000, "lat": 50.4501, "lon": 30.5234, "ua": true}, {"id": "201", "name": "Харків", "pop": 1430000, "lat": 49.9935, "lon": 36.2304, "ua": true}, {"id": "141", "name": "Одеса", "pop": 1010000, "lat": 46.4825, "lon": 30.7233, "ua": true}, {"id": "202", "name": "Дніпро", "pop": 980000, "lat": 48.4647, "lon": 35.0462, "ua": true}, {"id": "110", "name": "Львів", "pop": 720000, "lat": 49.8397, "lon": 24.0297, "ua": true}, {"id": "204", "name": "Запоріжжя", "pop": 710000, "lat": 47.8388, "lon": 35.1396, "ua": true}, {"id": "205", "name": "Кривий Ріг", "pop": 600000, "lat": 47.9105, "lon": 33.3919, "ua": true}, {"id": "206", "name": "Миколаїв", "pop": 470000, "lat": 46.975, "lon": 31.9946, "ua": true}, {"id": "35", "name": "Вінниця", "pop": 370000, "lat": 49.2331, "lon": 28.4682, "ua": true}, {"id": "212", "name": "Херсон", "pop": 280000, "lat": 46.6354, "lon": 32.6169, "ua": true}, {"id": "213", "name": "Полтава", "pop": 280000, "lat": 49.5883, "lon": 34.5514, "ua": true}, {"id": "214", "name": "Чернігів", "pop": 280000, "lat": 51.4982, "lon": 31.2893, "ua": true}, {"id": "215", "name": "Черкаси", "pop": 270000, "lat": 49.4444, "lon": 32.0598, "ua": true}, {"id": "216", "name": "Хмельницький", "pop": 270000, "lat": 49.4229, "lon": 26.9871, "ua": true}, {"id": "217", "name": "Чернівці", "pop": 265000, "lat": 48.2921, "lon": 25.9358, "ua": true}, {"id": "30", "name": "Житомир", "pop": 260000, "lat": 50.2547, "lon": 28.6587, "ua": true}, {"id": "218", "name": "Суми", "pop": 260000, "lat": 50.9077, "lon": 34.7981, "ua": true}, {"id": "31", "name": "Рівне", "pop": 245000, "lat": 50.6199, "lon": 26.2516, "ua": true}, {"id": "220", "name": "Кам'янське", "pop": 230000, "lat": 48.511, "lon": 34.6021, "ua": true}, {"id": "221", "name": "Івано-Франківськ", "pop": 230000, "lat": 48.9226, "lon": 24.7111, "ua": true}, {"id": "222", "name": "Кропивницький", "pop": 220000, "lat": 48.5079, "lon": 32.2623, "ua": true}, {"id": "223", "name": "Тернопіль", "pop": 220000, "lat": 49.5535, "lon": 25.5948, "ua": true}, {"id": "224", "name": "Кременчук", "pop": 215000, "lat": 49.068, "lon": 33.4204, "ua": true}, {"id": "32", "name": "Луцьк", "pop": 215000, "lat": 50.7472, "lon": 25.3254, "ua": true}, {"id": "139", "name": "Біла Церква", "pop": 200000, "lat": 49.795, "lon": 30.116, "ua": true}, {"id": "131", "name": "Ужгород", "pop": 115000, "lat": 48.6208, "lon": 22.2879, "ua": true}, {"id": "229", "name": "Бровари", "pop": 110000, "lat": 50.5111, "lon": 30.7909, "ua": true}, {"id": "230", "name": "Нікополь", "pop": 107000, "lat": 47.5712, "lon": 34.3964, "ua": true}, {"id": "234", "name": "Павлоград", "pop": 100000, "lat": 48.52, "lon": 35.87, "ua": true}, {"id": "235", "name": "Кам'янець-Подільський", "pop": 98000, "lat": 48.68, "lon": 26.58, "ua": true}, {"id": "130", "name": "Мукачево", "pop": 85000, "lat": 48.4414, "lon": 22.7139, "ua": true}, {"id": "238", "name": "Конотоп", "pop": 84000, "lat": 51.24, "lon": 33.2, "ua": true}, {"id": "140", "name": "Умань", "pop": 82000, "lat": 48.748, "lon": 30.221, "ua": true}, {"id": "245", "name": "Олександрія", "pop": 77000, "lat": 48.67, "lon": 33.12, "ua": true}, {"id": "239", "name": "Дрогобич", "pop": 74000, "lat": 49.352, "lon": 23.506, "ua": true}, {"id": "240", "name": "Бердичів", "pop": 73000, "lat": 49.899, "lon": 28.602, "ua": true}, {"id": "241", "name": "Шостка", "pop": 72000, "lat": 51.863, "lon": 33.48, "ua": true}, {"id": "143", "name": "Ізмаїл", "pop": 70000, "lat": 45.35, "lon": 28.84, "ua": true}, {"id": "244", "name": "Самар", "pop": 70000, "lat": 48.63, "lon": 35.23, "ua": true}, {"id": "246", "name": "Ковель", "pop": 68000, "lat": 51.215, "lon": 24.709, "ua": true}, {"id": "248", "name": "Ніжин", "pop": 66000, "lat": 51.048, "lon": 31.886, "ua": true}, {"id": "249", "name": "Сміла", "pop": 66000, "lat": 49.237, "lon": 31.872, "ua": true}, {"id": "250", "name": "Ірпінь", "pop": 65000, "lat": 50.521, "lon": 30.25, "ua": true}, {"id": "251", "name": "Калуш", "pop": 65000, "lat": 49.043, "lon": 24.367, "ua": true}, {"id": "252", "name": "Червоноград", "pop": 65000, "lat": 50.39, "lon": 24.23, "ua": true}, {"id": "253", "name": "Бориспіль", "pop": 64000, "lat": 50.352, "lon": 30.955, "ua": true}, {"id": "254", "name": "Первомайськ", "pop": 64000, "lat": 48.044, "lon": 30.85, "ua": true}, {"id": "255", "name": "Коростень", "pop": 62000, "lat": 50.95, "lon": 28.64, "ua": true}, {"id": "256", "name": "Коломия", "pop": 60000, "lat": 48.53, "lon": 25.04, "ua": true}, {"id": "135", "name": "Стрий", "pop": 60000, "lat": 49.262, "lon": 23.856, "ua": true}, {"id": "258", "name": "Чорноморськ", "pop": 58000, "lat": 46.301, "lon": 30.657, "ua": true}, {"id": "117", "name": "Звягель", "pop": 55000, "lat": 50.59, "lon": 27.62, "ua": true}, {"id": "264", "name": "Лозова", "pop": 53000, "lat": 48.889, "lon": 36.317, "ua": true}, {"id": "263", "name": "Прилуки", "pop": 52000, "lat": 50.593, "lon": 32.387, "ua": true}, {"id": "266", "name": "Нововолинськ", "pop": 50000, "lat": 50.733, "lon": 24.163, "ua": true}];
  var UA_IDS = {"9": 1, "201": 1, "141": 1, "202": 1, "110": 1, "204": 1, "205": 1, "206": 1, "35": 1, "212": 1, "213": 1, "214": 1, "215": 1, "216": 1, "217": 1, "30": 1, "218": 1, "31": 1, "220": 1, "221": 1, "222": 1, "223": 1, "224": 1, "32": 1, "139": 1, "131": 1, "229": 1, "230": 1, "234": 1, "235": 1, "130": 1, "238": 1, "140": 1, "245": 1, "239": 1, "240": 1, "241": 1, "143": 1, "244": 1, "246": 1, "248": 1, "249": 1, "250": 1, "251": 1, "252": 1, "253": 1, "254": 1, "255": 1, "256": 1, "135": 1, "258": 1, "117": 1, "264": 1, "263": 1, "266": 1};
  var EU_COORDS = {"Амстердам": [52.3676, 4.9041], "Берлін": [52.52, 13.405], "Братислава": [48.1486, 17.1077], "Бреїла": [45.2692, 27.9575], "Брно": [49.1951, 16.6068], "Будапешт": [47.4979, 19.0402], "Бухарест": [44.4268, 26.1025], "Варшава": [52.2297, 21.0122], "Вроцлав": [51.1079, 17.0385], "Відень": [48.2082, 16.3738], "Галац": [45.4353, 28.008], "Дрезден": [51.0504, 13.7373], "Жешув": [50.0413, 21.999], "Захонь": [48.405, 22.176], "Катовіце": [50.2649, 19.0238], "Кишинів": [47.0105, 28.8638], "Краків": [50.0647, 19.945], "Люблін": [51.2465, 22.5684], "Медика": [49.804, 22.932], "Мілан": [45.4642, 9.19], "Ньїредьхаза": [47.955, 21.717], "Оломоуц": [49.5938, 17.2509], "Острава": [49.8209, 18.2625], "Паланка": [46.414, 29.67], "Париж": [48.8566, 2.3522], "Перемишль": [49.785, 22.767], "Познань": [52.4064, 16.9252], "Прага": [50.0755, 14.4378], "Їглава": [49.3961, 15.591]};
  var KNOWN = {};
  var KNOWN_LIST = [["Київ", "Варшава", 4200], ["Львів", "Варшава", 3100], ["Київ", "Краків", 4400], ["Львів", "Краків", 2900], ["Київ", "Вроцлав", 4900], ["Львів", "Вроцлав", 3400], ["Київ", "Берлін", 5200], ["Львів", "Берлін", 4700], ["Київ", "Дрезден", 5200], ["Київ", "Прага", 5200], ["Львів", "Прага", 3900], ["Київ", "Братислава", 4700], ["Львів", "Братислава", 3400], ["Київ", "Будапешт", 5200], ["Львів", "Будапешт", 3600], ["Київ", "Відень", 5200], ["Львів", "Відень", 3600], ["Київ", "Бухарест", 4200], ["Одеса", "Бухарест", 3100], ["Київ", "Кишинів", 2900], ["Одеса", "Кишинів", 1600], ["Київ", "Мілан", 7300], ["Львів", "Мілан", 6000], ["Київ", "Париж", 7800], ["Львів", "Амстердам", 6200]];
  KNOWN_LIST.forEach(function (row) {
    var p = Math.round(row[2] * 1.18 / 100) * 100;
    if (p > 6800) p = 6800;
    if (p < 1600) p = 1600;
    KNOWN[row[0] + '|' + row[1]] = p;
    KNOWN[row[1] + '|' + row[0]] = p;
  });

  var COORDS = {};
  UA_CITIES.forEach(function (c) {
    COORDS[c.name] = [c.lat, c.lon];
  });
  Object.keys(EU_COORDS).forEach(function (k) {
    COORDS[k] = EU_COORDS[k];
  });

  var HUBS = ['Київ', 'Львів', 'Одеса', 'Харків', 'Дніпро', 'Вінниця', 'Ужгород'];

  function haversineKm(a, b) {
    if (!a || !b) return null;
    var R = 6371;
    var toRad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toRad;
    var dLon = (b[1] - a[1]) * toRad;
    var lat1 = a[0] * toRad;
    var lat2 = b[0] * toRad;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function roundPrice(n) {
    n = Math.round(Number(n) || 0);
    if (n < 1600) n = 1600;
    if (n > 6800) n = 6800;
    return Math.round(n / 100) * 100;
  }

  function formatPrice(n) {
    var s = String(roundPrice(n));
    return s.replace(/\B(?=(\d{3})+(?!$))/g, ' ');
  }

  function formatPriceLabel(n) {
    return 'Ціна ' + formatPrice(n) + ' грн';
  }

  function normalizeName(name) {
    return String(name || '')
      .replace(/\s+/g, ' ')
      .replace(/\(.*?\)/g, '')
      .trim();
  }

  function isUaName(name) {
    name = normalizeName(name);
    return UA_CITIES.some(function (c) { return c.name === name; });
  }

  function calcPriceByNames(fromName, toName) {
    fromName = normalizeName(fromName);
    toName = normalizeName(toName);
    if (!fromName || !toName || fromName === toName) return null;

    var direct = KNOWN[fromName + '|' + toName];
    if (direct) {
      return { amount: roundPrice(direct), source: 'table', from: fromName, to: toName };
    }

    var fromC = COORDS[fromName];
    var toC = COORDS[toName];
    var fromUa = isUaName(fromName);
    var toUa = isUaName(toName);

    // UA city -> EU city via nearest hub that has a listed price
    if (fromUa && !toUa) {
      var best = null;
      HUBS.forEach(function (hub) {
        var base = KNOWN[hub + '|' + toName];
        if (!base) return;
        var hubC = COORDS[hub];
        var d = haversineKm(fromC, hubC);
        if (d == null) d = 0;
        var total = base + d * 4.6;
        if (hub === fromName) total = base;
        if (best == null || total < best.total) {
          best = { total: total, hub: hub, base: base, d: d };
        }
      });
      if (best) {
        return {
          amount: roundPrice(best.total),
          source: 'hub:' + best.hub,
          from: fromName,
          to: toName
        };
      }
    }

    if (!fromUa && toUa) {
      return calcPriceByNames(toName, fromName);
    }

    // fallback: pure distance
    var km = haversineKm(fromC, toC);
    if (km == null) return null;
    var amount = roundPrice(1100 + km * 5.8);
    return { amount: amount, source: 'distance', from: fromName, to: toName, km: Math.round(km) };
  }

  function calcPriceByIds(fromId, toId, nameById) {
    nameById = nameById || {};
    var fromName = nameById[String(fromId)] || '';
    var toName = nameById[String(toId)] || '';
    if (!fromName) {
      var uf = UA_CITIES.filter(function (c) { return c.id === String(fromId); })[0];
      if (uf) fromName = uf.name;
    }
    if (!toName) {
      var ut = UA_CITIES.filter(function (c) { return c.id === String(toId); })[0];
      if (ut) toName = ut.name;
    }
    return calcPriceByNames(fromName, toName);
  }

  w.__eurotourRouteData = {
    UA_CITIES: UA_CITIES,
    UA_IDS: UA_IDS,
    EU_COORDS: EU_COORDS,
    KNOWN: KNOWN,
    calcPriceByNames: calcPriceByNames,
    calcPriceByIds: calcPriceByIds,
    formatPrice: formatPrice,
    formatPriceLabel: formatPriceLabel,
    roundPrice: roundPrice,
    isUaName: isUaName,
    normalizeName: normalizeName
  };
})(window);
