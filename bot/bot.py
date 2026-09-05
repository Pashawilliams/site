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
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# ----------------------------------------------------------------- GitHub storage

GH_H = {"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"}


class Store:
    def __init__(self):
        self.data = None
        self.sha = None
        self.state = {"leads": [], "log": [], "admins": [], "chats": {}, "banned": []}
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
        for k, v in (("leads", []), ("log", []), ("admins", []), ("chats", {}), ("banned", [])):
            self.state.setdefault(k, v)
        self.data.setdefault("managers", [])
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
        with self._lock:
            self.sha = self._put(DATA_PATH, self.data, self.sha, f"admin-bot: {msg}")
        self.state.setdefault("log", []).append({"t": self.data["updated_at"], "msg": msg})
        self.state["log"] = self.state["log"][-200:]
        self.save_state(silent=True)

    _lock = threading.Lock()

    def save_state(self, silent=False):
        try:
            with self._lock:
                self.state_sha = self._put(STATE_PATH, self.state, self.state_sha, "admin-bot: state")
        except Exception as e:
            log.warning("state save failed: %s", e)
            if not silent:
                raise


store = Store()
pending = {}  # chat_id -> {"action":..., ...}
state_dirty = {"flag": False}


def admin_ids():
    ids = [OWNER_ID] + [int(a["id"]) for a in store.state.get("admins", [])]
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

# ----------------------------------------------------------------- UI

def main_menu():
    d = store.data
    st = store.state
    open_chats = sum(1 for c in st.get("chats", {}).values() if not c.get("closed"))
    new_leads = sum(1 for l in st.get("leads", []) if not l.get("done"))
    m = "🔴 Техроботи" if d["site"].get("maintenance") else "🟢 Онлайн"
    an = d["site"].get("announcement", {})
    dlg = dialog_of(cur_chat())
    rows_top = [(f"📥 Заявки{' · '+str(new_leads) if new_leads else ''}", "leads"), (f"💬 Чати{' · '+str(open_chats) if open_chats else ''}", "chats")]
    extra = [[(f"⏹ Завершити діалог з {(st.get('chats', {}).get(dlg, {}).get('name') or 'Гість')}", f"dlg_end:{dlg}")]] if dlg else []
    return ikb(extra + [
        rows_top,
        [("🛣 Маршрути", "routes:0"), ("⭐ Відгуки", "reviews"), ("❓ FAQ", "faq")],
        [("🏠 Головна", "hero"), ("👤 Менеджери", "managers")],
        [(("📢 Оголошення ✓" if an.get("enabled") else "📢 Оголошення"), "announce"), (m, "maint")],
        [("👥 Адміни", "admins"), ("📊 Журнал", "stats"), ("🌐 Сайт", "open")],
    ])


def show_main(msg_id=None):
    d = store.data
    txt = (f"<b>Eurotour · панель</b>\n"
           f"🛣 {len(d['routes'])} · ⭐ {len(d['reviews'])} · ❓ {len(d['faq'])}\n"
           f"<i>оновлено {esc((d.get('updated_at','') or '')[5:16].replace('T',' '))}</i>")
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
    rows.append([("➕ Маршрут", "route_add"), ("💱 Усі ціни ±%", "bulk")])
    rows.append([("⬅️ Меню", "main")])
    txt = f"<b>Маршрути</b> · {total}"
    if msg_id:
        edit(msg_id, txt, ikb(rows))
    else:
        send(txt, ikb(rows))


def route_view(i, msg_id=None):
    r = store.data["routes"][i]
    vis = "🚫 Сховати" if r.get("visible", True) else "✅ Показати"
    txt = (f"<b>{esc(r['from'])} → {esc(r['to'])}</b>\n"
           f"💰 <b>{r.get('price') or '—'} грн</b>" + (f"  <s>{r['old_price']}</s>" if r.get('old_price') else "") +
           (f"  🔖 {esc(r['badge'])}" if r.get('badge') else "") + ("" if r.get('visible', True) else "\n🚫 приховано"))
    kb = ikb([
        [("−200", f"radj:{i}:-200"), ("−100", f"radj:{i}:-100"), ("+100", f"radj:{i}:100"), ("+200", f"radj:{i}:200")],
        [("💰 Ввести ціну", f"rset:{i}:price"), ("🏷 Стара ціна", f"rset:{i}:old_price")],
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
        [("👤 Менеджери", "managers"), ("⬅️ Меню", "main")],
    ])
    (edit if msg_id else send)(*((msg_id, txt, kb) if msg_id else (txt, kb)))


