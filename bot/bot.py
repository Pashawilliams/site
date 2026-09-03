#!/usr/bin/env python3
"""
Telegram admin bot for the site.

- Only ADMIN_ID may use it; everyone else is ignored silently.
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
import signal
import logging
import datetime as dt
import urllib.request
import urllib.parse
import urllib.error

BOT_TOKEN = os.environ["BOT_TOKEN"]
ADMIN_ID = int(os.environ.get("ADMIN_ID", "7906546417"))
GH_TOKEN = os.environ["GH_TOKEN"]
GH_REPO = os.environ.get("GH_REPO", "Pashawilliams/site")
GH_BRANCH = os.environ.get("GH_BRANCH", "main")
DATA_PATH = "data/site.json"
STATE_PATH = "bot/state.json"
SITE_URL = os.environ.get("SITE_URL", "https://pashawilliams.github.io/site/")
MAX_RUNTIME = int(os.environ.get("MAX_RUNTIME", str(5 * 3600 + 20 * 60)))  # 5h20m
START = time.time()

API = f"https://api.telegram.org/bot{BOT_TOKEN}/"
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bot")

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


def send(text, kb=None, chat_id=None, parse="HTML"):
    p = {"chat_id": chat_id or ADMIN_ID, "text": text, "parse_mode": parse, "disable_web_page_preview": True}
    if kb:
        p["reply_markup"] = kb
    return tg("sendMessage", **p)


def edit(msg_id, text, kb=None, chat_id=None):
    p = {"chat_id": chat_id or ADMIN_ID, "message_id": msg_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if kb:
        p["reply_markup"] = kb
    r = tg("editMessageText", **p)
    if not r.get("ok"):
        send(text, kb, chat_id)


def ikb(rows):
    return {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in rows]}


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# ----------------------------------------------------------------- GitHub storage

GH_H = {"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"}


class Store:
    def __init__(self):
        self.data = None
        self.sha = None
        self.state = {"leads": [], "log": []}
        self.state_sha = None

    def load(self):
        r = http(f"https://api.github.com/repos/{GH_REPO}/contents/{DATA_PATH}?ref={GH_BRANCH}", headers=GH_H)
        self.sha = r["sha"]
        self.data = json.loads(base64.b64decode(r["content"]).decode())
        try:
            r = http(f"https://api.github.com/repos/{GH_REPO}/contents/{STATE_PATH}?ref={GH_BRANCH}", headers=GH_H)
            self.state_sha = r["sha"]
            self.state = json.loads(base64.b64decode(r["content"]).decode())
        except urllib.error.HTTPError:
            self.state_sha = None
        return self.data

    def _put(self, path, obj, sha, msg):
        content = base64.b64encode(json.dumps(obj, ensure_ascii=False, indent=2).encode()).decode()
        body = {"message": msg, "content": content, "branch": GH_BRANCH}
        if sha:
            body["sha"] = sha
        for attempt in range(3):
            try:
                r = http(f"https://api.github.com/repos/{GH_REPO}/contents/{path}", body, GH_H, method="PUT")
                return r["content"]["sha"]
            except urllib.error.HTTPError as e:
                if e.code in (409, 422) and attempt < 2:
                    # sha out of date -> refetch and retry
                    cur = http(f"https://api.github.com/repos/{GH_REPO}/contents/{path}?ref={GH_BRANCH}", headers=GH_H)
                    body["sha"] = cur["sha"]
                    time.sleep(1)
                    continue
                raise

    def save(self, msg):
        self.data["updated_at"] = dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        self.sha = self._put(DATA_PATH, self.data, self.sha, f"admin-bot: {msg}")
        self.state.setdefault("log", []).append({"t": self.data["updated_at"], "msg": msg})
        self.state["log"] = self.state["log"][-200:]
        self.save_state(silent=True)

    def save_state(self, silent=False):
        try:
            self.state_sha = self._put(STATE_PATH, self.state, self.state_sha, "admin-bot: state")
        except Exception as e:
            log.warning("state save failed: %s", e)
            if not silent:
                raise


store = Store()
pending = {}  # chat_id -> {"action":..., ...}

# ----------------------------------------------------------------- UI

def main_menu():
    d = store.data
    m = "🔴 Техроботи: УВІМК" if d["site"].get("maintenance") else "🟢 Сайт працює"
    return ikb([
        [("🛣 Маршрути і ціни", "routes:0"), ("⭐ Відгуки", "reviews")],
        [("❓ FAQ", "faq"), ("📞 Контакти", "contacts")],
        [("🏠 Головний екран", "hero"), ("📢 Оголошення", "announce")],
        [(m, "maint"), ("📊 Статистика", "stats")],
        [("🌐 Відкрити сайт", "open"), ("♻️ Перезавантажити дані", "reload")],
    ])


def show_main(msg_id=None):
    d = store.data
    txt = (f"<b>Адмін-панель сайту</b>\n"
           f"{esc(d['site'].get('name',''))} — {esc(d['site'].get('tagline',''))}\n\n"
           f"Маршрутів: <b>{len(d['routes'])}</b> · Відгуків: <b>{len(d['reviews'])}</b> · FAQ: <b>{len(d['faq'])}</b>\n"
           f"Оновлено: {esc(d.get('updated_at',''))}\n"
           f"Бот працює: {int((time.time()-START)/60)} хв (перезапуск кожні 5г20хв)")
    if msg_id:
        edit(msg_id, txt, main_menu())
    else:
        send(txt, main_menu())


PAGE = 10


def routes_view(page, msg_id=None):
    rs = store.data["routes"]
    total = len(rs)
    page = max(0, min(page, (total - 1) // PAGE))
    rows = []
    for i in range(page * PAGE, min(total, (page + 1) * PAGE)):
        r = rs[i]
        eye = "" if r.get("visible", True) else "🚫 "
        rows.append([(f"{eye}{r['from']} → {r['to']} · {r.get('price') or '—'} грн", f"route:{i}")])
    nav = []
    if page > 0:
        nav.append(("◀️", f"routes:{page-1}"))
    nav.append((f"{page+1}/{(total-1)//PAGE+1}", "noop"))
    if (page + 1) * PAGE < total:
        nav.append(("▶️", f"routes:{page+1}"))
    rows.append(nav)
    rows.append([("➕ Додати маршрут", "route_add"), ("💱 Змінити всі ціни на %", "bulk")])
    rows.append([("⬅️ Меню", "main")])
    txt = f"<b>Маршрути</b> ({total}). Натисніть, щоб редагувати:"
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


def route_view(i, msg_id=None):
    r = store.data["routes"][i]
    vis = "🚫 Сховати" if r.get("visible", True) else "✅ Показати"
    txt = (f"<b>{esc(r['from'])} → {esc(r['to'])}</b>\n"
           f"Ціна: <b>{r.get('price') or '—'} грн</b>\nСтара ціна: {r.get('old_price') or '—'}\n"
           f"Бейдж: {esc(r.get('badge') or '—')}\nВидимість: {'показується' if r.get('visible', True) else 'приховано'}")
    kb = ikb([
        [("💰 Ціна", f"rset:{i}:price"), ("🏷 Стара ціна", f"rset:{i}:old_price")],
        [("🔖 Бейдж", f"rset:{i}:badge"), (vis, f"rtoggle:{i}")],
        [("🗑 Видалити", f"rdel:{i}"), ("⬅️ Назад", f"routes:{i//PAGE}")],
    ])
    if msg_id:
        edit(msg_id, txt, kb)
    else:
        send(txt, kb)


def reviews_view(msg_id=None):
    rows = [[(f"{r['name']} · {r.get('date','')} · {'★'*int(r.get('stars',5))}", f"review:{i}")] for i, r in enumerate(store.data["reviews"])]
    rows.append([("➕ Додати відгук", "review_add"), ("⬅️ Меню", "main")])
    txt = "<b>Відгуки</b>\n" + "\n\n".join(f"<b>{esc(r['name'])}</b> ({esc(r.get('date',''))}): {esc(r['text'][:120])}…" for r in store.data["reviews"])
    (edit if msg_id else send)(*((msg_id, txt, ikb(rows)) if msg_id else (txt, ikb(rows))))


def faq_view(msg_id=None):
    rows = [[(f"{i+1}. {f['q'][:40]}", f"faqi:{i}")] for i, f in enumerate(store.data["faq"])]
    rows.append([("➕ Додати питання", "faq_add"), ("⬅️ Меню", "main")])
    txt = "<b>FAQ</b> (перше питання показується великою карткою):\n\n" + "\n".join(f"{i+1}. {esc(f['q'])}" for i, f in enumerate(store.data["faq"]))
    (edit if msg_id else send)(*((msg_id, txt, ikb(rows)) if msg_id else (txt, ikb(rows))))


def contacts_view(msg_id=None):
    c = store.data["contacts"]
    txt = (f"<b>Контакти</b>\nТелефон: {esc(c.get('phone',''))} (показ: {esc(c.get('phone_display',''))})\n"
           f"Telegram: {esc(c.get('telegram',''))}\nWhatsApp: {esc(c.get('whatsapp',''))}\nПідпис: {esc(c.get('support_note',''))}")
    kb = ikb([
        [("📱 Телефон", "cset:phone"), ("✈️ Telegram", "cset:telegram")],
        [("💬 WhatsApp", "cset:whatsapp"), ("📝 Підпис у шапці", "cset:support_note")],
        [("⬅️ Меню", "main")],
    ])
    (edit if msg_id else send)(*((msg_id, txt, kb) if msg_id else (txt, kb)))


def hero_view(msg_id=None):
    h = store.data["hero"]
    a = store.data["advantages"]
    txt = (f"<b>Головний екран</b>\nЗаголовок: {esc(h.get('title',''))}\n\nПідзаголовок: {esc(h.get('subtitle',''))}\n\n"
           f"<b>Переваги</b> ({len(a)}):\n" + "\n".join(f"{i+1}. {esc(x)}" for i, x in enumerate(a)))
    kb = ikb([
        [("✏️ Заголовок", "hset:title"), ("✏️ Підзаголовок", "hset:subtitle")],
        [("📋 Переваги (список)", "adv_set"), ("⬅️ Меню", "main")],
    ])
    (edit if msg_id else send)(*((msg_id, txt, kb) if msg_id else (txt, kb)))


def announce_view(msg_id=None):
    a = store.data["site"].setdefault("announcement", {"enabled": False, "text": "", "link": ""})
    txt = (f"<b>Оголошення</b> (смужка зверху сайту)\nСтатус: {'🟢 увімкнено' if a.get('enabled') else '⚪️ вимкнено'}\n"
           f"Текст: {esc(a.get('text') or '—')}\nПосилання: {esc(a.get('link') or '—')}")
    kb = ikb([
        [("✏️ Текст", "aset:text"), ("🔗 Посилання", "aset:link")],
        [("🔁 Увімк/вимк", "atoggle"), ("⬅️ Меню", "main")],
    ])
    (edit if msg_id else send)(*((msg_id, txt, kb) if msg_id else (txt, kb)))


def stats_view(msg_id=None):
    st = store.state
    logs = st.get("log", [])[-10:]
    leads = st.get("leads", [])
    txt = (f"<b>Статистика</b>\nЗаявок отримано ботом: {len(leads)}\nОстанні зміни:\n" +
           ("\n".join(f"• {esc(l['t'][5:16])} {esc(l['msg'])}" for l in logs) or "—"))
    kb = ikb([[("📥 Останні заявки", "leads"), ("⬅️ Меню", "main")]])
    (edit if msg_id else send)(*((msg_id, txt, kb) if msg_id else (txt, kb)))

# ----------------------------------------------------------------- handlers

def ask(action, prompt, **extra):
    pending[ADMIN_ID] = dict(action=action, **extra)
    send(prompt + "\n\n<i>Надішліть текст або /cancel</i>")


def handle_callback(cq):
    data = cq.get("data", "")
    msg_id = cq["message"]["message_id"]
    tg("answerCallbackQuery", callback_query_id=cq["id"])
    if data == "noop":
        return
    if data == "main":
        return show_main(msg_id)
    if data == "open":
        return send(f"🌐 {SITE_URL}?v={int(time.time())}")
    if data == "reload":
        store.load()
        return show_main(msg_id)
    if data.startswith("routes:"):
        return routes_view(int(data.split(":")[1]), msg_id)
    if data.startswith("route:"):
        return route_view(int(data.split(":")[1]), msg_id)
    if data.startswith("rtoggle:"):
        i = int(data.split(":")[1])
        r = store.data["routes"][i]
        r["visible"] = not r.get("visible", True)
        store.save(f"route {r['from']}→{r['to']} visible={r['visible']}")
        return route_view(i, msg_id)
    if data.startswith("rdel:"):
        i = int(data.split(":")[1])
        r = store.data["routes"].pop(i)
        store.save(f"delete route {r['from']}→{r['to']}")
        return routes_view(0, msg_id)
    if data.startswith("rset:"):
        _, i, field = data.split(":")
        names = {"price": "нову ціну (число, грн)", "old_price": "стару ціну (число або 0 щоб прибрати)", "badge": "текст бейджа (напр. ХІТ, -20%) або «-» щоб прибрати"}
        return ask("rset", f"Введіть {names[field]}:", i=int(i), field=field)
    if data == "route_add":
        return ask("route_add", "Введіть маршрут у форматі:\n<code>Київ - Варшава - 4200</code>\n(опційно 4-м значенням стара ціна)")
    if data == "bulk":
        return ask("bulk", "На скільки відсотків змінити всі ціни? (напр. <code>+10</code> або <code>-5</code>)")
    if data == "reviews":
        return reviews_view(msg_id)
    if data.startswith("review:"):
        i = int(data.split(":")[1])
        r = store.data["reviews"][i]
        kb = ikb([[("🗑 Видалити", f"revdel:{i}"), ("⬅️ Назад", "reviews")]])
        return edit(msg_id, f"<b>{esc(r['name'])}</b> · {esc(r.get('date',''))} · {'★'*int(r.get('stars',5))}\n\n{esc(r['text'])}", kb)
    if data.startswith("revdel:"):
        i = int(data.split(":")[1])
        r = store.data["reviews"].pop(i)
        store.save(f"delete review {r['name']}")
        return reviews_view(msg_id)
    if data == "review_add":
        return ask("review_add", "Надішліть відгук у форматі (кожне з нового рядка):\n<code>Ім'я\nДата (напр. 12.09.2026)\nОцінка 1-5\nТекст відгуку</code>")
    if data == "faq":
        return faq_view(msg_id)
    if data.startswith("faqi:"):
        i = int(data.split(":")[1])
        f = store.data["faq"][i]
        kb = ikb([[("✏️ Питання", f"faqset:{i}:q"), ("✏️ Відповідь", f"faqset:{i}:a")], [("⬆️ Зробити першим", f"faqtop:{i}"), ("🗑 Видалити", f"faqdel:{i}")], [("⬅️ Назад", "faq")]])
        return edit(msg_id, f"<b>{esc(f['q'])}</b>\n\n{esc(f['a'])}", kb)
    if data.startswith("faqset:"):
        _, i, field = data.split(":")
        return ask("faqset", "Введіть " + ("нове питання:" if field == "q" else "нову відповідь:"), i=int(i), field=field)
    if data.startswith("faqtop:"):
        i = int(data.split(":")[1])
        f = store.data["faq"].pop(i)
        store.data["faq"].insert(0, f)
        store.save("faq reorder")
        return faq_view(msg_id)
    if data.startswith("faqdel:"):
        i = int(data.split(":")[1])
        store.data["faq"].pop(i)
        store.save("delete faq")
        return faq_view(msg_id)
    if data == "faq_add":
        return ask("faq_add", "Надішліть питання і відповідь двома рядками:\n<code>Питання?\nВідповідь.</code>")
    if data == "contacts":
        return contacts_view(msg_id)
    if data.startswith("cset:"):
        field = data.split(":")[1]
        hints = {"phone": "номер у форматі +380XXXXXXXXX", "telegram": "посилання https://t.me/…", "whatsapp": "посилання https://wa.me/380… (або «auto» — з телефону)", "support_note": "текст підпису"}
        return ask("cset", f"Введіть {hints[field]}:", field=field)
    if data == "hero":
        return hero_view(msg_id)
    if data.startswith("hset:"):
        return ask("hset", "Введіть новий текст:", field=data.split(":")[1])
    if data == "adv_set":
        return ask("adv_set", "Надішліть список переваг — кожна з нового рядка (до 12):")
    if data == "announce":
        return announce_view(msg_id)
    if data.startswith("aset:"):
        return ask("aset", "Введіть " + ("текст оголошення:" if data.endswith("text") else "посилання (або «-»):"), field=data.split(":")[1])
    if data == "atoggle":
        a = store.data["site"]["announcement"]
        a["enabled"] = not a.get("enabled")
        store.save(f"announcement enabled={a['enabled']}")
        return announce_view(msg_id)
    if data == "maint":
        s = store.data["site"]
        s["maintenance"] = not s.get("maintenance")
        store.save(f"maintenance={s['maintenance']}")
        return show_main(msg_id)
    if data == "stats":
        return stats_view(msg_id)
    if data == "leads":
        leads = store.state.get("leads", [])[-10:]
        txt = "<b>Останні заявки</b>\n\n" + ("\n\n".join(f"{esc(l['t'][:16])}\n{esc(l['text'])}" for l in leads) or "Поки немає")
        return edit(msg_id, txt, ikb([[("⬅️ Меню", "main")]]))


def num(s):
    s = str(s).replace(" ", "").replace("грн", "").replace(",", ".")
    return int(float(s))


def handle_text(text):
    p = pending.pop(ADMIN_ID, None)
    if text.startswith("/cancel"):
        return send("Скасовано.", main_menu())
    if text.startswith("/start") or text.startswith("/menu") or text.startswith("/admin"):
        return show_main()
    if text.startswith("/help"):
        return send("Команди:\n/menu — панель\n/site — посилання на сайт\n/backup — вивантажити site.json\n/cancel — скасувати ввід\n\nУсе інше робиться кнопками.")
    if text.startswith("/site"):
        return send(f"🌐 {SITE_URL}")
    if text.startswith("/backup"):
        content = json.dumps(store.data, ensure_ascii=False, indent=2).encode()
        boundary = "----botb"
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{ADMIN_ID}\r\n"
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"site.json\"\r\nContent-Type: application/json\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(API + "sendDocument", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        urllib.request.urlopen(req, timeout=60).read()
        return
    if not p:
        # free text from admin = treat as note/lead
        store.state.setdefault("leads", []).append({"t": dt.datetime.utcnow().isoformat(), "text": text})
        store.state["leads"] = store.state["leads"][-100:]
        store.save_state(silent=True)
        return send("Збережено як нотатку. Відкрити панель — /menu", main_menu())

    a = p["action"]
    try:
        if a == "rset":
            r = store.data["routes"][p["i"]]
            if p["field"] == "badge":
                r["badge"] = "" if text.strip() in ("-", "—") else text.strip()[:20]
            else:
                v = num(text)
                r[p["field"]] = v if v > 0 else None
            store.save(f"route {r['from']}→{r['to']} {p['field']}={r.get(p['field'])}")
            return route_view(p["i"])
        if a == "route_add":
            parts = [x.strip() for x in text.replace("–", "-").replace("—", "-").split("-")]
            if len(parts) < 3:
                raise ValueError("format")
            r = {"from": parts[0], "to": parts[1], "price": num(parts[2]), "old_price": num(parts[3]) if len(parts) > 3 else None, "slug": "", "visible": True}
            store.data["routes"].append(r)
            store.save(f"add route {r['from']}→{r['to']}")
            send("⚠️ Увага: нова картка зʼявиться на сайті лише якщо такий маршрут є у вёрстці. Ціна ж використовується у калькуляторі пошуку одразу.")
            return routes_view(len(store.data["routes"]) // PAGE)
        if a == "bulk":
            pct = float(text.replace("%", "").replace("+", "").strip())
            for r in store.data["routes"]:
                if r.get("price"):
                    r["price"] = int(round(r["price"] * (1 + pct / 100) / 100.0) * 100)
                if r.get("old_price"):
                    r["old_price"] = int(round(r["old_price"] * (1 + pct / 100) / 100.0) * 100)
            store.save(f"bulk prices {pct:+.1f}%")
            return routes_view(0)
        if a == "review_add":
            lines = [l for l in text.split("\n") if l.strip()]
            if len(lines) < 4:
                raise ValueError("format")
            r = {"name": lines[0].strip(), "date": lines[1].strip(), "stars": max(1, min(5, int(lines[2].strip()[0]))), "text": " ".join(lines[3:]).strip()}
            store.data["reviews"].insert(0, r)
            store.save(f"add review {r['name']}")
            return reviews_view()
        if a == "faqset":
            store.data["faq"][p["i"]][p["field"]] = text.strip()
            store.save("edit faq")
            return faq_view()
        if a == "faq_add":
            lines = [l for l in text.split("\n") if l.strip()]
            if len(lines) < 2:
                raise ValueError("format")
            store.data["faq"].append({"q": lines[0].strip(), "a": " ".join(lines[1:]).strip()})
            store.save("add faq")
            return faq_view()
        if a == "cset":
            c = store.data["contacts"]
            v = text.strip()
            if p["field"] == "phone":
                digits = "".join(ch for ch in v if ch.isdigit())
                if len(digits) < 10:
                    raise ValueError("phone")
                c["phone"] = "+" + digits
                c["phone_display"] = f"+{digits[:3]} {digits[3:5]} {digits[5:8]} {digits[8:10]} {digits[10:]}".strip()
                if not c.get("whatsapp") or "wa.me" in c.get("whatsapp", ""):
                    c["whatsapp"] = "https://wa.me/" + digits
            elif p["field"] == "whatsapp" and v.lower() == "auto":
                c["whatsapp"] = "https://wa.me/" + "".join(ch for ch in c["phone"] if ch.isdigit())
            else:
                c[p["field"]] = v
            store.save(f"contacts {p['field']}")
            return contacts_view()
        if a == "hset":
            store.data["hero"][p["field"]] = text.strip()
            store.save(f"hero {p['field']}")
            return hero_view()
        if a == "adv_set":
            store.data["advantages"] = [l.strip() for l in text.split("\n") if l.strip()][:12]
            store.save("advantages")
            return hero_view()
        if a == "aset":
            an = store.data["site"]["announcement"]
            an[p["field"]] = "" if text.strip() in ("-", "—") else text.strip()
            if p["field"] == "text" and an["text"]:
                an["enabled"] = True
            store.save("announcement")
            return announce_view()
    except Exception as e:
        log.exception("handle_text")
        send(f"❌ Помилка: {esc(e)}. Спробуйте ще раз.", main_menu())


def handle_update(u):
    msg = u.get("message") or u.get("edited_message")
    cq = u.get("callback_query")
    frm = (msg or cq or {}).get("from", {})
    if frm.get("id") != ADMIN_ID:
        return  # ignore everyone else silently
    if cq:
        return handle_callback(cq)
    if msg and "text" in msg:
        return handle_text(msg["text"])

# ----------------------------------------------------------------- main loop

def main():
    tg("deleteWebhook", drop_pending_updates=False)
    store.load()
    tg("setMyCommands", commands=[
        {"command": "menu", "description": "Адмін-панель"},
        {"command": "site", "description": "Посилання на сайт"},
        {"command": "backup", "description": "Вивантажити site.json"},
        {"command": "cancel", "description": "Скасувати ввід"},
    ])
    offset = store.state.get("offset", 0)
    log.info("started; admin=%s repo=%s runtime=%ss", ADMIN_ID, GH_REPO, MAX_RUNTIME)
    if os.environ.get("NOTIFY_START") == "1":
        send(f"🤖 Бот запущено (GitHub Actions). Наступний перезапуск через {MAX_RUNTIME//3600}г {(MAX_RUNTIME%3600)//60}хв.\n/menu — панель")
    stop = {"flag": False}
    signal.signal(signal.SIGTERM, lambda *a: stop.__setitem__("flag", True))
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
        if time.time() - last_state_save > 600 and store.state.get("offset") != offset:
            store.state["offset"] = offset
            store.save_state(silent=True)
            last_state_save = time.time()
    store.state["offset"] = offset
    store.save_state(silent=True)
    log.info("runtime limit reached, exiting for restart")


if __name__ == "__main__":
    main()
