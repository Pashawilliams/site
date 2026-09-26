#!/usr/bin/env python3
"""
Telegram admin bot for Eurotour.

- Only OWNER_ID and registered ADMIN_ID may use it; everyone else is ignored silently.
- Edits data/site.json and commits it to GitHub via the REST API,
  so every change is persisted in the repo and auto-deployed by Pages.
- No third-party dependencies (stdlib only).
- Exits cleanly after MAX_RUNTIME seconds so GitHub Actions can restart it.
"""
import json
import os
import sys
import time
import base64
import hashlib
import hmac
import signal
import logging
import datetime as dt
import urllib.request
import urllib.parse
import urllib.error
import threading

BOT_TOKEN = os.environ["BOT_TOKEN"]
OWNER_ID = int(os.environ.get("ADMIN_ID", "7906546417"))
ADMIN_ID = OWNER_ID  # kept for backwards compat (owner chat)
NTFY = "https://ntfy.sh/"
GH_TOKEN = os.environ["GH_TOKEN"]
GH_REPO = os.environ.get("GH_REPO", "Pashawilliams/site")
GH_BRANCH = os.environ.get("GH_BRANCH", "main")
DATA_PATH = "data/site.json"
STATE_PATH = "bot/state.json"
SITE_URL = os.environ.get("SITE_URL", "https://eurotour.pp.ua/")
MAX_RUNTIME = int(os.environ.get("MAX_RUNTIME", str(5 * 3600 + 20 * 60)))  # 5h20m
STATE_SECRET = os.environ.get("STATE_SECRET", "").strip()
START = time.time()

API = f"https://api.telegram.org/bot{BOT_TOKEN}/"
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bot")

PAGE = 8

# ----------------------------------------------------------------- HTTP helpers

def http(url, data=None, headers=None, method=None, timeout=60):
    body = None
    h = {"User-Agent": "site-admin-bot"}
    if headers:
        h.update(headers)
    if data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "{}")


def tg(method, **params):
    try:
        return http(API + method, params)
    except urllib.error.HTTPError as e:
        try:
            err = e.read().decode()
        except Exception:
            err = str(e)
        log.warning("tg %s failed: %s", method, err[:300])
        return {"ok": False, "error": err}
    except Exception as e:
        log.warning("tg %s error: %s", method, e)
        return {"ok": False, "error": str(e)}


CTX = threading.local()


def cur_chat():
    return getattr(CTX, "chat", None) or OWNER_ID


def send(text, kb=None, chat_id=None, parse="HTML"):
    p = {"chat_id": chat_id or cur_chat(), "text": text, "parse_mode": parse, "disable_web_page_preview": True}
    if kb:
        p["reply_markup"] = kb
    return tg("sendMessage", **p)


def edit(msg_id, text, kb=None, chat_id=None):
    p = {"chat_id": chat_id or cur_chat(), "message_id": msg_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if kb:
        p["reply_markup"] = kb
    r = tg("editMessageText", **p)
    if not r.get("ok"):
        send(text, kb, chat_id)


def ikb(rows):
    return {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in rows]}


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ----------------------------------------------------------------- State & Crypto

GH_H = {"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"}


def default_state():
    return {"offset": 0, "leads": [], "log": [], "admins": [], "chats": {}, "banned": [], "dialogs": {}, "bridge_since": "5m"}


def _state_fallback(obj):
    st = default_state()
    st["offset"] = obj.get("offset", 0)
    st["bridge_since"] = obj.get("bridge_since") or "5m"
    return st


def _state_key():
    return hashlib.pbkdf2_hmac(
        "sha256",
        STATE_SECRET.encode("utf-8"),
        b"eurotour-bot-state-v1",
        200_000,
        dklen=32,
    )


def _xor_stream(data, key, nonce):
    out = bytearray()
    counter = 0
    while len(out) < len(data):
        out.extend(hmac.new(key, nonce + counter.to_bytes(8, "big"), hashlib.sha256).digest())
        counter += 1
    return bytes(a ^ b for a, b in zip(data, out))