def _mgr_fmt(m):
    d = "".join(ch for ch in m.get("phone", "") if ch.isdigit())
    ph = f"+{d[:3]} {d[3:5]} {d[5:8]} {d[8:10]} {d[10:]}".strip() if len(d) == 12 else m.get("phone", "")
    return f"<b>{esc(m.get('name',''))}</b> — {esc(ph)}\n<i>{esc(m.get('role',''))}</i>"


def managers_view(msg_id=None):
    ms = store.data.setdefault("managers", [])
    txt = "<b>👤 Менеджери</b>\nПоказуються у розділі «Контакти», у футері, в мобільному меню та у вікні вибору «кому написати/подзвонити».\n\n"
    txt += "\n\n".join(f"{i+1}. {_mgr_fmt(m)}" for i, m in enumerate(ms)) if ms else "<i>Список порожній — на сайті показуються менеджери за замовчуванням.</i>"
    rows = [[(f"{i+1}. {m.get('name','')}", f"mgr:{i}")] for i, m in enumerate(ms)]
    rows.append([("➕ Додати менеджера", "mgr_add")])
    rows.append([("📞 Загальні контакти", "contacts"), ("⬅️ Меню", "main")])
    (edit if msg_id else send)(*((msg_id, txt, ikb(rows)) if msg_id else (txt, ikb(rows))))


def manager_view(i, msg_id=None):
    ms = store.data.get("managers", [])
    if i >= len(ms):
        return managers_view(msg_id)
    m = ms[i]
    txt = (f"{_mgr_fmt(m)}\nTelegram: {esc(m.get('telegram','') or 'авто (за номером)')}\nWhatsApp: {esc(m.get('whatsapp','') or 'авто (за номером)')}")
    kb = ikb([
        [("✏️ Ім'я", f"mset:{i}:name"), ("✏️ Посада", f"mset:{i}:role")],
        [("📱 Телефон", f"mset:{i}:phone"), ("✈️ Telegram", f"mset:{i}:telegram"), ("💬 WhatsApp", f"mset:{i}:whatsapp")],
        [("⬆️ Вище", f"mup:{i}"), ("🗑 Видалити", f"mdel:{i}"), ("⬅️ Назад", "managers")],
    ])
    (edit if msg_id else send)(*((msg_id, txt, kb) if msg_id else (txt, kb)))


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
    txt = (f"<b>Журнал</b>\n📥 {len(leads)} заявок · 💬 {len(st.get('chats', {}))} чатів · 👥 {len(admin_ids())} адмінів\n"
           f"⏱ бот працює {int((time.time()-START)/60)} хв\n\n" + ("\n".join(f"• {esc(l['t'][5:16].replace('T',' '))} {esc(l['msg'])}" for l in logs) or "—"))
    kb = ikb([[("♻️ Перечитати дані", "reload"), ("💾 Бекап", "backup")], [("⬅️ Меню", "main")]])
    (edit if msg_id else send)(*((msg_id, txt, kb) if msg_id else (txt, kb)))

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
    (edit if msg_id else send)(*((msg_id, txt, ikb(rows)) if msg_id else (txt, ikb(rows))))


CANNED = [("👋 Вітаю", "Вітаю! Дякуємо за звернення. Чим можу допомогти?"),
          ("📞 Номер?", "Залиште, будь ласка, номер телефону — менеджер зателефонує найближчим часом."),
          ("🗓 Дата?", "На яку дату і з якого міста плануєте поїздку?"),
          ("✅ Заброньовано", "Місце заброньовано ✅ Деталі поїздки надішлемо напередодні виїзду."),
          ("🙏 Дякуємо", "Дякуємо за звернення! Гарної дороги 🚐")]


def dialog_of(uid):
    """sid of the visitor this admin is currently talking to (dialog mode)."""
    return store.state.setdefault("dialogs", {}).get(str(uid))


def admin_name(uid=None):
    uid = uid or cur_chat()
    for a in store.state.get("admins", []):
        if int(a.get("id", 0)) == int(uid) and a.get("name"):
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
    c = store.state.get("chats", {}).get(sidv, {})
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
    (edit if msg_id else send)(*((msg_id, txt, ikb(rows)) if msg_id else (txt, ikb(rows))))


