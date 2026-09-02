#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_data.py — тянет статистику Steam-профиля и вшивает её в страницу.

Чистый Python 3.8+, никаких зависимостей. (Windows: запускай просто
`python fetch_data.py ...`.)

Что делает:
  1. читает ключ из steam_key.txt (файл в .gitignore, в репо не попадает);
  2. резолвит ник (vanity URL) в SteamID64;
  3. забирает профиль, библиотеку и активность за 2 недели через Steam Web API;
  4. добирает жанры из неофициального store-эндпоинта appdetails;
     если магазин молчит (возрастной гейт, пустой ответ) — фолбэк на SteamSpy;
     пустые результаты НЕ кэшируются, чтобы следующий прогон повторил попытку;
  5. подмешивает игры из extra_games.json — то, что API не отдаёт
     (например, Dota 2 из игнор-листа магазина);
  6. отсекает служебный софт (Wallpaper Engine, ShareX, Jackbox Megapicker…)
     и тестовые ветки игр (test server / dedicated server / beta / sdk…);
  7. чистит жанры от меток магазина («Free to Play», «Ранний доступ»,
     «18+», «Утилиты») и названия — от ™ и суффиксов «Complete Edition»;
  8. качает аватар в assets/img/;
  9. перезаписывает assets/js/data.js (компактно: одна игра на строку)
     и считает часы по жанрам для доната.

Запуск:
    python fetch_data.py --user K_Ak4d0
    python fetch_data.py --steamid 76561198000000000
    python fetch_data.py --user K_Ak4d0 --max-details 150 --delay 1.5

