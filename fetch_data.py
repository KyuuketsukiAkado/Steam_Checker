#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_data.py — тянет статистику Steam-профиля и вшивает её в страницу.

Чистый Python 3.8+, никаких зависимостей.

Что делает:
  1. читает ключ из steam_key.txt (файл в .gitignore, в репо не попадает);
  2. резолвит ник (vanity URL) в SteamID64;
  3. забирает профиль, библиотеку и активность за 2 недели через Steam Web API;
  4. добирает жанры из неофициального store-эндпоинта appdetails —
     вежливо: с паузами, ретраями и файловым кэшем в .cache/;
  5. качает аватар в assets/img/;
  6. перезаписывает assets/js/data.js — страница сразу оживает.

Запуск:
    python3 fetch_data.py --user repro4chful
    python3 fetch_data.py --steamid 76561198000000000
    python3 fetch_data.py --user repro4chful --max-details 150 --delay 1.5

Если что-то пойдёт не так, старый data.js сохранится рядом как data.js.bak,
а образцовые данные всегда лежат в assets/js/data.sample.js.
"""

import argparse
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
OUT_FILE = os.path.join(ROOT, "assets", "js", "data.js")
IMG_DIR = os.path.join(ROOT, "assets", "img")
CACHE_DIR = os.path.join(ROOT, ".cache", "appdetails")

API = "https://api.steampowered.com"
STORE = "https://store.steampowered.com/api/appdetails"
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

# служебный софт, который только портит статистику по жанрам
SKIP_APPIDS = {
    250820,   # SteamVR
    323910,   # SteamVR Performance Test
    228980,   # Steamworks Common Redistributables
    365670,   # Blender (иногда числится как игра)
}


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


def get_genres(appid, delay, force=False):
    """Жанры одной игры. Сначала кэш, потом сеть. None = не удалось."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, "%d.json" % appid)

    if os.path.exists(cache_path) and not force:
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f).get("genres")
        except Exception:
            pass

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

    genres = [GENRE_RU.get(g, g) for g in genres]
    # выкидываем дубли, сохраняя порядок, оставляем максимум 2 жанра
    seen, clean = set(), []
    for g in genres:
        if g not in seen:
            seen.add(g)
            clean.append(g)
    clean = clean[:2]

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"appid": appid, "genres": clean,
                   "cached_at": datetime.now(timezone.utc).strftime("%Y-%m-%d")}, f, ensure_ascii=False)
    return clean


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

def build_payload(summary, game_count, owned, recent, args, avatar_path):
    recent_map = {g["appid"]: g.get("playtime_2weeks", 0) for g in recent}

    games = []
    for g in owned:
        appid = g.get("appid")
        if appid in SKIP_APPIDS:
            continue
        hours = round(g.get("playtime_forever", 0) / 60.0, 1)
        last = g.get("rtime_last_played") or 0
        games.append({
            "appid": appid,
            "name": (g.get("name") or "App %s" % appid).strip(),
            "hours": int(hours) if hours >= 10 else hours,
            "hours2w": round(recent_map.get(appid, 0) / 60.0, 1),
            "lastPlayed": datetime.fromtimestamp(last, timezone.utc).strftime("%Y-%m-%d") if last else None,
            "genres": [],
        })

    games.sort(key=lambda x: (-x["hours"], x["name"]))

    played = [g for g in games if g["hours"] > 0]
    backlog = [g for g in games if g["hours"] == 0]

    # --- жанры: все заигранные + часть бэклога (для «судьбы вечера») ---
    targets = played[:args.max_details]
    sample_backlog = backlog[:args.backlog_details]
    targets = targets + sample_backlog

    log("· тяну жанры для %d игр (кэш: %s)" % (len(targets), CACHE_DIR))
    for i, g in enumerate(targets, 1):
        genres = get_genres(g["appid"], args.delay, force=args.refresh_genres)
        g["genres"] = genres or []
        if i % 10 == 0 or i == len(targets):
            log("    %d/%d" % (i, len(targets)))

    total_hours = round(sum(g["hours"] for g in played), 1)
    hours_2w = round(sum(g["hours2w"] for g in games), 1)

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
        "games": keep,
    }


def write_data_js(payload):
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    body = re.sub(r"\n\s+", lambda m: m.group(0), body)  # оставляем как есть, просто читаемо
    text = (
        "/* =============================================================\n"
        "   STEAM WRAPPED — данные страницы\n"
        "   -------------------------------------------------------------\n"
        "   ФАЙЛ СГЕНЕРИРОВАН АВТОМАТИЧЕСКИ: python3 fetch_data.py\n"
        "   Правки руками перезапишутся при следующем запуске.\n"
        "   Дата сборки: %s\n"
        "   Образцовые данные лежат в data.sample.js\n"
        "   ============================================================= */\n\n"
        "window.STEAM_DATA = %s;\n"
    ) % (payload["meta"]["generatedAt"], body)

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
    ap.add_argument("--refresh-genres", action="store_true", help="игнорировать кэш жанров")
    ap.add_argument("--dry-run", action="store_true", help="показать результат, но не писать data.js")
    args = ap.parse_args()

    if not args.user and not args.steamid:
        args.user = "repro4chful"

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

    avatar_path = download_avatar(summary.get("avatarfull"))
    log("· аватар: %s" % (avatar_path or "не скачался, обойдёмся монограммой"))

    payload = build_payload(summary, game_count, owned, recent, args, avatar_path)

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
    log("· готово. Открывай index.html или запусти: python3 -m http.server 8000")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n· прервано")