def chat_view(sidv, msg_id=None):
    c = store.state.get("chats", {}).get(sidv)
    if not c:
        return send("Чат не знайдено.")
    hist = c.get("msgs", [])[-20:]
    lines = [("👤 " if m["dir"] == "in" else "🧑‍💼 ") + esc(m.get("text") or "") for m in hist]
    if c.get("agent"):
        lines.insert(0, f"<i>у діалозі з {esc(admin_name(c['agent']))}</i>\n")
    txt = f"<b>Чат #chat_{sidv}</b>\nВідвідувач: {esc(c.get('name') or 'Гість')}\nСторінка: {esc((c.get('page') or '')[:80])}\n\n" + "\n".join(lines)
    (edit if msg_id else send)(*((msg_id, txt[:4000], chat_kb(sidv)) if msg_id else (txt[:4000], chat_kb(sidv))))


def signal_visitor(sidv, payload):
    """Send a lightweight event (typing/seen) to the visitor without storing it."""
    topic = store.data.get("bridge", {}).get("inbox", "") + "-r-" + sidv
    try:
        req = urllib.request.Request(NTFY + topic, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "Title": "event", "Cache": "no"}, method="POST")
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        log.debug("signal failed: %s", e)


def reply_to_visitor(sidv, text, file=None):
    """file = (bytes, filename, mime) → uploaded as ntfy attachment."""
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
    """Admin is in dialog mode: forward text / photo / document / video / voice to the visitor."""
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


KINDS = {"booking": "🎫 Бронювання рейсу", "manager": "📞 Звʼязок з менеджером", "callback": "📞 Зворотний дзвінок", "payment": "💳 Оплата карткою",
         "delivery": "📦 Доставка посилки", "transfer": "🚐 Трансфер", "review": "⭐ Новий відгук", "form": "📝 Форма"}


def fmt_lead(ev):
    lead = ev.get("lead") or {}
    fields = lead.get("fields") or {}
    if not fields:  # legacy payload
        for k, label in (("name", "Імʼя"), ("phone", "Телефон"), ("direction", "Маршрут"), ("date", "Дата"), ("time", "Час"), ("price_text", "Ціна"), ("email", "Email")):
            if lead.get(k):
                fields[label] = lead[k]
    lines = [f"📥 <b>Нова заявка · {esc(KINDS.get(lead.get('type'), lead.get('type') or 'форма'))}</b>", ""]
    order = ["Імʼя", "Телефон", "Маршрут", "Звідки", "Куди", "Дата рейсу", "Дата", "Дата відправлення", "Час відправлення", "Пасажирів", "Тип посилки", "Email", "Відгук", "Крок"]
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
        digits = "".join(ch for ch in str(phone) if ch.isdigit())
        if len(digits) >= 10:
            lines.append("")
            lines.append(f"📲 <a href=\"https://wa.me/{digits}\">WhatsApp</a> · <a href=\"https://t.me/+{digits}\">Telegram</a> · <code>+{digits}</code>")
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
                # plain relay — no headers, no buttons
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
    """Mirror a visitor attachment into Telegram (photo/document by URL)."""
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
    """Subscribe to ntfy inbox topic (JSON stream) and dispatch events."""
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


# ----------------------------------------------------------------- handlers

def ask(action, prompt, **extra):
    pending[cur_chat()] = dict(action=action, **extra)
    send(prompt, ikb([[("✖️ Скасувати", "cancel")]]))