Первый прогон долгий (~5 минут): вежливые паузы между запросами к магазину.
Если что-то пойдёт не так, старый data.js сохранится рядом как data.js.bak,
а образцовые данные всегда лежат в assets/js/data.sample.js.
"""

import argparse
import html
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(ROOT, "steam_key.txt")
EXTRA_FILE = os.path.join(ROOT, "extra_games.json")
OUT_FILE = os.path.join(ROOT, "assets", "js", "data.js")
IMG_DIR = os.path.join(ROOT, "assets", "img")
CACHE_DIR = os.path.join(ROOT, ".cache", "appdetails")
# Словарь жанров лежит В РЕПОЗИТОРИИ и коммитится. На общих IP GitHub
# Actions магазин Steam быстро отвечает 429, поэтому чем меньше запросов
# нужно сделать, тем лучше: накопленное знание переиспользуется всеми
# прогонами и всеми профилями.
GENRE_DB = os.path.join(ROOT, "assets", "data", "genres.json")

API = "https://api.steampowered.com"
STORE = "https://store.steampowered.com/api/appdetails"
STEAMSPY = "https://steamspy.com/api.php"
UA = "steam-wrapped/1.0 (personal stats page; +https://github.com/KyuuketsukiAkado)"

# store отдаёт жанры на английском — переводим на человеческий
GENRE_RU = {
    "Action": "Экшен", "Adventure": "Приключения", "RPG": "RPG",
    "Strategy": "Стратегия", "Simulation": "Симулятор", "Indie": "Инди",
    "Casual": "Казуальные", "Sports": "Спорт", "Racing": "Гонки",
    "Massively Multiplayer": "MMO", "Free To Play": "Free to Play",
    "Free to Play": "Free to Play", "Early Access": "Ранний доступ",
    "Violent": "Жестокие", "Gore": "Жестокие", "Nudity": "18+",
    "Sexual Content": "18+", "Utilities": "Утилиты", "Design & Illustration": "Творчество",
    "Animation & Modeling": "Творчество", "Video Production": "Видео",
    "Audio Production": "Аудио", "Photo Editing": "Фото", "Game Development": "Геймдев",
    "Education": "Образование", "Software Training": "Обучение", "Web Publishing": "Веб",
    "Accounting": "Утилиты", "Movie": "Кино", "Documentary": "Кино", "Episodic": "Кино",
    "Short": "Кино", "Tutorial": "Обучение",
}

# метки магазина, а не жанры: съедают часы и портят донат
DROP_GENRES = {
    "Free to Play", "Free To Play", "Ранний доступ", "Early Access",
    "18+", "Nudity", "Sexual Content", "Утилиты", "Utilities",
}

# служебный софт, который только портит статистику
SKIP_APPIDS = {
    250820,   # SteamVR
    323910,   # SteamVR Performance Test
    228980,   # Steamworks Common Redistributables
    365670,   # Blender (иногда числится как игра)
    431960,   # Wallpaper Engine
}

# …и то же самое по названию, если appid вдруг другой
SKIP_NAME_PARTS = {
    "wallpaper engine",
    "sharex",
    "jackbox megapicker",
}

# тестовые и служебные ветки игр: «Dota 2 Test», «… Dedicated Server» и т.п.
TEST_BRANCH_RE = re.compile(
    r"test server|staging branch|\(beta\)|dedicated server|\bsdk\b|benchmark",
    re.IGNORECASE,
)

# суффиксы переизданий, которые ничего не говорят об игре
EDITION_RE = re.compile(
    r"\s*[-–—:]*\s*(complete|enhanced|definitive|goty|game of the year)(\s+edition)?\s*$",
    re.IGNORECASE,
)


# --------------------------------------------------------------------------


def clean_name(name):
    """«Some Game™ - Complete Edition» → «Some Game»."""
    n = html.unescape(name or "").strip()
    n = re.sub(r"[™®©]", "", n)
    n = EDITION_RE.sub("", n)
    n = re.sub(r"\s{2,}", " ", n)
    # после срезки суффикса остаётся хвост пунктуации: «The Witcher:» → «The Witcher»
    n = n.strip(" -–—:,")
    return n


def is_junk_game(appid, name):
    """Служебный софт и тестовые ветки — не игры, в статистику не идут."""
    if appid in SKIP_APPIDS:
        return True
    low = (name or "").lower()
    if any(part in low for part in SKIP_NAME_PARTS):
        return True
    if TEST_BRANCH_RE.search(low):
        return True
    return False


def load_extras(path):
    """extra_games.json: игры, которых API не отдаёт (см. README)."""
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            log("! extra_games.json: ожидался список — игнорирую файл")
            return []
        out = []
        for e in data:
            if not isinstance(e, dict) or "appid" not in e:
                continue
            out.append({
                "appid": int(e["appid"]),
                "name": clean_name(e.get("name") or ("App %s" % e["appid"])),
                "hours": round(float(e.get("hours") or 0), 1),
                "hours2w": round(float(e.get("hours2w") or 0), 1),
                "lastPlayed": e.get("lastPlayed") or None,
                "genres": [GENRE_RU.get(g, g) for g in (e.get("genres") or [])][:2],
            })
        return out
    except (ValueError, OSError) as e:
        log("! extra_games.json не прочитался (%s) — продолжаю без него" % e)
        return []


# --------------------------------------------------------------------------
# сеть
# --------------------------------------------------------------------------

def http_get(url, params=None, retries=4, timeout=25, delay=1.0, binary=False):
    """GET с ретраями и экспоненциальной паузой. Возвращает bytes или None."""
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    ctx = ssl.create_default_context()

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json,*/*",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503):          # нас просят подождать
                wait = delay * (2 ** attempt) + random.uniform(0, 0.6)
                log("    ! HTTP %s, пауза %.1f с" % (e.code, wait))
                time.sleep(wait)
                continue
            if e.code in (403, 404):
                return None
            log("    ! HTTP %s на %s" % (e.code, url.split("?")[0]))
            return None
        except Exception as e:                      # таймауты, DNS, TLS
            wait = delay * (2 ** attempt) + random.uniform(0, 0.6)
            log("    ! %s, пауза %.1f с" % (type(e).__name__, wait))
            time.sleep(wait)
    return None


def api_json(path, key, **params):
    params["key"] = key
    raw = http_get(API + path, params)
    if raw is None:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError:
        return None


def log(msg):
    print(msg, flush=True)


# --------------------------------------------------------------------------
# шаги
# --------------------------------------------------------------------------

def read_key(explicit=None):
    if explicit:
        return explicit.strip()
    env = os.environ.get("STEAM_API_KEY")
    if env:
        return env.strip()
    if not os.path.exists(KEY_FILE):
        sys.exit(
            "Нет ключа.\n"
            "  1) возьми его на https://steamcommunity.com/dev/apikey\n"
            "  2) положи одной строкой в файл steam_key.txt рядом со скриптом\n"
            "     (он уже в .gitignore и в репозиторий не попадёт)"
        )
    with open(KEY_FILE, "r", encoding="utf-8") as f:
        key = f.read().strip()
    if not re.fullmatch(r"[0-9A-Fa-f]{32}", key):
        log("! Ключ не похож на стандартный (32 hex-символа) — пробую как есть")
    return key


def resolve_steamid(key, user):
    """Ник, ссылка на профиль или готовый SteamID64 → SteamID64."""
    user = user.strip().rstrip("/")
    m = re.search(r"/profiles/(\d{17})", user)
    if m:
        return m.group(1)
    m = re.search(r"/id/([^/]+)", user)
    if m:
        user = m.group(1)
    if re.fullmatch(r"\d{17}", user):
        return user

    log("· резолвлю ник %s" % user)
    data = api_json("/ISteamUser/ResolveVanityURL/v1/", key, vanityurl=user)
    resp = (data or {}).get("response", {})
    if resp.get("success") == 1:
        return resp["steamid"]
    sys.exit("Не удалось найти профиль «%s». Проверь ник или передай --steamid." % user)


def get_summary(key, steamid):
    data = api_json("/ISteamUser/GetPlayerSummaries/v2/", key, steamids=steamid)
    players = (data or {}).get("response", {}).get("players", [])
    return players[0] if players else {}


def get_owned(key, steamid):
    data = api_json("/IPlayerService/GetOwnedGames/v1/", key,
                    steamid=steamid, include_appinfo=1,
                    include_played_free_games=1, format="json")
    resp = (data or {}).get("response", {})
    games = resp.get("games")
    if games is None:
        sys.exit(
            "API вернул пустую библиотеку.\n"
            "Скорее всего, приватность профиля закрыта: Steam → Профиль →\n"
            "Настройки приватности → «Игровые данные» = Открытый доступ."
        )
    return resp.get("game_count", len(games)), games


def get_recent(key, steamid):
    data = api_json("/IPlayerService/GetRecentlyPlayedGames/v1/", key, steamid=steamid)
    return (data or {}).get("response", {}).get("games", []) or []


def translate_genres(genres_en):
    """EN → RU, выкидываем метки магазина и дубли, максимум 2 жанра."""
    seen, clean = set(), []
    for g in genres_en:
        ru = GENRE_RU.get(g, g)
        if ru in DROP_GENRES or ru in seen:
            continue
        seen.add(ru)
        clean.append(ru)
    return clean[:2]


def genres_from_store(appid, delay):
    """Жанры из карточки магазина. Пустой список = магазин молчит."""
    raw = http_get(STORE, {"appids": appid, "l": "english"}, delay=delay)
    time.sleep(delay + random.uniform(0, 0.4))      # вежливая пауза

    genres = []
    if raw:
        try:
            payload = json.loads(raw.decode("utf-8")).get(str(appid), {})
            if payload.get("success"):
                d = payload.get("data", {})
                genres = [g.get("description") for g in d.get("genres", []) if g.get("description")]
        except ValueError:
            genres = []
    return genres


def genres_from_steamspy(appid, delay):
    """Фолбэк: у игр с возрастным гейтом store часто молчит — SteamSpy не церемонится."""
    raw = http_get(STEAMSPY, {"request": "appdetails", "appid": appid}, delay=delay)
    time.sleep(delay + random.uniform(0, 0.4))
    if not raw:
        return []
    try:
        data = json.loads(raw.decode("utf-8"))
        line = data.get("genre") or ""
    except ValueError:
        return []
    return [g.strip() for g in line.split(",") if g.strip()]


_GENRE_DB_CACHE = None
_GENRE_DB_DIRTY = False


def load_genre_db():
    """Общий словарь жанров из репозитория: {"570": ["Экшен", "Стратегия"]}."""
    global _GENRE_DB_CACHE
    if _GENRE_DB_CACHE is None:
        _GENRE_DB_CACHE = {}
        if os.path.exists(GENRE_DB):
            try:
                with open(GENRE_DB, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    _GENRE_DB_CACHE = {str(k): v for k, v in data.items() if v}
            except Exception:
                log("! %s не читается, начинаю словарь заново" % os.path.relpath(GENRE_DB, ROOT))
    return _GENRE_DB_CACHE


def save_genre_db():
    """Пишем словарь, только если он пополнился. Ключи по возрастанию и
    одна игра на строку — чтобы диффы в git читались глазами."""
    if not _GENRE_DB_DIRTY:
        return 0
    db = load_genre_db()
    os.makedirs(os.path.dirname(GENRE_DB), exist_ok=True)
    keys = sorted(db, key=lambda x: int(x) if x.isdigit() else 0)
    rows = ",\n".join('  "%s": %s' % (k, json.dumps(db[k], ensure_ascii=False)) for k in keys)
    with open(GENRE_DB, "w", encoding="utf-8") as f:
        f.write("{\n" + rows + "\n}\n")
    return len(keys)


def get_genres(appid, delay, force=False):
    """Жанры одной игры: словарь репозитория → локальный кэш → store → SteamSpy.
    Пустой результат НЕ сохраняется — следующий прогон попробует снова."""
    global _GENRE_DB_DIRTY
    key = str(appid)

    db = load_genre_db()
    if key in db and not force:
        return db[key]

    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, "%d.json" % appid)
    if os.path.exists(cache_path) and not force:
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                genres = json.load(f).get("genres")
            if genres:
                db[key] = genres
                _GENRE_DB_DIRTY = True
                return genres
        except Exception:
            pass

    genres = translate_genres(genres_from_store(appid, delay))
    if not genres:
        genres = translate_genres(genres_from_steamspy(appid, delay))

    if genres:
        db[key] = genres
        _GENRE_DB_DIRTY = True
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({"appid": appid, "genres": genres,
                       "cached_at": datetime.now(timezone.utc).strftime("%Y-%m-%d")}, f,
                      ensure_ascii=False)
    return genres


def download_avatar(url):
    if not url:
        return None
    os.makedirs(IMG_DIR, exist_ok=True)
    raw = http_get(url, binary=True)
    if not raw:
        return None
    path = os.path.join(IMG_DIR, "avatar.jpg")
    with open(path, "wb") as f:
        f.write(raw)
    return "assets/img/avatar.jpg"


# --------------------------------------------------------------------------
# сборка data.js
# --------------------------------------------------------------------------

def build_payload(summary, game_count, owned, recent, extras, args, avatar_path):
    recent_map = {g["appid"]: g.get("playtime_2weeks", 0) for g in recent}

    games, skipped = [], 0
    for g in owned:
        appid = g.get("appid")
        name = clean_name(g.get("name") or "App %s" % appid)
        if is_junk_game(appid, name):
            skipped += 1
            continue
        hours = round(g.get("playtime_forever", 0) / 60.0, 1)
        last = g.get("rtime_last_played") or 0
        games.append({
            "appid": appid,
            "name": name,
            "hours": int(hours) if hours >= 10 else hours,
            "hours2w": round(recent_map.get(appid, 0) / 60.0, 1),
            "lastPlayed": datetime.fromtimestamp(last, timezone.utc).strftime("%Y-%m-%d") if last else None,
            "genres": [],
        })

    # --- extra_games.json: то, что API не отдаёт (Dota 2 и прочие игноры магазина) ---
    if extras:
        have = {g["appid"] for g in games}
        for e in extras:
            dup = [g for g in games if g["appid"] == e["appid"]]
            if dup:
                # игра всё-таки пришла из API: часы там главнее, жанры добираем
                if not dup[0]["genres"]:
                    dup[0]["genres"] = e["genres"]
                continue
            games.append(dict(e))

    games.sort(key=lambda x: (-x["hours"], x["name"]))

    played = [g for g in games if g["hours"] > 0]
    backlog = [g for g in games if g["hours"] == 0]

    # --- жанры: все заигранные + часть бэклога (для «судьбы вечера») ---
    targets = played[:args.max_details]
    sample_backlog = backlog[:args.backlog_details]
    targets = targets + sample_backlog

    log("· тяну жанры для %d игр (кэш: %s)" % (len(targets), CACHE_DIR))
    if skipped:
        log("· отсечён служебный софт и тестовые ветки: %d" % skipped)
    for i, g in enumerate(targets, 1):
        if not g["genres"]:          # extra_games.json может нести жанры с собой
            g["genres"] = get_genres(g["appid"], args.delay, force=args.refresh_genres) or []
        if i % 10 == 0 or i == len(targets):
            log("    %d/%d" % (i, len(targets)))

    total_hours = round(sum(g["hours"] for g in played), 1)
    hours_2w = round(sum(g["hours2w"] for g in games), 1)

    # --- часы по жанрам для доната: часы игры делятся поровну между её жанрами ---
    gmap = {}
    for g in played:
        gs = g["genres"]
        if not gs:
            continue
        share = g["hours"] / len(gs)
        for name in gs:
            gmap[name] = gmap.get(name, 0) + share
    genre_hours = [{"name": k, "hours": (int(round(v)) if v >= 10 else round(v, 1))}
                   for k, v in gmap.items()]
    genre_hours.sort(key=lambda x: -x["hours"])

    # в страницу кладём не всё подряд: топ по часам + бэклог для рулетки
    keep = played[:args.keep_played] + backlog[:args.keep_backlog]
    keep_ids = {g["appid"] for g in keep}
    keep = [g for g in games if g["appid"] in keep_ids]

    soulmate = played[0]["appid"] if played else None

    return {
        "meta": {
            "persona": summary.get("personaname") or args.user or "steam profile",
            "profileUrl": summary.get("profileurl"),
            "avatar": avatar_path,
            "source": "steam-api",
            "generatedAt": datetime.now().strftime("%Y-%m-%d"),
            "memberSince": (datetime.fromtimestamp(summary["timecreated"], timezone.utc).strftime("%Y-%m-%d")
                            if summary.get("timecreated") else None),
        },
        "totals": {
            "gamesOwned": game_count,
            "hoursTotal": int(round(total_hours)),
            "hoursTwoWeeks": int(round(hours_2w)),
            "gamesPlayed": len(played),
            "gamesNeverPlayed": len(backlog),
        },
        "soulmateAppid": soulmate,
        "genreHours": genre_hours,
        "games": keep,
    }


def _num(v):
    """3.0 → 3, чтобы data.js не обрастал «.0»."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _one_line(d, indent=4):
    """Словарь одной строкой — компактный формат data.js."""
    d = {k: _num(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v
         for k, v in d.items()}
    return " " * indent + json.dumps(d, ensure_ascii=False)


def write_data_js(payload):
    """data.js: читаемый заголовок + компактные списки (одна игра на строку)."""
    meta = json.dumps({k: _num(v) if isinstance(v, (int, float)) else v
                       for k, v in payload["meta"].items()}, ensure_ascii=False)
    totals = json.dumps({k: _num(v) for k, v in payload["totals"].items()}, ensure_ascii=False)

    genre_rows = ",\n".join(_one_line(g) for g in payload["genreHours"])
    genre_block = ("\n  \"genreHours\": [\n" + genre_rows + "\n  ],\n") if payload["genreHours"] else ""

    game_rows = ",\n".join(_one_line(g) for g in payload["games"])

    text = (
        "/* =============================================================\n"
        "   STEAM WRAPPED — данные страницы\n"
        "   -------------------------------------------------------------\n"
        "   ФАЙЛ СГЕНЕРИРОВАН АВТОМАТИЧЕСКИ: python fetch_data.py\n"
        "   Правки руками перезапишутся при следующем запуске.\n"
        "   Дата сборки: %s\n"
        "   Образцовые данные лежат в data.sample.js\n"
        "   ============================================================= */\n\n"
        "window.STEAM_DATA = {\n"
        "  \"meta\": %s,\n\n"
        "  \"totals\": %s,\n\n"
        "  \"soulmateAppid\": %s,\n"
        "%s\n"
        "  \"games\": [\n%s\n  ]\n"
        "};\n"
    ) % (
        payload["meta"]["generatedAt"],
        meta, totals, json.dumps(payload["soulmateAppid"]),
        genre_block, game_rows,
    )

    # последняя контрольная проверка: содержимое должно парситься как JSON
    try:
        json.loads(text[text.index("{"):text.rindex("}") + 1])
    except ValueError as e:
        sys.exit("Собранный data.js не парсится (%s) — файл не записан" % e)

    if os.path.exists(OUT_FILE):
        with open(OUT_FILE, "r", encoding="utf-8") as f:
            old = f.read()
        with open(OUT_FILE + ".bak", "w", encoding="utf-8") as f:
            f.write(old)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(text)


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Собирает данные Steam-профиля в assets/js/data.js")
    ap.add_argument("--user", help="ник профиля (vanity URL) или ссылка на профиль")
    ap.add_argument("--steamid", help="SteamID64, если ник не резолвится")
    ap.add_argument("--key", help="ключ API вместо steam_key.txt")
    ap.add_argument("--delay", type=float, default=1.5, help="пауза между запросами к store, с (по умолчанию 1.5)")
    ap.add_argument("--max-details", type=int, default=120, help="для скольких заигранных игр тянуть жанры")
    ap.add_argument("--backlog-details", type=int, default=60, help="для скольких игр из бэклога тянуть жанры")
    ap.add_argument("--keep-played", type=int, default=60, help="сколько заигранных игр класть в data.js")
    ap.add_argument("--keep-backlog", type=int, default=80, help="сколько игр бэклога класть в data.js")
    ap.add_argument("--extra", default=EXTRA_FILE, help="путь к extra_games.json (0 = не подмешивать)")
    ap.add_argument("--refresh-genres", action="store_true", help="игнорировать кэш жанров")
    ap.add_argument("--dry-run", action="store_true", help="показать результат, но не писать data.js")
    args = ap.parse_args()

    if not args.user and not args.steamid:
        args.user = "K_Ak4d0"

    key = read_key(args.key)
    log("· ключ прочитан (…%s)" % key[-4:])

    steamid = args.steamid or resolve_steamid(key, args.user)
    log("· SteamID64: %s" % steamid)

    summary = get_summary(key, steamid)
    log("· профиль: %s" % (summary.get("personaname") or "?"))

    game_count, owned = get_owned(key, steamid)
    log("· игр в библиотеке: %d" % game_count)

    recent = get_recent(key, steamid)
    log("· игр за 2 недели: %d" % len(recent))

    extras = [] if args.extra in ("0", "") else load_extras(args.extra)
    if extras:
        log("· extra_games.json: +%d (%s)" % (len(extras), ", ".join(e["name"] for e in extras)))

    avatar_path = download_avatar(summary.get("avatarfull"))
    log("· аватар: %s" % (avatar_path or "не скачался, обойдёмся монограммой"))

    payload = build_payload(summary, game_count, owned, recent, extras, args, avatar_path)

    t = payload["totals"]
    log("")
    log("  ИТОГО")
    log("  игр:            %s" % t["gamesOwned"])
    log("  часов всего:    %s" % t["hoursTotal"])
    log("  часов за 2 нед: %s" % t["hoursTwoWeeks"])
    log("  не запускала:   %s" % t["gamesNeverPlayed"])
    if payload["games"]:
        top = payload["games"][0]
        log("  игра жизни:     %s — %s ч" % (top["name"], top["hours"]))
    log("")

    if args.dry_run:
        log("· dry-run: data.js не тронут")
        return

    write_data_js(payload)
    log("· записан %s" % os.path.relpath(OUT_FILE, ROOT))
    log("· готово. Открывай index.html или запусти: python -m http.server 8000")

    saved = save_genre_db()
    if saved:
        log("· словарь жанров: %d записей (%s)" % (saved, os.path.relpath(GENRE_DB, ROOT)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n· прервано")