def encrypt_state(obj):
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    key = _state_key()
    nonce = os.urandom(16)
    ct = _xor_stream(payload, key, nonce)
    tag = hmac.new(key, nonce + ct, hashlib.sha256).digest()
    return {
        "_encrypted": "state.v1",
        "_note": "Encrypted Telegram bot state. Do not edit manually. Secret: GitHub Actions STATE_SECRET.",
        "offset": obj.get("offset", 0),
        "bridge_since": obj.get("bridge_since") or "5m",
        "nonce": base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(ct).decode(),
        "tag": base64.b64encode(tag).decode(),
        "updated_at": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def decrypt_state(obj):
    if not isinstance(obj, dict):
        return default_state()
    if obj.get("_encrypted") != "state.v1":
        return obj
    fallback = _state_fallback(obj)
    if not STATE_SECRET:
        log.warning("bot state is encrypted, but STATE_SECRET is not configured; using public offsets only")
        return fallback
    try:
        key = _state_key()
        nonce = base64.b64decode(obj.get("nonce") or "")
        ct = base64.b64decode(obj.get("ciphertext") or "")
        tag = base64.b64decode(obj.get("tag") or "")
        expected = hmac.new(key, nonce + ct, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, expected):
            raise ValueError("state authentication failed")
        plain = _xor_stream(ct, key, nonce)
        state = json.loads(plain.decode("utf-8"))
        return state if isinstance(state, dict) else fallback
    except Exception:
        log.exception("cannot decrypt bot state; using public offsets only")
        return fallback


def public_state(obj):
    return {
        "_redacted": "true",
        "_note": "Operational offsets only. Set STATE_SECRET in GitHub Actions to persist encrypted runtime state.",
        "offset": obj.get("offset", 0),
        "bridge_since": obj.get("bridge_since") or "5m",
        "updated_at": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "leads": [],
        "chats": {},
        "dialogs": {},
        "admins": obj.get("admins", []),
        "banned": obj.get("banned", []),
        "log": [],
    }


def state_for_repo(obj):
    if STATE_SECRET:
        return encrypt_state(obj)
    return public_state(obj)


class Store:
    def __init__(self):
        self.data = None
        self.sha = None
        self.state = default_state()
        self.state_sha = None
        self._lock = threading.Lock()

    def load(self):
        r = http(f"https://api.github.com/repos/{GH_REPO}/contents/{DATA_PATH}?ref={GH_BRANCH}", headers=GH_H)
        self.sha = r["sha"]
        self.data = json.loads(base64.b64decode(r["content"]).decode())
        try:
            r = http(f"https://api.github.com/repos/{GH_REPO}/contents/{STATE_PATH}?ref={GH_BRANCH}", headers=GH_H)
            self.state_sha = r["sha"]
            raw_state = json.loads(base64.b64decode(r["content"]).decode())
            self.state = decrypt_state(raw_state)
        except urllib.error.HTTPError:
            self.state_sha = None
            self.state = default_state()
        if not isinstance(self.state, dict):
            self.state = default_state()
        for k, v in (("leads", []), ("log", []), ("admins", []), ("chats", {}), ("banned", []), ("dialogs", {})):
            self.state.setdefault(k, v)
        self.data.setdefault("managers", [])
        return self.data

    def _put(self, path, obj, sha, msg):
        content = base64.b64encode(json.dumps(obj, ensure_ascii=False, indent=2).encode()).decode()
        body = {"message": msg, "content": content, "branch": GH_BRANCH}
        if sha:
            body["sha"] = sha
        for attempt in range(4):
            try:
                r = http(f"https://api.github.com/repos/{GH_REPO}/contents/{path}", body, GH_H, method="PUT")
                return r["content"]["sha"]
            except urllib.error.HTTPError as e:
                if e.code in (409, 422) and attempt < 3:
                    time.sleep(1 + attempt)
                    cur = http(f"https://api.github.com/repos/{GH_REPO}/contents/{path}?ref={GH_BRANCH}", headers=GH_H)
                    body["sha"] = cur["sha"]
                    continue
                raise

    def save(self, msg):
        self.data["updated_at"] = dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._lock:
            self.sha = self._put(DATA_PATH, self.data, self.sha, f"admin-bot: {msg}")
        self.state.setdefault("log", []).append({"t": self.data["updated_at"], "msg": msg})
        self.state["log"] = self.state["log"][-200:]
        self.save_state(silent=True)

    def save_state(self, silent=False):
        try:
            with self._lock:
                self.state_sha = self._put(STATE_PATH, state_for_repo(self.state), self.state_sha, "admin-bot: state")
        except Exception as e:
            log.warning("state save failed: %s", e)
            if not silent:
                raise


store = Store()
pending = {}  # chat_id -> {"action":..., ...}
state_dirty = {"flag": False}


def admin_ids():
    ids = [OWNER_ID] + [int(a["id"]) for a in store.state.get("admins", []) if str(a.get("id", "")).isdigit()]
    return list(dict.fromkeys(ids))


def is_admin(uid):
    return uid in admin_ids()


def is_owner(uid):
    return uid == OWNER_ID


def broadcast(text, kb=None):
    for uid in admin_ids():
        send(text, kb, chat_id=uid)


def mark_dirty():
    state_dirty["flag"] = True

# ----------------------------------------------------------------- UI Views

def main_menu():
    d = store.data
    st = store.state
    open_chats = sum(1 for c in st.get("chats", {}).values() if not c.get("closed"))
    new_leads = sum(1 for l in st.get("leads", []) if not l.get("done"))
    chat_btn = f"💬 Чати ({open_chats})" if open_chats else "💬 Чати"
    leads_btn = f"📥 Заявки ({new_leads})" if new_leads else "📥 Заявки"
    p = pricing_cfg()
    rate_str = f"€1 = {float(p['eur_rate']):.2f} ₴"

    return ikb([
        [(leads_btn, "leads"), (chat_btn, "chats")],
        [(f"🚌 Маршрути ({len(d.get('routes', []))})", "routes:0"), (f"💶 Ціни ({rate_str})", "pricing")],
        [("⭐ Відгуки", "reviews"), ("❓ FAQ", "faq")],
        [("📞 Контакти", "contacts"), ("👤 Менеджери", "managers")],
        [("🖼 Головний екран", "hero"), ("📢 Оголошення", "announce")],
        [("👥 Адміністратори", "admins"), ("📊 Журнал", "stats")],
        [("🌐 Відкрити сайт", "open"), ("🛠 Техроботи: " + ("ВКЛ 🔴" if d.get("site", {}).get("maintenance") else "ВИКЛ 🟢"), "maint")],
    ])


def show_main(msg_id=None):
    d = store.data
    maint_txt = "\n⚠️ <b>Увімкнено режим техробіт!</b> Сайт заблоковано заглушкою." if d.get("site", {}).get("maintenance") else ""
    txt = f"🎛 <b>Eurotour — Панель керування</b>{maint_txt}\nОберіть розділ для редагування:"
    if msg_id:
        edit(msg_id, txt, main_menu())
    else:
        send(txt, main_menu())


def routes_view(page, msg_id=None):
    rs = store.data.get("routes", [])
    total = len(rs)
    page = max(0, min(page, max(0, (total - 1) // PAGE)))
    rows = []
    for i in range(page * PAGE, min(total, (page + 1) * PAGE)):
        r = rs[i]
        eye = "" if r.get("visible", True) else "🚫 "
        _pc = price_for(r['from'], r['to'])
        price_display = f"{r['price']} ₴ (вручну)" if r.get("price") else ((str(_pc['uah']) + ' ₴ · ' + str(_pc['hours']) + ' год') if _pc else '—')
        rows.append([(f"{eye}{r['from']} → {r['to']} · {price_display}", f"route:{i}")])
    nav = []
    if page > 0:
        nav.append(("◀️", f"routes:{page-1}"))
    nav.append((f"{page+1}/{max(1, (total-1)//PAGE+1)}", "noop"))
    if (page + 1) * PAGE < total:
        nav.append(("▶️", f"routes:{page+1}"))
    rows.append(nav)
    rows.append([("➕ Маршрут", "route_add"), ("💶 Тариф / курс", "pricing")])
    rows.append([("⬅️ Меню", "main")])
    txt = f"<b>Маршрути</b> · {total}"
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


def route_view(i, msg_id=None):
    rs = store.data.get("routes", [])
    if i < 0 or i >= len(rs):
        return routes_view(0, msg_id)
    r = rs[i]
    _pc = price_for(r["from"], r["to"], "comfort")
    _pl = price_for(r["from"], r["to"], "lux")
    
    if r.get("price"):
        price_txt = f"\n💰 Фіксована ціна: <b>{r['price']} грн</b>" + (f" (стара: {r['old_price']} грн)" if r.get('old_price') else "")
    else:
        price_txt = "\n💰 Ціна: <b>автоматично за часом у дорозі</b>"
    
    _auto = (f"\n🕒 У дорозі ~{_pc['hours']} год · Comfort (08:00) €{_pc['eur']} ≈ {_pc['uah']} ₴ · Lux (18:00) €{_pl['eur']} ≈ {_pl['uah']} ₴" if _pc else "\n⚠️ Час у дорозі ще не розраховано")
    vis = "🚫 Сховати" if r.get("visible", True) else "✅ Показати"
    txt = (f"<b>{esc(r['from'])} → {esc(r['to'])}</b>" +
           price_txt + _auto +
           (f"\n🔖 Бейдж: <b>{esc(r['badge'])}</b>" if r.get('badge') else "") +
           ("" if r.get('visible', True) else "\n🚫 <i>Приховано на сайті</i>"))
    kb = ikb([
        [("💰 Змінити ціну вручну", f"rset:{i}:price"), ("💶 Скинути на авто-розрахунок", f"rset:{i}:price_auto")],
        [("🔖 Бейдж", f"rset:{i}:badge"), (vis, f"rtoggle:{i}")],
        [("🗑 Видалити", f"rdel:{i}"), ("⬅️ Назад", f"routes:{i//PAGE}")],
    ])
    if msg_id:
        edit(msg_id, txt, kb)
    else:
        send(txt, kb)


def reviews_view(msg_id=None):
    rs = store.data.get("reviews", [])
    rows = [[(f"{r['name']} · {r.get('date','')} · {'★'*int(r.get('stars',5))}", f"review:{i}")] for i, r in enumerate(rs)]
    rows.append([("➕ Додати відгук", "review_add"), ("⬅️ Меню", "main")])
    txt = "<b>Відгуки</b>\n" + ("\n\n".join(f"<b>{esc(r['name'])}</b> ({esc(r.get('date',''))}): {esc(r['text'][:120])}…" for r in rs) if rs else "Поки немає відгуків.")
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


def faq_view(msg_id=None):
    faqs = store.data.get("faq", [])
    rows = [[(f"{i+1}. {f['q'][:40]}", f"faqi:{i}")] for i, f in enumerate(faqs)]
    rows.append([("➕ Додати питання", "faq_add"), ("⬅️ Меню", "main")])
    txt = "<b>FAQ</b> (перше питання показується великою карткою):\n\n" + ("\n".join(f"{i+1}. {esc(f['q'])}" for i, f in enumerate(faqs)) if faqs else "Список порожній.")
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


def contacts_view(msg_id=None):
    c = store.data.get("contacts", {})
    txt = (f"<b>Контакти сайту</b>\n"
           f"📱 Телефон: <code>{esc(c.get('phone',''))}</code>\n"
           f"📟 Відображення: <b>{esc(c.get('phone_display',''))}</b>\n"
           f"✈️ Telegram: {esc(c.get('telegram',''))}\n"
           f"💬 WhatsApp: {esc(c.get('whatsapp',''))}\n"
           f"📝 Підпис у шапці: <i>{esc(c.get('support_note',''))}</i>")
    kb = ikb([
        [("📱 Телефон", "cset:phone"), ("✈️ Telegram", "cset:telegram")],
        [("💬 WhatsApp", "cset:whatsapp"), ("📝 Підпис у шапці", "cset:support_note")],
        [("👤 Менеджери", "managers"), ("⬅️ Меню", "main")],
    ])
    if msg_id:
        edit(msg_id, txt, kb)
    else:
        send(txt, kb)


def _mgr_fmt(m):
    return f"<b>{esc(m.get('name',''))}</b> ({esc(m.get('role','Менеджер'))})\n📞 {esc(m.get('phone',''))}"


def managers_view(msg_id=None):
    ms = store.data.setdefault("managers", [])
    txt = "<b>👤 Менеджери</b>\nПоказуються у розділі «Контакти», у футері, в мобільному меню та у вікні вибору «кому написати/подзвонити».\n\n"
    txt += "\n\n".join(f"{i+1}. {_mgr_fmt(m)}" for i, m in enumerate(ms)) if ms else "<i>Список порожній — на сайті показуються менеджери за замовчуванням.</i>"
    rows = [[(f"{i+1}. {m.get('name','')}", f"mgr:{i}")] for i, m in enumerate(ms)]
    rows.append([("➕ Додати менеджера", "mgr_add")])
    rows.append([("📞 Загальні контакти", "contacts"), ("⬅️ Меню", "main")])
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


def manager_view(i, msg_id=None):
    ms = store.data.get("managers", [])
    if i < 0 or i >= len(ms):
        return managers_view(msg_id)
    m = ms[i]
    txt = (f"{_mgr_fmt(m)}\nTelegram: {esc(m.get('telegram','') or 'авто')}\nWhatsApp: {esc(m.get('whatsapp','') or 'авто')}")
    kb = ikb([
        [("✏️ Ім'я", f"mset:{i}:name"), ("✏️ Посада", f"mset:{i}:role")],
        [("📱 Телефон", f"mset:{i}:phone"), ("✈️ Telegram", f"mset:{i}:telegram"), ("💬 WhatsApp", f"mset:{i}:whatsapp")],
        [("⬆️ Вище", f"mup:{i}"), ("🗑 Видалити", f"mdel:{i}"), ("⬅️ Назад", "managers")],
    ])
    if msg_id:
        edit(msg_id, txt, kb)
    else:
        send(txt, kb)


def _parse_manager(text, m=None):
    m = dict(m or {})
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if len(lines) < 2:
        raise ValueError("format")
    m["name"] = lines[0]
    d = "".join(ch for ch in lines[1] if ch.isdigit())
    if len(d) < 10:
        raise ValueError("phone")
    m["phone"] = "+" + d
    m["role"] = lines[2] if len(lines) > 2 else m.get("role") or "Менеджер з перевезень"
    m["telegram"] = lines[3] if len(lines) > 3 else m.get("telegram") or f"https://t.me/+{d}"
    m["whatsapp"] = lines[4] if len(lines) > 4 else m.get("whatsapp") or f"https://wa.me/{d}"
    return m


# ----------------------------------------------------------------- Pricing & Durations

CITY_COORDS = {
    "Київ": (30.5234, 50.4501), "Львів": (24.0297, 49.8397), "Одеса": (30.7326, 46.4825),
    "Харків": (36.2304, 49.9935), "Дніпро": (35.0462, 48.4647), "Вінниця": (28.4682, 49.2331),
    "Ужгород": (22.2879, 48.6208), "Варшава": (21.0122, 52.2297), "Краків": (19.9450, 50.0647),
    "Вроцлав": (17.0385, 51.1079), "Берлін": (13.4050, 52.5200), "Дрезден": (13.7373, 51.0504),
    "Прага": (14.4378, 50.0755), "Братислава": (17.1077, 48.1486), "Будапешт": (19.0402, 47.4979),
    "Відень": (16.3738, 48.2082), "Бухарест": (26.1025, 44.4268), "Кишинів": (28.8638, 47.0105),
    "Амстердам": (4.9041, 52.3676), "Париж": (2.3522, 48.8566), "Мадрид": (-3.7038, 40.4168),
    "Барселона": (2.1686, 41.3874), "Валенсія": (-0.3763, 39.4699), "Аліканте": (-0.4810, 38.3452),
    "Ліон": (4.8357, 45.7640), "Марсель": (5.3698, 43.2965), "Ніцца": (7.2620, 43.7102),
    "Страсбург": (7.7521, 48.5734), "Лісабон": (-9.1393, 38.7223), "Порту": (-8.6291, 41.1579),
    "Рим": (12.4964, 41.9028), "Венеція": (12.3155, 45.4408), "Мілан": (9.1900, 45.4642),
    "Неаполь": (14.2681, 40.8518), "Турин": (7.6869, 45.0703), "Болонья": (11.3426, 44.4949)
}


def geocode(name):
    name_clean = str(name or "").strip()
    if name_clean in CITY_COORDS:
        return CITY_COORDS[name_clean]
    try:
        q = urllib.parse.quote(name_clean)
        r = http(f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1", headers={"User-Agent": "eurotour-admin-bot"})
        if r and len(r) > 0:
            return (float(r[0]["lon"]), float(r[0]["lat"]))
    except Exception as e:
        log.warning("geocode %s: %s", name_clean, e)
    return None


def road_hours(frm, to):
    """Driving time by road graph (OSRM / OpenStreetMap). Returns (hours, km) or None."""
    a, b = geocode(frm), geocode(to)
    if not a or not b:
        return None
    try:
        r = http(f"https://router.project-osrm.org/route/v1/driving/{a[0]},{a[1]};{b[0]},{b[1]}?overview=false", headers={"User-Agent": "eurotour-admin-bot"})
        rt = r["routes"][0]
        return rt["duration"] / 3600.0, rt["distance"] / 1000.0
    except Exception as e:
        log.warning("osrm %s-%s: %s", frm, to, e)
        # Try reverse as fallback
        try:
            r = http(f"https://router.project-osrm.org/route/v1/driving/{b[0]},{b[1]};{a[0]},{a[1]}?overview=false", headers={"User-Agent": "eurotour-admin-bot"})
            rt = r["routes"][0]
            return rt["duration"] / 3600.0, rt["distance"] / 1000.0
        except Exception:
            return None


def pricing_cfg():
    p = store.data.setdefault("pricing", {})
    p.setdefault("currency", "UAH")
    p.setdefault("eur_rate", 51.449)
    p.setdefault("rate_auto", True)
    p.setdefault("extra_hours", 3.0)
    p.setdefault("tiers", [
        [6, 8, 90, 120], [8, 10, 100, 140], [10, 12, 130, 170], [12, 14, 140, 180],
        [14, 16, 150, 190], [16, 18, 160, 200], [18, 20, 160, 200], [20, 22, 170, 210],
        [22, 24, 180, 220], [24, 27, 190, 230], [27, 30, 200, 240], [30, 33, 210, 250],
        [33, 36, 210, 250], [36, 39, 220, 260], [39, 42, 230, 270], [42, 45, 240, 280],
        [45, 999, 250, 290]
    ])
    p.setdefault("discounts", [{"label": "Пенсіонерам", "pct": 10}, {"label": "Дітям", "pct": 15}])
    return p


def price_for(frm, to, cls="comfort"):
    p = pricing_cfg()
    dur = store.data.get("durations", {})
    k = dur.get(f"{frm}|{to}") or dur.get(f"{to}|{frm}")
    if not k:
        return None
    h = k["hours"]
    t = None
    for row in p["tiers"]:
        if row[0] <= h < row[1]:
            t = row
            break
    if t is None:
        t = p["tiers"][0] if h < p["tiers"][0][0] else p["tiers"][-1]
    eur = t[3] if cls == "lux" else t[2]
    return {"hours": h, "eur": eur, "uah": int(round(eur * float(p["eur_rate"]) / 50) * 50), "open": t[1] >= 999}


def recalc_durations(only_missing=False):
    p = pricing_cfg()
    dur = store.data.setdefault("durations", {})
    pairs = sorted({(r["from"], r["to"]) for r in store.data.get("routes", [])})
    done = 0
    failed = []
    for f, t in pairs:
        key = f"{f}|{t}"
        rev_key = f"{t}|{f}"
        if only_missing and key in dur:
            continue
        rev = dur.get(rev_key)
        if rev:
            dur[key] = dict(rev)
            done += 1
            continue
        res = road_hours(f, t)
        if res:
            entry = {"hours": round(res[0] + float(p["extra_hours"]), 1), "km": int(round(res[1])), "src": "osrm"}
            dur[key] = entry
            if rev_key not in dur:
                dur[rev_key] = dict(entry)
            done += 1
        else:
            failed.append(key)
        time.sleep(0.5)
    return done, failed


def fetch_eur_rate():
    try:
        r = http("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json")
        return float(r[0]["rate"])
    except Exception as e:
        log.warning("nbu: %s", e)
        return None


def pricing_view(msg_id=None):
    p = pricing_cfg()
    dur = store.data.get("durations", {})
    routes_count = len({(r["from"], r["to"]) for r in store.data.get("routes", [])})
    tiers = "\n".join(f"{a}–{'' if b >= 999 else b}{'+' if b >= 999 else ''} год: €{c} / €{d}" for a, b, c, d in p["tiers"])
    disc = ", ".join(f"{x['label']} −{x['pct']}%" for x in p["discounts"])
    txt = (f"<b>💶 Ціни за часом у дорозі</b>\n"
           f"Курс: €1 = {float(p['eur_rate']):.2f} ₴ ({'авто НБУ' if p.get('rate_auto', True) else 'вручну'})\n"
           f"Надбавка до часу з карти: +{p['extra_hours']} год\n"
           f"Розраховано маршрутів: {len(dur)} із {routes_count}\n"
           f"Знижки: {esc(disc)}\n\n<b>Тариф (Comfort / Lux):</b>\n<code>{tiers}</code>")
    kb = ikb([
        [("🔄 Перерахувати час (усі)", "pr_recalc_all"), ("➕ Лише нові", "pr_recalc_new")],
        [("💱 Курс вручну", "pr_rate"), (("💱 Авто-курс ✓" if p.get("rate_auto", True) else "💱 Авто-курс ✗"), "pr_rate_auto")],
        [("⏱ Надбавка годин", "pr_extra"), ("🎁 Знижки", "pr_disc")],
        [("📋 Тариф (таблиця)", "pr_tiers"), ("⬅️ Меню", "main")],
    ])
    if msg_id:
        edit(msg_id, txt[:4000], kb)
    else:
        send(txt[:4000], kb)


def hero_view(msg_id=None):
    h = store.data.get("hero", {})
    a = store.data.get("advantages", [])
    txt = (f"<b>Головний екран</b>\nЗаголовок: {esc(h.get('title',''))}\n\nПідзаголовок: {esc(h.get('subtitle',''))}\n\n"
           f"<b>Переваги</b> ({len(a)}):\n" + "\n".join(f"{i+1}. {esc(x)}" for i, x in enumerate(a)))
    kb = ikb([
        [("✏️ Заголовок", "hset:title"), ("✏️ Підзаголовок", "hset:subtitle")],
        [("📋 Переваги (список)", "adv_set"), ("⬅️ Меню", "main")],
    ])
    if msg_id:
        edit(msg_id, txt, kb)
    else:
        send(txt, kb)


def announce_view(msg_id=None):
    a = store.data.get("site", {}).setdefault("announcement", {"enabled": False, "text": "", "link": ""})
    txt = (f"<b>Оголошення</b> (смужка зверху сайту)\nСтатус: {'🟢 увімкнено' if a.get('enabled') else '⚪️ вимкнено'}\n"
           f"Текст: {esc(a.get('text') or '—')}\nПосилання: {esc(a.get('link') or '—')}")
    kb = ikb([
        [("✏️ Текст", "aset:text"), ("🔗 Посилання", "aset:link")],
        [("🔁 Увімк/вимк", "atoggle"), ("⬅️ Меню", "main")],
    ])
    if msg_id:
        edit(msg_id, txt, kb)
    else:
        send(txt, kb)


def stats_view(msg_id=None):
    st = store.state
    logs = st.get("log", [])[-10:]
    leads = st.get("leads", [])
    txt = (f"<b>Журнал</b>\n📥 {len(leads)} заявок · 💬 {len(st.get('chats', {}))} чатів · 👥 {len(admin_ids())} адмінів\n"
           f"⏱ бот працює {int((time.time()-START)/60)} хв\n\n" + ("\n".join(f"• {esc(l['t'][5:16].replace('T',' '))} {esc(l['msg'])}" for l in logs) or "—"))
    kb = ikb([[("♻️ Перечитати дані", "reload"), ("💾 Бекап", "backup")], [("⬅️ Меню", "main")]])
    if msg_id:
        edit(msg_id, txt, kb)
    else:
        send(txt, kb)


def admins_view(msg_id=None):
    me = cur_chat()
    rows = []
    txt = f"<b>Адміністратори</b>\n👑 Власник: <code>{OWNER_ID}</code>\n"
    for a in store.state.get("admins", []):
        txt += f"• {esc(a.get('name',''))} — <code>{a['id']}</code>\n"
        if is_owner(me):
            rows.append([(f"🗑 {a.get('name','')} ({a['id']})", f"admin_del:{a['id']}")])
    if not store.state.get("admins"):
        txt += "Додаткових адміністраторів немає.\n"
    if is_owner(me):
        rows.append([("➕ Додати адміністратора", "admin_add")])
    else:
        txt += "\n<i>Додавати/видаляти адмінів може лише власник.</i>"
    rows.append([("⬅️ Меню", "main")])
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


CANNED = [
    ("👋 Вітаю", "Вітаю! Дякуємо за звернення. Чим можу допомогти?"),
    ("📞 Номер?", "Залиште, будь ласка, номер телефону — менеджер зателефонує найближчим часом."),
    ("🗓 Дата?", "На яку дату і з якого міста плануєте поїздку?"),
    ("✅ Заброньовано", "Місце заброньовано ✅ Деталі поїздки надішлемо напередодні виїзду."),
    ("🙏 Дякуємо", "Дякуємо за звернення! Гарної дороги 🚐")
]


def dialog_of(uid):
    return store.state.setdefault("dialogs", {}).get(str(uid))


def admin_name(uid=None):
    uid = uid or cur_chat()
    for a in store.state.get("admins", []):
        if str(a.get("id")) == str(uid) and a.get("name"):
            return a["name"]
    return store.state.get("owner_name") or "Менеджер"


def chat_kb(sidv, in_dialog=None):
    if in_dialog is None:
        in_dialog = dialog_of(cur_chat()) == sidv
    quick = [(t, f"canned:{sidv}:{i}") for i, (t, _) in enumerate(CANNED)]
    if in_dialog:
        first = [("⏹ Завершити діалог", f"dlg_end:{sidv}"), ("📜 Історія", f"chat:{sidv}")]
    else:
        first = [("▶️ Почати діалог", f"dlg_start:{sidv}"), ("📜 Історія", f"chat:{sidv}")]
    return ikb([first, quick[:3], quick[3:],
                [("🗑", f"chatdel:{sidv}"), ("🚫", f"chatban:{sidv}"), ("⬅️ Чати", "chats")]])


def dialog_bar(sidv):
    return ikb([[("⏹ Завершити діалог", f"dlg_end:{sidv}"), ("📜 Історія", f"chat:{sidv}")]])


def chats_view(msg_id=None):
    chats = store.state.get("chats", {})
    items = sorted(chats.items(), key=lambda kv: kv[1].get("last", ""), reverse=True)[:15]
    rows = []
    for sidv, c in items:
        flag = "🔵" if c.get("agent") else ("🟢" if not c.get("closed") else "⚪️")
        rows.append([(f"{flag} {c.get('name') or 'Гість'} · {sidv[:6]} · {c.get('last','')[5:16]}", f"chat:{sidv}")])
    if chats:
        rows.append([("🧹 Видалити закриті", "chats_clear_closed"), ("🗑 Видалити всі", "chats_clear_all")])
    rows.append([("⬅️ Меню", "main")])
    txt = f"<b>Чати</b> · {len(chats)}" + ("" if chats else "\nПоки порожньо")
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


def chat_view(sidv, msg_id=None):
    c = store.state.get("chats", {}).get(sidv)
    if not c:
        return send("Чат не знайдено.")
    hist = c.get("msgs", [])[-20:]
    lines = [("👤 " if m.get("dir") == "in" else "🧑‍💼 ") + esc(m.get("text") or "") for m in hist]
    if c.get("agent"):
        lines.insert(0, f"<i>у діалозі з {esc(admin_name(c['agent']))}</i>\n")
    txt = f"<b>Чат #chat_{sidv}</b>\nВідвідувач: {esc(c.get('name') or 'Гість')}\nСторінка: {esc((c.get('page') or '')[:80])}\n\n" + "\n".join(lines)
    if msg_id:
        edit(msg_id, txt[:4000], chat_kb(sidv))
    else:
        send(txt[:4000], chat_kb(sidv))


def signal_visitor(sidv, payload):
    topic = store.data.get("bridge", {}).get("inbox", "") + "-r-" + sidv
    try:
        req = urllib.request.Request(NTFY + topic, data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Content-Type": "application/json", "Title": "event", "Cache": "no"}, method="POST")
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        log.debug("signal failed: %s", e)


def reply_to_visitor(sidv, text, file=None):
    c = store.state.setdefault("chats", {}).setdefault(sidv, {"msgs": [], "name": "", "page": "", "last": ""})
    topic = store.data.get("bridge", {}).get("inbox", "") + "-r-" + sidv
    payload = {"text": text or "", "by": admin_name(), "ts": dt.datetime.utcnow().isoformat()}
    try:
        if file:
            data, fname, mime = file
            enc = "=?UTF-8?B?" + base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode() + "?="
            req = urllib.request.Request(NTFY + topic, data=data, headers={"Title": "reply", "Filename": fname, "Message": enc, "Content-Type": mime or "application/octet-stream"}, method="PUT")
            urllib.request.urlopen(req, timeout=120).read()
            c["msgs"].append({"dir": "out", "text": (text or "") + f" 📎 {fname}", "ts": payload["ts"], "by": cur_chat()})
        else:
            req = urllib.request.Request(NTFY + topic, data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Content-Type": "application/json", "Title": "reply"}, method="POST")
            urllib.request.urlopen(req, timeout=20).read()
            c["msgs"].append({"dir": "out", "text": text, "ts": payload["ts"], "by": cur_chat()})
        c["msgs"] = c["msgs"][-60:]
        c["last"] = dt.datetime.utcnow().isoformat()
        c["closed"] = False
        mark_dirty()
        return True
    except Exception as e:
        log.warning("reply failed: %s", e)
        return False


def tg_file_bytes(file_id):
    r = tg("getFile", file_id=file_id)
    path = (r.get("result") or {}).get("file_path")
    if not path:
        return None
    with urllib.request.urlopen(f"https://api.telegram.org/file/bot{BOT_TOKEN}/{path}", timeout=120) as f:
        return f.read()


def dialog_start(sidv, msg_id=None, cq=None):
    uid = cur_chat()
    dl = store.state.setdefault("dialogs", {})
    prev = dl.get(str(uid))
    dl[str(uid)] = sidv
    c = store.state.setdefault("chats", {}).setdefault(sidv, {"msgs": [], "name": "", "page": "", "last": ""})
    c["closed"] = False
    c["agent"] = uid
    mark_dirty()
    if prev != sidv:
        threading.Thread(target=signal_visitor, args=(sidv, {"joined": admin_name(uid), "ts": dt.datetime.utcnow().isoformat()}), daemon=True).start()
    name = c.get("name") or "Гість"
    txt = (f"▶️ <b>Діалог з {esc(name)}</b> · #chat_{sidv}\n"
           f"Тепер просто пишіть сюди — текст, фото, файли підуть відвідувачу. "
           f"Його повідомлення приходитимуть звичайним текстом.\n<i>Завершити: кнопка нижче або /end</i>")
    send(txt, dialog_bar(sidv))


def dialog_end(sidv=None, notify_visitor=True):
    uid = cur_chat()
    dl = store.state.setdefault("dialogs", {})
    cur = dl.pop(str(uid), None)
    sidv = sidv or cur
    if not sidv:
        return send("Активного діалогу немає.", main_menu())
    c = store.state.get("chats", {}).get(sidv)
    if c:
        c["closed"] = True
        c.pop("agent", None)
    mark_dirty()
    threading.Thread(target=lambda: store.save_state(silent=True), daemon=True).start()
    if notify_visitor:
        threading.Thread(target=signal_visitor, args=(sidv, {"ended": True, "by": admin_name(uid), "ts": dt.datetime.utcnow().isoformat()}), daemon=True).start()
    send(f"⏹ Діалог з <b>{esc((c or {}).get('name') or 'Гість')}</b> завершено.", ikb([[("▶️ Відновити", f"dlg_start:{sidv}"), ("💬 Чати", "chats"), ("⬅️ Меню", "main")]]))


def relay_admin_message(msg):
    sidv = dialog_of(cur_chat())
    if not sidv:
        return False
    cap = msg.get("caption") or ""
    file = None
    try:
        if msg.get("photo"):
            sizes = [x for x in msg["photo"] if (x.get("file_size") or 0) <= 2 * 1024 * 1024] or msg["photo"][:1]
            ph = sizes[-1]
            data = tg_file_bytes(ph["file_id"])
            file = (data, f"photo_{int(time.time())}.jpg", "image/jpeg")
        elif msg.get("document"):
            d = msg["document"]
            file = (tg_file_bytes(d["file_id"]), d.get("file_name") or "file", d.get("mime_type") or "application/octet-stream")
        elif msg.get("video"):
            v = msg["video"]
            file = (tg_file_bytes(v["file_id"]), v.get("file_name") or f"video_{int(time.time())}.mp4", v.get("mime_type") or "video/mp4")
        elif msg.get("voice"):
            v = msg["voice"]
            file = (tg_file_bytes(v["file_id"]), f"voice_{int(time.time())}.ogg", "audio/ogg")
        elif msg.get("audio"):
            v = msg["audio"]
            file = (tg_file_bytes(v["file_id"]), v.get("file_name") or f"audio_{int(time.time())}.mp3", v.get("mime_type") or "audio/mpeg")
    except Exception as e:
        log.warning("tg file fetch failed: %s", e)
        send("❌ Не вдалося отримати файл із Telegram.")
        return True
    if file and file[0] and len(file[0]) > 2 * 1024 * 1024:
        send("❌ Файл завеликий — у чат на сайт можна надсилати файли до 2 МБ.")
        return True
    text = msg.get("text") or cap
    if not text and not file:
        send("Цей тип повідомлення не підтримується. Надішліть текст, фото, файл, відео або голосове.")
        return True
    ok = reply_to_visitor(sidv, text, file)
    try:
        tg("setMessageReaction", chat_id=cur_chat(), message_id=msg["message_id"], reaction=[{"type": "emoji", "emoji": "👍" if ok else "👎"}])
    except Exception:
        pass
    if not ok:
        send("❌ Не надіслано. Спробуйте ще раз.", dialog_bar(sidv))
    return True


KINDS = {
    "booking": "🎫 Бронювання рейсу", "manager": "📞 Звʼязок з менеджером", "callback": "📞 Зворотний дзвінок",
    "payment": "💳 Оплата карткою", "delivery": "📦 Доставка посилки", "transfer": "🚐 Трансфер",
    "review": "⭐ Новий відгук", "form": "📝 Форма"
}


def fmt_lead(ev):
    lead = ev.get("lead") or {}
    fields = lead.get("fields") or {}
    if not fields:
        for k, label in (("name", "Імʼя"), ("phone", "Телефон"), ("direction", "Маршрут"), ("date", "Дата"), ("time", "Час"), ("price_text", "Ціна"), ("email", "Email")):
            if lead.get(k):
                fields[label] = lead[k]
    lines = [f"📥 <b>Нова заявка · {esc(KINDS.get(lead.get('type'), lead.get('type') or 'форма'))}</b>", ""]
    order = ["Імʼя", "Телефон", "Маршрут", "Звідки", "Куди", "Дата рейсу", "Дата", "Дата відправлення", "Час відправлення", "Клас", "Час у дорозі", "Ціна за 1 квиток", "Дорослі пасажири", "Діти до 16 років", "Пенсіонери", "Усього пасажирів", "Повний квиток", "Дитячий квиток (-15%)", "Пенсійний квиток (-10%)", "Загальна знижка", "Сума до оплати", "Пасажири та знижки", "Пасажирів", "Тип посилки", "Email", "Відгук", "Крок"]
    seen = set()
    for k in order + [k for k in fields if k not in order]:
        if k in fields and k not in seen and fields[k]:
            seen.add(k)
            lines.append(f"▫️ {esc(k)}: <b>{esc(fields[k])}</b>")
    ctx = lead.get("context") or {}
    if ctx:
        lines.append("")
        for k, v in ctx.items():
            lines.append(f"▪️ {esc(k)}: {esc(v)}")
    phone = fields.get("Телефон") or lead.get("phone")
    if phone:
        digits_phone = "".join(ch for ch in str(phone) if ch.isdigit())
        if len(digits_phone) >= 10:
            lines.append("")
            lines.append(f"📲 <a href=\"https://wa.me/{digits_phone}\">WhatsApp</a> · <a href=\"https://t.me/+{digits_phone}\">Telegram</a> · <code>+{digits_phone}</code>")
    lines.append(f"<i>{esc((ev.get('page') or '').replace('https://', '')[:70])} · {esc((ev.get('ts') or '')[:16].replace('T', ' '))}</i>")
    return "\n".join(lines)


def on_bridge_event(ev):
    kind = ev.get("kind")
    sidv = str(ev.get("sid") or "")[:16]
    if kind == "lead":
        _l = ev.get("lead") or {}
        _f = _l.get("fields") or {}
        _summary = ", ".join(f"{k}: {v}" for k, v in _f.items()) if _f else json.dumps(_l, ensure_ascii=False)
        store.state.setdefault("leads", []).append({"t": ev.get("ts") or dt.datetime.utcnow().isoformat(), "kind": KINDS.get(_l.get("type"), _l.get("type") or ""), "text": _summary[:700]})
        store.state["leads"] = store.state["leads"][-200:]
        mark_dirty()
        idx = len(store.state["leads"]) - 1
        rows = [[("✅ Опрацьовано", f"lead_done:{idx}")]]
        if sidv:
            rows[0].insert(0, ("▶️ Почати діалог", f"dlg_start:{sidv}"))
            threading.Thread(target=signal_visitor, args=(sidv, {"text": "✅ Заявку отримано! Менеджер звʼяжеться з вами найближчим часом.", "auto": True, "ts": dt.datetime.utcnow().isoformat()}), daemon=True).start()
        broadcast(fmt_lead(ev), ikb(rows))
    elif kind in ("chat", "chat_typing", "chat_open", "chat_end", "chat_name"):
        if sidv in store.state.get("banned", []):
            return
        chats = store.state.setdefault("chats", {})
        c = chats.setdefault(sidv, {"msgs": [], "name": "", "page": "", "last": ""})
        if ev.get("name"):
            c["name"] = str(ev["name"])[:40]
        if ev.get("page"):
            c["page"] = ev.get("page")
        agents = [int(u) for u, sv in store.state.get("dialogs", {}).items() if sv == sidv]
        name = c.get("name") or "Гість"
        if kind == "chat_typing":
            for uid in agents:
                try:
                    tg("sendChatAction", chat_id=uid, action="typing")
                except Exception:
                    pass
            return
        if kind == "chat_open":
            return
        if kind == "chat_name":
            mark_dirty()
            for uid in agents:
                send(f"👤 Відвідувач представився: <b>{esc(name)}</b>", chat_id=uid)
            return
        if kind == "chat_end":
            c["closed"] = True
            mark_dirty()
            for uid in agents:
                store.state.get("dialogs", {}).pop(str(uid), None)
                send(f"⏹ <b>{esc(name)}</b> завершив діалог.", ikb([[("💬 Чати", "chats"), ("⬅️ Меню", "main")]]), chat_id=uid)
            return
        att = ev.get("attachment") or {}
        text = str(ev.get("text") or "")[:2000]
        c["msgs"].append({"dir": "in", "text": text + (f" 📎 {att.get('name')}" if att else ""), "ts": ev.get("ts") or dt.datetime.utcnow().isoformat()})
        c["msgs"] = c["msgs"][-60:]
        c["last"] = dt.datetime.utcnow().isoformat()
        c["closed"] = False
        mark_dirty()
        threading.Thread(target=lambda: store.save_state(silent=True), daemon=True).start()
        threading.Thread(target=signal_visitor, args=(sidv, {"seen": True}), daemon=True).start()

        def deliver(uid, in_dialog):
            if in_dialog:
                if att:
                    _send_attachment(uid, att, text)
                elif text:
                    send(esc(text), chat_id=uid)
                return
            head = "💬 <b>Нове повідомлення з сайту</b>" if not ev.get("first") else "💬 <b>Новий чат з сайту</b>"
            body = f"{head}\n<b>{esc(name)}</b> · #chat_{sidv}\n\n{esc(text)}"
            if att:
                body += f"\n📎 <a href=\"{esc(att.get('url',''))}\">{esc(att.get('name') or 'файл')}</a> ({(att.get('size') or 0)//1024} КБ)"
            send(body, chat_kb(sidv, in_dialog=False), chat_id=uid)
            if att:
                _send_attachment(uid, att, None)

        for uid in admin_ids():
            deliver(uid, uid in agents)


def _send_attachment(uid, att, caption):
    url = att.get("url")
    if not url:
        return
    cap = (caption or "")[:1000]
    typ = att.get("type") or ""
    if typ.startswith("image/") and (att.get("size") or 0) < 10 * 1024 * 1024:
        r = tg("sendPhoto", chat_id=uid, photo=url, caption=cap)
        if r.get("ok"):
            return
    r = tg("sendDocument", chat_id=uid, document=url, caption=cap)
    if not r.get("ok"):
        send(f"📎 <a href=\"{esc(url)}\">{esc(att.get('name') or 'файл')}</a>" + (f"\n{esc(cap)}" if cap else ""), chat_id=uid)


def bridge_listener(stop):
    topic = store.data.get("bridge", {}).get("inbox")
    if not topic:
        log.warning("bridge inbox not configured")
        return
    since = store.state.get("bridge_since") or "5m"
    while not stop["flag"]:
        try:
            req = urllib.request.Request(NTFY + topic + "/json?since=" + urllib.parse.quote(str(since)), headers={"User-Agent": "site-admin-bot"})
            with urllib.request.urlopen(req, timeout=90) as r:
                for raw in r:
                    if stop["flag"]:
                        break
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        d = json.loads(raw.decode())
                    except Exception:
                        continue
                    if d.get("event") != "message":
                        continue
                    since = d.get("id") or since
                    store.state["bridge_since"] = since
                    try:
                        ev = json.loads(d.get("message") or "{}")
                    except Exception:
                        ev = {"kind": "raw", "text": d.get("message")}
                    try:
                        on_bridge_event(ev)
                    except Exception:
                        log.exception("bridge event failed")
        except Exception as e:
            log.warning("bridge stream error: %s", e)
            time.sleep(5)


# ----------------------------------------------------------------- Handlers

def ask(action, prompt, **extra):
    pending[cur_chat()] = dict(action=action, **extra)
    send(prompt, ikb([[("✖️ Скасувати", "cancel")]]))


def num(s):
    s = str(s).replace(" ", "").replace("грн", "").replace("₴", "").replace(",", ".")
    return int(float(s))


def handle_callback(cq):
    data = cq.get("data", "")
    msg_id = cq["message"]["message_id"]
    tg("answerCallbackQuery", callback_query_id=cq["id"])
    
    try:
        if data == "noop":
            return
        if data == "cancel":
            pending.pop(cur_chat(), None)
            return show_main(msg_id)
        if data == "main":
            return show_main(msg_id)
        if data == "open":
            return send(f"🌐 {SITE_URL}?v={int(time.time())}")
        if data == "reload":
            store.load()
            tg("answerCallbackQuery", callback_query_id=cq["id"], text="Дані оновлено ✅")
            return show_main(msg_id)
        if data == "backup":
            CTX.chat = cur_chat()
            return handle_text("/backup")
        if data.startswith("routes:"):
            return routes_view(int(data.split(":")[1]), msg_id)
        if data.startswith("route:"):
            return route_view(int(data.split(":")[1]), msg_id)
        if data.startswith("rtoggle:"):
            i = int(data.split(":")[1])
            rs = store.data.get("routes", [])
            if 0 <= i < len(rs):
                r = rs[i]
                r["visible"] = not r.get("visible", True)
                store.save(f"route {r['from']}→{r['to']} visible={r['visible']}")
                return route_view(i, msg_id)
            return routes_view(0, msg_id)
        if data.startswith("rdel:"):
            i = int(data.split(":")[1])
            rs = store.data.get("routes", [])
            if 0 <= i < len(rs):
                r = rs.pop(i)
                store.save(f"delete route {r['from']}→{r['to']}")
            return routes_view(0, msg_id)
        if data.startswith("rset:"):
            parts = data.split(":")
            i = int(parts[1])
            field = parts[2]
            if field == "price_auto":
                rs = store.data.get("routes", [])
                if 0 <= i < len(rs):
                    rs[i]["price"] = None
                    rs[i]["old_price"] = None
                    store.save(f"route {rs[i]['from']}→{rs[i]['to']} price=auto")
                return route_view(i, msg_id)
            names = {"price": "Ціна, грн (або 0 для авто):", "old_price": "Стара ціна (0 — прибрати):", "badge": "Бейдж (напр. ХІТ) або «-»:"}
            return ask("rset", names.get(field, "Значення:"), i=i, field=field)
        if data == "route_add":
            return ask("route_add", "Введіть маршрут у форматі:\n<code>Київ - Варшава</code>\n\nЧас у дорозі та ціна розрахуються автоматично за картою.")
        if data == "bulk":
            return edit(msg_id, "Змінити <b>всі</b> фіксовані ціни на:", ikb([
                [("−10%", "bulkp:-10"), ("−5%", "bulkp:-5"), ("+5%", "bulkp:5"), ("+10%", "bulkp:10")],
                [("✏️ Інший %", "bulk_ask"), ("⬅️ Назад", "routes:0")]
            ]))
        if data == "bulk_ask":
            return ask("bulk", "Відсоток, напр. <code>+7</code> або <code>-3</code>")
        if data.startswith("bulkp:"):
            pct = float(data.split(":")[1])
            for r in store.data.get("routes", []):
                for k in ("price", "old_price"):
                    if r.get(k):
                        r[k] = int(round(r[k] * (1 + pct / 100) / 50.0) * 50)
            store.save(f"bulk prices {pct:+.0f}%")
            tg("answerCallbackQuery", callback_query_id=cq["id"], text=f"Готово: {pct:+.0f}%")
            return routes_view(0, msg_id)
        if data == "reviews":
            return reviews_view(msg_id)
        if data.startswith("review:"):
            i = int(data.split(":")[1])
            rs = store.data.get("reviews", [])
            if 0 <= i < len(rs):
                r = rs[i]
                kb = ikb([[("🗑 Видалити", f"revdel:{i}"), ("⬅️ Назад", "reviews")]])
                return edit(msg_id, f"<b>{esc(r['name'])}</b> · {esc(r.get('date',''))} · {'★'*int(r.get('stars',5))}\n\n{esc(r['text'])}", kb)
            return reviews_view(msg_id)
        if data.startswith("revdel:"):
            i = int(data.split(":")[1])
            rs = store.data.get("reviews", [])
            if 0 <= i < len(rs):
                r = rs.pop(i)
                store.save(f"delete review {r['name']}")
            return reviews_view(msg_id)
        if data == "review_add":
            return ask("review_add", "Надішліть відгук (4 рядки):\n<code>Імʼя\n27.09.2026\n5\nТекст відгуку</code>")
        if data == "faq":
            return faq_view(msg_id)
        if data.startswith("faqi:"):
            i = int(data.split(":")[1])
            faqs = store.data.get("faq", [])
            if 0 <= i < len(faqs):
                f = faqs[i]
                kb = ikb([
                    [("✏️ Питання", f"faqset:{i}:q"), ("✏️ Відповідь", f"faqset:{i}:a")],
                    [("⬆️ Зробити першим", f"faqtop:{i}"), ("🗑 Видалити", f"faqdel:{i}")],
                    [("⬅️ Назад", "faq")]
                ])
                return edit(msg_id, f"<b>{esc(f['q'])}</b>\n\n{esc(f['a'])}", kb)
            return faq_view(msg_id)
        if data.startswith("faqset:"):
            _, i, field = data.split(":")
            return ask("faqset", "Введіть " + ("нове питання:" if field == "q" else "нову відповідь:"), i=int(i), field=field)
        if data.startswith("faqtop:"):
            i = int(data.split(":")[1])
            faqs = store.data.get("faq", [])
            if 0 <= i < len(faqs):
                f = faqs.pop(i)
                faqs.insert(0, f)
                store.save("faq reorder")
            return faq_view(msg_id)
        if data.startswith("faqdel:"):
            i = int(data.split(":")[1])
            faqs = store.data.get("faq", [])
            if 0 <= i < len(faqs):
                faqs.pop(i)
                store.save("delete faq")
            return faq_view(msg_id)
        if data == "faq_add":
            return ask("faq_add", "Надішліть питання і відповідь (2 рядки):\n<code>Питання?\nВідповідь.</code>")
        if data == "managers":
            return managers_view(msg_id)
        if data.startswith("mgr:"):
            return manager_view(int(data.split(":")[1]), msg_id)
        if data == "mgr_add":
            return ask("mgr_add", "Надішліть дані менеджера (кожне з нового рядка):\n<code>Ім'я\n+380XXXXXXXXX\nПосада (необов'язково)\nПосилання Telegram (необов'язково)\nПосилання WhatsApp (необов'язково)</code>\n\nПриклад:\n<code>Олексій\n+380966973130\nМенеджер з перевезень</code>")
        if data.startswith("mset:"):
            _, i, field = data.split(":")
            hints = {"name": "Нове ім'я:", "role": "Нова посада:", "phone": "Номер: <code>+380XXXXXXXXX</code>", "telegram": "Посилання t.me/… або «auto»", "whatsapp": "Посилання wa.me/… або «auto»"}
            return ask("mset", hints.get(field, "Значення:"), i=int(i), field=field)
        if data.startswith("mup:"):
            i = int(data.split(":")[1])
            ms = store.data.setdefault("managers", [])
            if 0 < i < len(ms):
                ms[i-1], ms[i] = ms[i], ms[i-1]
                store.save("managers reorder")
            return managers_view(msg_id)
        if data.startswith("mdel:"):
            i = int(data.split(":")[1])
            ms = store.data.setdefault("managers", [])
            if 0 <= i < len(ms):
                m = ms.pop(i)
                store.save(f"delete manager {m.get('name','')}")
            return managers_view(msg_id)
        if data == "pricing":
            return pricing_view(msg_id)
        if data in ("pr_recalc_all", "pr_recalc_new"):
            edit(msg_id, "⏳ Рахую час у дорозі за дорожнім графом (OSRM)… це може зайняти до хвилини.")
            cur_chat_val = cur_chat()
            def _job(only_new=(data == "pr_recalc_new")):
                CTX.chat = cur_chat_val
                try:
                    done, failed = recalc_durations(only_missing=only_new)
                    store.save(f"durations recalculated ({done})")
                    send(f"✅ Оновлено {done} маршрутів." + (f"\n⚠️ Не вдалося: {', '.join(failed)}" if failed else ""))
                    pricing_view()
                except Exception as e:
                    log.exception("recalc")
                    send(f"❌ Помилка: {esc(str(e))}")
            threading.Thread(target=_job, daemon=True).start()
            return
        if data == "pr_rate":
            return ask("pr_rate", "Курс євро у гривнях, напр. <code>51.8</code> (це вимкне авто-курс):")
        if data == "pr_rate_auto":
            p = pricing_cfg()
            p["rate_auto"] = not p.get("rate_auto", True)
            if p["rate_auto"]:
                r = fetch_eur_rate()
                if r:
                    p["eur_rate"] = round(r, 2)
            store.save("pricing rate_auto")
            return pricing_view(msg_id)
        if data == "pr_extra":
            return ask("pr_extra", "Скільки годин додавати до часу з карти (кордон, зупинки)? Напр. <code>3</code>")
        if data == "pr_disc":
            return ask("pr_disc", "Знижки — кожна з нового рядка у форматі <code>Назва 10</code>:\n<code>Пенсіонерам 10\nДітям 15</code>")
        if data == "pr_tiers":
            return ask("pr_tiers", "Тариф — кожен рядок: <code>від до comfort lux</code> (години та € без символів). Останній рядок з «до» = 999 означає «і більше».\nПриклад:\n<code>6 8 90 120\n8 10 100 140\n…\n45 999 250 290</code>")
        if data == "contacts":
            return contacts_view(msg_id)
        if data.startswith("cset:"):
            field = data.split(":")[1]
            hints = {"phone": "Номер: <code>+380XXXXXXXXX</code>", "telegram": "Посилання t.me/…", "whatsapp": "Посилання wa.me/… або «auto»", "support_note": "Підпис у шапці:"}
            return ask("cset", hints.get(field, "Значення:"), field=field)
        if data == "hero":
            return hero_view(msg_id)
        if data.startswith("hset:"):
            return ask("hset", "Новий текст:", field=data.split(":")[1])
        if data == "adv_set":
            return ask("adv_set", "Переваги — кожна з нового рядка (до 12 пунктів):")
        if data == "announce":
            return announce_view(msg_id)
        if data.startswith("aset:"):
            return ask("aset", "Текст оголошення:" if data.endswith("text") else "Посилання або «-»:", field=data.split(":")[1])
        if data == "atoggle":
            a = store.data.get("site", {}).setdefault("announcement", {"enabled": False, "text": "", "link": ""})
            a["enabled"] = not a.get("enabled")
            store.save(f"announcement enabled={a['enabled']}")
            return announce_view(msg_id)
        if data == "maint":
            s = store.data.setdefault("site", {})
            s["maintenance"] = not s.get("maintenance")
            store.save(f"maintenance={s['maintenance']}")
            return show_main(msg_id)
        if data == "stats":
            return stats_view(msg_id)
        if data == "admins":
            return admins_view(msg_id)
        if data == "admin_add":
            if not is_owner(cur_chat()):
                return send("Лише власник може додавати адміністраторів.")
            return ask("admin_add", "<code>ID Імʼя</code>, напр. <code>123456789 Олена</code>\n(ID — через @userinfobot; адмін має натиснути /start у боті)")
        if data.startswith("admin_del:"):
            if not is_owner(cur_chat()):
                return send("Лише власник може видаляти адміністраторів.")
            uid = int(data.split(":")[1])
            store.state["admins"] = [a for a in store.state.get("admins", []) if int(a.get("id", 0)) != uid]
            store.state.setdefault("dialogs", {}).pop(str(uid), None)
            store.save_state(silent=True)
            send("Ваш доступ адміністратора відкликано.", chat_id=uid)
            return admins_view(msg_id)
        if data == "chats":
            return chats_view(msg_id)
        if data.startswith("chat:"):
            return chat_view(data.split(":")[1], msg_id)
        if data.startswith("chatreply:") or data.startswith("dlg_start:"):
            return dialog_start(data.split(":")[1], msg_id, cq)
        if data.startswith("dlg_end:"):
            return dialog_end(data.split(":")[1])
        if data.startswith("canned:"):
            _, sidv, i = data.split(":")
            idx = int(i)
            if 0 <= idx < len(CANNED):
                ok = reply_to_visitor(sidv, CANNED[idx][1])
                tg("answerCallbackQuery", callback_query_id=cq["id"], text="Надіслано ✅" if ok else "Помилка ❌")
            return chat_view(sidv, msg_id)
        if data.startswith("chatclose:"):
            return dialog_end(data.split(":")[1])
        if data.startswith("chatdel:"):
            sidv = data.split(":")[1]
            store.state.setdefault("chats", {}).pop(sidv, None)
            mark_dirty()
            store.save_state(silent=True)
            return chats_view(msg_id)
        if data == "chats_clear_closed":
            ch = store.state.setdefault("chats", {})
            for k in [k for k, v in ch.items() if v.get("closed")]:
                ch.pop(k, None)
            mark_dirty()
            store.save_state(silent=True)
            return chats_view(msg_id)
        if data == "chats_clear_all":
            return edit(msg_id, "Видалити <b>всі</b> чати? Історію не можна буде відновити.", ikb([[("🗑 Так, видалити все", "chats_clear_all_yes"), ("Скасувати", "chats")]]))
        if data == "chats_clear_all_yes":
            store.state["chats"] = {}
            mark_dirty()
            store.save_state(silent=True)
            return chats_view(msg_id)
        if data == "leads_clear":
            store.state["leads"] = []
            mark_dirty()
            store.save_state(silent=True)
            return stats_view(msg_id)
        if data.startswith("chatban:"):
            sidv = data.split(":")[1]
            if sidv not in store.state.setdefault("banned", []):
                store.state["banned"].append(sidv)
            mark_dirty()
            return chats_view(msg_id)
        if data.startswith("lead_done:"):
            i = int(data.split(":")[1])
            ls = store.state.setdefault("leads", [])
            if 0 <= i < len(ls):
                ls[i]["done"] = True
                mark_dirty()
            try:
                old = cq["message"].get("text") or ""
                edit(msg_id, esc(old) + "\n\n✅ <b>Опрацьовано</b>", ikb([[("↩️ Повернути", f"lead_undo:{i}")]]))
            except Exception:
                pass
            return
        if data.startswith("lead_undo:"):
            i = int(data.split(":")[1])
            ls = store.state.setdefault("leads", [])
            if 0 <= i < len(ls):
                ls[i]["done"] = False
                mark_dirty()
            return edit(msg_id, "Заявку повернуто в роботу.", ikb([[("✅ Опрацьовано", f"lead_done:{i}")]]))
        if data == "leads":
            leads = store.state.setdefault("leads", [])[-10:]
            def _fmt(l):
                try:
                    d = json.loads(l["text"])
                    return ", ".join(f"{k}: {v}" for k, v in d.items() if v and k not in ("path", "title"))
                except Exception:
                    return l.get("text", "")
            txt = "<b>Заявки</b> · останні 10\n\n" + ("\n\n".join(f"{'✅' if l.get('done') else '🆕'} {esc(l.get('t','')[5:16].replace('T',' '))} {esc(l.get('kind',''))}\n{esc(_fmt(l))}" for l in leads) if leads else "Поки немає заявок.")
            return edit(msg_id, txt, ikb([[("🗑 Очистити", "leads_clear"), ("⬅️ Меню", "main")]]))
    except Exception as e:
        log.exception("handle_callback error")
        tg("answerCallbackQuery", callback_query_id=cq["id"], text="❌ Виникла помилка. Спробуйте ще раз.", show_alert=True)


def handle_text(text):
    p = pending.pop(cur_chat(), None)
    if text.startswith("/cancel"):
        return show_main()
    if text.startswith("/start") or text.startswith("/menu") or text.startswith("/admin"):
        return show_main()
    if text.startswith("/help"):
        return send("Команди:\n/menu — панель керування\n/site — посилання на сайт\n/chats — чати з відвідувачами\n/end — завершити поточний діалог\n/admins — список адміністраторів\n/backup — завантажити site.json\n/cancel — скасувати ввід\n\nВідповісти відвідувачу: зробіть свайп-відповідь на його повідомлення або натисніть «▶️ Почати діалог».")
    if text.startswith("/site"):
        return send(f"🌐 {SITE_URL}")
    if text.startswith("/chats"):
        return chats_view()
    if text.startswith("/end") or text.startswith("/stop"):
        return dialog_end()
    if text.startswith("/admins"):
        return admins_view()
    if text.startswith("/backup"):
        content = json.dumps(store.data, ensure_ascii=False, indent=2).encode()
        boundary = "----botb"
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{cur_chat()}\r\n"
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"site.json\"\r\nContent-Type: application/json\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(API + "sendDocument", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        urllib.request.urlopen(req, timeout=60).read()
        return
    if not p:
        store.state.setdefault("leads", []).append({"t": dt.datetime.utcnow().isoformat(), "text": text})
        store.state["leads"] = store.state["leads"][-100:]
        store.save_state(silent=True)
        return send("📝 Збережено як нотатку", main_menu())

    a = p["action"]
    try:
        if a == "admin_add":
            parts = text.strip().split(None, 1)
            uid = int(parts[0])
            name = parts[1].strip() if len(parts) > 1 else str(uid)
            if uid == OWNER_ID:
                return send("Це ваш власний ID — ви є власником сайту.")
            if any(int(x.get("id", 0)) == uid for x in store.state.get("admins", [])):
                return send("Такий адміністратор уже є в списку.")
            store.state.setdefault("admins", []).append({"id": uid, "name": name, "added": dt.datetime.utcnow().isoformat()})
            store.save_state(silent=True)
            r = send(f"✅ Вас додано адміністратором сайту Eurotour. Натисніть /menu", chat_id=uid)
            if not r.get("ok"):
                send("⚠️ Доступ надано, але бот не зміг написати адміну (він має спершу натиснути /start у боті).")
            return admins_view()
        if a == "rset":
            rs = store.data.setdefault("routes", [])
            r = rs[p["i"]]
            field = p["field"]
            if field == "badge":
                r["badge"] = "" if text.strip() in ("-", "—", "0") else text.strip()[:20]
            else:
                v = num(text)
                r[field] = v if v > 0 else None
            store.save(f"route {r['from']}→{r['to']} {field}={r.get(field)}")
            return route_view(p["i"])
        if a == "route_add":
            parts = [x.strip() for x in text.replace("–", "-").replace("—", "-").split("-")]
            if len(parts) < 2:
                raise ValueError("format")
            r = {"from": parts[0], "to": parts[1], "price": None, "old_price": None, "slug": "", "visible": True}
            store.data.setdefault("routes", []).append(r)
            res = road_hours(r["from"], r["to"])
            if res:
                entry = {"hours": round(res[0] + float(pricing_cfg()["extra_hours"]), 1), "km": int(round(res[1])), "src": "osrm"}
                store.data.setdefault("durations", {})[f"{r['from']}|{r['to']}"] = entry
                store.data["durations"][f"{r['to']}|{r['from']}"] = dict(entry)
            store.save(f"add route {r['from']}→{r['to']}")
            _pc = price_for(r["from"], r["to"])
            send(f"✅ Маршрут додано. У дорозі ~{_pc['hours']} год → Comfort {_pc['uah']} ₴" if _pc else "✅ Маршрут додано (час розраховується автоматично).")
            return routes_view((len(store.data["routes"]) - 1) // PAGE)
        if a == "bulk":
            pct = float(text.replace("%", "").replace("+", "").strip())
            for r in store.data.get("routes", []):
                if r.get("price"):
                    r["price"] = int(round(r["price"] * (1 + pct / 100) / 50.0) * 50)
                if r.get("old_price"):
                    r["old_price"] = int(round(r["old_price"] * (1 + pct / 100) / 50.0) * 50)
            store.save(f"bulk prices {pct:+.1f}%")
            return routes_view(0)
        if a == "review_add":
            lines = [l for l in text.split("\n") if l.strip()]
            if len(lines) < 4:
                raise ValueError("format")
            r = {"name": lines[0].strip(), "date": lines[1].strip(), "stars": max(1, min(5, int(lines[2].strip()[0]))), "text": " ".join(lines[3:]).strip()}
            store.data.setdefault("reviews", []).insert(0, r)
            store.save(f"add review {r['name']}")
            return reviews_view()
        if a == "faqset":
            store.data.setdefault("faq", [])[p["i"]][p["field"]] = text.strip()
            store.save("edit faq")
            return faq_view()
        if a == "faq_add":
            lines = [l for l in text.split("\n") if l.strip()]
            if len(lines) < 2:
                raise ValueError("format")
            store.data.setdefault("faq", []).append({"q": lines[0].strip(), "a": " ".join(lines[1:]).strip()})
            store.save("add faq")
            return faq_view()
        if a == "mgr_add":
            m = _parse_manager(text)
            store.data.setdefault("managers", []).append(m)
            store.save(f"add manager {m['name']}")
            return managers_view()
        if a == "mset":
            ms = store.data.setdefault("managers", [])
            m = ms[p["i"]]
            v = text.strip()
            f = p["field"]
            d = "".join(ch for ch in m.get("phone", "") if ch.isdigit())
            if f == "phone":
                d = "".join(ch for ch in v if ch.isdigit())
                if len(d) < 10:
                    raise ValueError("phone")
                m["phone"] = "+" + d
                if not m.get("whatsapp") or "wa.me" in m.get("whatsapp", ""):
                    m["whatsapp"] = "https://wa.me/" + d
                if not m.get("telegram") or "t.me/+" in m.get("telegram", ""):
                    m["telegram"] = "https://t.me/+" + d
            elif f == "telegram" and v.lower() == "auto":
                m["telegram"] = "https://t.me/+" + d
            elif f == "whatsapp" and v.lower() == "auto":
                m["whatsapp"] = "https://wa.me/" + d
            else:
                m[f] = v
            store.save(f"manager {m['name']} {f}")
            return manager_view(p["i"])
        if a == "pr_rate":
            v = float(text.strip().replace(",", "."))
            if not (20 < v < 200):
                raise ValueError("rate")
            p = pricing_cfg()
            p["eur_rate"] = round(v, 2)
            p["rate_auto"] = False
            store.save("pricing rate")
            return pricing_view()
        if a == "pr_extra":
            v = float(text.strip().replace(",", "."))
            p = pricing_cfg()
            old = float(p.get("extra_hours", 3.0))
            p["extra_hours"] = v
            for k, d_ in store.data.get("durations", {}).items():
                d_["hours"] = round(max(1.0, d_["hours"] - old + v), 1)
            store.save("pricing extra_hours")
            return pricing_view()
        if a == "pr_disc":
            items = []
            for line in text.split("\n"):
                parts = line.strip().rsplit(" ", 1)
                if len(parts) == 2 and parts[1].replace("%", "").isdigit():
                    items.append({"label": parts[0].strip(), "pct": int(parts[1].replace("%", ""))})
            if not items:
                raise ValueError("disc")
            pricing_cfg()["discounts"] = items
            store.save("pricing discounts")
            return pricing_view()
        if a == "pr_tiers":
            rows = []
            for line in text.split("\n"):
                nums = [float(x) for x in line.replace("€", "").replace(",", ".").split()]
                if len(nums) == 4:
                    rows.append([int(nums[0]) if nums[0].is_integer() else nums[0], int(nums[1]) if nums[1].is_integer() else nums[1], int(nums[2]), int(nums[3])])
            if len(rows) < 2:
                raise ValueError("tiers")
            pricing_cfg()["tiers"] = rows
            store.save("pricing tiers")
            return pricing_view()
        if a == "cset":
            c = store.data.setdefault("contacts", {})
            v = text.strip()
            if p["field"] == "phone":
                digits_val = "".join(ch for ch in v if ch.isdigit())
                if len(digits_val) < 10:
                    raise ValueError("phone")
                c["phone"] = "+" + digits_val
                if len(digits_val) == 12:
                    c["phone_display"] = f"+{digits_val[:3]} {digits_val[3:5]} {digits_val[5:8]} {digits_val[8:10]} {digits_val[10:]}"
                else:
                    c["phone_display"] = "+" + digits_val
                if not c.get("whatsapp") or "wa.me" in c.get("whatsapp", ""):
                    c["whatsapp"] = "https://wa.me/" + digits_val
            elif p["field"] == "whatsapp" and v.lower() == "auto":
                digits_val = "".join(ch for ch in c.get("phone", "") if ch.isdigit())
                c["whatsapp"] = "https://wa.me/" + digits_val
            else:
                c[p["field"]] = v
            store.save(f"contacts {p['field']}")
            return contacts_view()
        if a == "hset":
            store.data.setdefault("hero", {})[p["field"]] = text.strip()
            store.save(f"hero {p['field']}")
            return hero_view()
        if a == "adv_set":
            adv_list = [l.strip() for l in text.split("\n") if l.strip()][:12]
            if adv_list:
                store.data["advantages"] = adv_list
                store.save("advantages")
            return hero_view()
        if a == "aset":
            an = store.data.setdefault("site", {}).setdefault("announcement", {"enabled": False, "text": "", "link": ""})
            field = p["field"]
            an[field] = "" if text.strip() in ("-", "—") else text.strip()
            if field == "text" and an["text"]:
                an["enabled"] = True
            store.save("announcement")
            return announce_view()
    except Exception as e:
        log.exception("handle_text error")
        send("❌ Не вдалося застосувати зміни. Перевірте формат і спробуйте ще раз.", main_menu())


def handle_update(u):
    msg = u.get("message") or u.get("edited_message")
    cq = u.get("callback_query")
    frm = (msg or cq or {}).get("from", {})
    uid = frm.get("id")
    if not is_admin(uid):
        return
    CTX.chat = uid
    if frm.get("first_name") and uid == OWNER_ID and store.state.get("owner_name") != frm.get("first_name"):
        store.state["owner_name"] = frm.get("first_name")
        mark_dirty()
    try:
        if cq:
            return handle_callback(cq)
        if msg:
            text = msg.get("text") or ""
            rt = msg.get("reply_to_message")
            if rt and (rt.get("text") or rt.get("caption")):
                import re as _re
                m = _re.search(r"#chat_([0-9a-f]{16})", rt.get("text") or rt.get("caption") or "")
                if m and not text.startswith("/"):
                    if dialog_of(uid) != m.group(1):
                        dialog_start(m.group(1))
                    relay_admin_message(msg)
                    return
            if text.startswith("/"):
                return handle_text(text)
            if cur_chat() in pending:
                return handle_text(text) if text else send("Очікую текст.")
            if dialog_of(uid):
                relay_admin_message(msg)
                return
            if text:
                return handle_text(text)
            return send("Щоб надіслати файл відвідувачу, спочатку натисніть «▶️ Почати діалог» у його чаті.", main_menu())
    finally:
        CTX.chat = None

# ----------------------------------------------------------------- Main loop

def main():
    tg("deleteWebhook", drop_pending_updates=False)
    store.load()
    tg("setMyCommands", commands=[
        {"command": "menu", "description": "Адмін-панель"},
        {"command": "site", "description": "Посилання на сайт"},
        {"command": "chats", "description": "Чати з відвідувачами"},
        {"command": "admins", "description": "Адміністратори"},
        {"command": "backup", "description": "Вивантажити site.json"},
        {"command": "cancel", "description": "Скасувати ввід"},
    ])
    offset = store.state.get("offset", 0)
    log.info("started; admin=%s repo=%s runtime=%ss state_mode=%s", ADMIN_ID, GH_REPO, MAX_RUNTIME, "encrypted" if STATE_SECRET else "redacted")
    if not STATE_SECRET:
        log.warning("STATE_SECRET is not set; leads/chats are kept only in memory and redacted in bot/state.json")
    if os.environ.get("NOTIFY_START") == "1":
        broadcast("🤖 Бот онлайн · /menu", main_menu())
    stop = {"flag": False}
    signal.signal(signal.SIGTERM, lambda *a: stop.__setitem__("flag", True))
    threading.Thread(target=bridge_listener, args=(stop,), daemon=True).start()
    last_state_save = time.time()
    while not stop["flag"] and time.time() - START < MAX_RUNTIME:
        try:
            r = http(API + "getUpdates", {"offset": offset, "timeout": 40, "allowed_updates": ["message", "callback_query"]}, timeout=60)
            for u in r.get("result", []):
                offset = u["update_id"] + 1
                try:
                    handle_update(u)
                except Exception:
                    log.exception("update failed")
        except Exception as e:
            log.warning("poll error: %s", e)
            time.sleep(3)
        if time.time() - last_state_save > 300 and (store.state.get("offset") != offset or state_dirty["flag"]):
            store.state["offset"] = offset
            store.save_state(silent=True)
            state_dirty["flag"] = False
            last_state_save = time.time()
    stop["flag"] = True
    store.state["offset"] = offset
    store.save_state(silent=True)
    log.info("runtime limit reached, exiting for restart")


if __name__ == "__main__":
    main()