def handle_callback(cq):
    data = cq.get("data", "")
    msg_id = cq["message"]["message_id"]
    tg("answerCallbackQuery", callback_query_id=cq["id"])
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
        tg("answerCallbackQuery", callback_query_id=cq["id"], text="Дані оновлено")
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
        names = {"price": "Ціна, грн:", "old_price": "Стара ціна (0 — прибрати):", "badge": "Бейдж (напр. ХІТ) або «-»:"}
        return ask("rset", names[field], i=int(i), field=field)
    if data == "route_add":
        return ask("route_add", "Формат: <code>Київ - Варшава - 4200</code>")
    if data == "bulk":
        return edit(msg_id, "Змінити <b>всі</b> ціни на:", ikb([[("−10%", "bulkp:-10"), ("−5%", "bulkp:-5"), ("+5%", "bulkp:5"), ("+10%", "bulkp:10")], [("✏️ Інший %", "bulk_ask"), ("⬅️ Назад", "routes:0")]]))
    if data == "bulk_ask":
        return ask("bulk", "Відсоток, напр. <code>+7</code> або <code>-3</code>")
    if data.startswith("bulkp:"):
        pct = float(data.split(":")[1])
        for r in store.data["routes"]:
            for k in ("price", "old_price"):
                if r.get(k):
                    r[k] = int(round(r[k] * (1 + pct / 100) / 100.0) * 100)
        store.save(f"bulk prices {pct:+.0f}%")
        tg("answerCallbackQuery", callback_query_id=cq["id"], text=f"Готово: {pct:+.0f}%")
        return routes_view(0, msg_id)
    if data.startswith("radj:"):
        _, i, dlt = data.split(":")
        i = int(i); r = store.data["routes"][i]
        r["price"] = max(0, (r.get("price") or 0) + int(dlt))
        store.save(f"route {r['from']}→{r['to']} price={r['price']}")
        return route_view(i, msg_id)
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
        return ask("review_add", "4 рядки:\n<code>Імʼя\n12.09.2026\n5\nТекст</code>")
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
        return ask("faq_add", "2 рядки:\n<code>Питання?\nВідповідь.</code>")
    if data == "managers":
        return managers_view(msg_id)
    if data.startswith("mgr:"):
        return manager_view(int(data.split(":")[1]), msg_id)
    if data == "mgr_add":
        return ask("mgr_add", "Надішліть дані менеджера (кожне з нового рядка):\n<code>Ім'я\n+380XXXXXXXXX\nПосада (необов'язково)\nПосилання Telegram (необов'язково)\nПосилання WhatsApp (необов'язково)</code>\n\nПриклад:\n<code>Олексій\n+380973452025\nМенеджер з перевезень\nhttps://t.me/pereviznyk_support</code>")
    if data.startswith("mset:"):
        _, i, field = data.split(":")
        hints = {"name": "Нове ім'я:", "role": "Нова посада:", "phone": "Номер: <code>+380XXXXXXXXX</code>", "telegram": "Посилання t.me/… або «auto»", "whatsapp": "Посилання wa.me/… або «auto»"}
        return ask("mset", hints[field], i=int(i), field=field)
    if data.startswith("mup:"):
        i = int(data.split(":")[1])
        ms = store.data["managers"]
        if i > 0:
            ms[i-1], ms[i] = ms[i], ms[i-1]
            store.save("managers reorder")
        return managers_view(msg_id)
    if data.startswith("mdel:"):
        i = int(data.split(":")[1])
        ms = store.data["managers"]
        if i < len(ms):
            m = ms.pop(i)
            store.save(f"delete manager {m.get('name','')}")
        return managers_view(msg_id)
    if data == "contacts":
        return contacts_view(msg_id)
    if data.startswith("cset:"):
        field = data.split(":")[1]
        hints = {"phone": "Номер: <code>+380XXXXXXXXX</code>", "telegram": "Посилання t.me/…", "whatsapp": "Посилання wa.me/… або «auto»", "support_note": "Підпис у шапці:"}
        return ask("cset", hints[field], field=field)
    if data == "hero":
        return hero_view(msg_id)
    if data.startswith("hset:"):
        return ask("hset", "Новий текст:", field=data.split(":")[1])
    if data == "adv_set":
        return ask("adv_set", "Переваги — кожна з нового рядка:")
    if data == "announce":
        return announce_view(msg_id)
    if data.startswith("aset:"):
        return ask("aset", "Текст оголошення:" if data.endswith("text") else "Посилання або «-»:", field=data.split(":")[1])
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
        store.state["admins"] = [a for a in store.state["admins"] if int(a["id"]) != uid]
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
        ok = reply_to_visitor(sidv, CANNED[int(i)][1])
        tg("answerCallbackQuery", callback_query_id=cq["id"], text="Надіслано ✅" if ok else "Помилка ❌")
        return chat_view(sidv, msg_id)
    if data.startswith("chatclose:"):
        return dialog_end(data.split(":")[1])
    if data.startswith("chatdel:"):
        sidv = data.split(":")[1]
        store.state.get("chats", {}).pop(sidv, None)
        mark_dirty()
        store.save_state(silent=True)
        return chats_view(msg_id)
    if data == "chats_clear_closed":
        ch = store.state.get("chats", {})
        for k in [k for k, v in ch.items() if v.get("closed")]:
            ch.pop(k, None)
        mark_dirty(); store.save_state(silent=True)
        return chats_view(msg_id)
    if data == "chats_clear_all":
        return edit(msg_id, "Видалити <b>всі</b> чати? Історію не можна буде відновити.", ikb([[("🗑 Так, видалити все", "chats_clear_all_yes"), ("Скасувати", "chats")]]))
    if data == "chats_clear_all_yes":
        store.state["chats"] = {}
        mark_dirty(); store.save_state(silent=True)
        return chats_view(msg_id)
    if data == "leads_clear":
        store.state["leads"] = []
        mark_dirty(); store.save_state(silent=True)
        return stats_view(msg_id)
    if data.startswith("chatban:"):
        sidv = data.split(":")[1]
        if sidv not in store.state["banned"]:
            store.state["banned"].append(sidv)
        mark_dirty()
        return chats_view(msg_id)
    if data.startswith("lead_done:"):
        i = int(data.split(":")[1])
        ls = store.state.get("leads", [])
        if 0 <= i < len(ls):
            ls[i]["done"] = True; mark_dirty()
        try:
            old = cq["message"].get("text") or ""
            edit(msg_id, esc(old) + "\n\n✅ <b>Опрацьовано</b>", ikb([[("↩️ Повернути", f"lead_undo:{i}")]]))
        except Exception:
            pass
        return
    if data.startswith("lead_undo:"):
        i = int(data.split(":")[1]); ls = store.state.get("leads", [])
        if 0 <= i < len(ls):
            ls[i]["done"] = False; mark_dirty()
        return edit(msg_id, "Заявку повернуто в роботу.", ikb([[("✅ Опрацьовано", f"lead_done:{i}")]]))
    if data == "leads":
        leads = store.state.get("leads", [])[-10:]
        def _fmt(l):
            try:
                d = json.loads(l["text"]); return ", ".join(f"{k}: {v}" for k, v in d.items() if v and k not in ("path", "title"))
            except Exception:
                return l["text"]
        txt = "<b>Заявки</b> · останні 10\n\n" + ("\n\n".join(f"{'✅' if l.get('done') else '🆕'} {esc(l['t'][5:16].replace('T',' '))} {esc(l.get('kind',''))}\n{esc(_fmt(l))}" for l in leads) or "Поки немає")
        return edit(msg_id, txt, ikb([[("🗑 Очистити", "leads_clear"), ("⬅️ Меню", "main")]]))


def num(s):
    s = str(s).replace(" ", "").replace("грн", "").replace(",", ".")
    return int(float(s))


def handle_text(text):
    p = pending.pop(cur_chat(), None)
    if text.startswith("/cancel"):
        return show_main()
    if text.startswith("/start") or text.startswith("/menu") or text.startswith("/admin"):
        return show_main()
    if text.startswith("/help"):
        return send("Команди:\n/menu — панель\n/site — посилання на сайт\n/chats — чати з відвідувачами\n/end — завершити поточний діалог\n/admins — адміністратори\n/backup — вивантажити site.json\n/cancel — скасувати ввід\n\nВідповісти відвідувачу: зробіть swipe-reply на його повідомлення і напишіть текст.")
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
        # free text from admin = treat as note/lead
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
                return send("Це ваш власний ID — ви і так власник.")
            if any(int(x["id"]) == uid for x in store.state["admins"]):
                return send("Такий адміністратор уже є.")
            store.state["admins"].append({"id": uid, "name": name, "added": dt.datetime.utcnow().isoformat()})
            store.save_state(silent=True)
            r = send(f"✅ Вас додано адміністратором сайту. Натисніть /menu", chat_id=uid)
            if not r.get("ok"):
                send("⚠️ Не вдалося написати новому адміну — він має спершу натиснути /start у боті. Доступ уже надано.")
            return admins_view()
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
            send("✅ Додано. Ціна одразу працює в пошуку на сайті.")
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
        if a == "mgr_add":
            m = _parse_manager(text)
            store.data.setdefault("managers", []).append(m)
            store.save(f"add manager {m['name']}")
            return managers_view()
        if a == "mset":
            ms = store.data["managers"]
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
        send("❌ Не вийшло. Перевірте формат і спробуйте ще раз.", main_menu())


def handle_update(u):
    msg = u.get("message") or u.get("edited_message")
    cq = u.get("callback_query")
    frm = (msg or cq or {}).get("from", {})
    uid = frm.get("id")
    if not is_admin(uid):
        return  # ignore everyone else silently
    CTX.chat = uid
    if frm.get("first_name") and uid == OWNER_ID and store.state.get("owner_name") != frm.get("first_name"):
        store.state["owner_name"] = frm.get("first_name"); mark_dirty()
    try:
        if cq:
            return handle_callback(cq)
        if msg:
            text = msg.get("text") or ""
            # swipe-reply on a visitor message → answer that chat (and enter dialog)
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

# ----------------------------------------------------------------- main loop

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
    log.info("started; admin=%s repo=%s runtime=%ss", ADMIN_ID, GH_REPO, MAX_RUNTIME)
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
