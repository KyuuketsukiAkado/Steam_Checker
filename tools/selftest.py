#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Офлайн-проверка fetch_data.py: подменяем сеть моками и смотрим,
что data.js собирается корректно. Ключ и интернет не нужны.

    python tools/selftest.py      (Windows)
    python3 tools/selftest.py     (macOS/Linux)

Проверяется:
  * фолбэк жанров на SteamSpy, когда store молчит (возрастной гейт);
  * пустые результаты НЕ кэшируются (второй прогон повторяет попытку);
  * непустые — кэшируются (второй прогон без запросов);
  * «Free to Play», «Ранний доступ», «18+», «Утилиты» выкидываются из жанров;
  * служебный софт (Wallpaper Engine, ShareX, Jackbox Megapicker)
    и тестовые ветки (test/dedicated server, beta, sdk, benchmark) отсекаются;
  * названия чистятся от ™ и «Complete/Enhanced Edition»;
  * extra_games.json подмешивается (Dota 2 становится игрой жизни);
  * часы по жанрам (genreHours) считаются с делением между жанрами игры;
  * data.js компактный: одна игра на строку, и парсится как JSON;
  * общие правила действительно читаются из assets/data/rules.json;
  * ник с «</script>» безопасно экранируется в генерируемом data.js.
"""
import glob
import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import fetch_data as F

# ---------------------------------------------------------------- моки сети

OWNED = [
    {"appid": 730,     "name": "Counter-Strike 2",                          "playtime_forever": 157860, "rtime_last_played": 1756600000},
    {"appid": 1091500, "name": "Cyberpunk 2077",                            "playtime_forever": 5100,   "rtime_last_played": 1756000000},
    {"appid": 2868840, "name": "Slay the Spire 2",                          "playtime_forever": 4164,   "rtime_last_played": 1756500000},
    {"appid": 2379780, "name": "Balatro",                                   "playtime_forever": 2220,   "rtime_last_played": 1756600000},
    {"appid": 292030,  "name": "The Witcher 3: Wild Hunt - Complete Edition™", "playtime_forever": 120,  "rtime_last_played": 1700000000},
    # служебный софт и тестовые ветки — всё это должно отсекаться
    {"appid": 431960,  "name": "Wallpaper Engine",                          "playtime_forever": 98000,  "rtime_last_played": 1756000000},
    {"appid": 999001,  "name": "ShareX",                                    "playtime_forever": 500,    "rtime_last_played": 1756000000},
    {"appid": 999002,  "name": "Jackbox Megapicker",                        "playtime_forever": 300,    "rtime_last_played": 1756000000},
    {"appid": 240,     "name": "Counter-Strike: Source Dedicated Server",   "playtime_forever": 240,    "rtime_last_played": 0},
    {"appid": 999003,  "name": "Portal 2 Authoring Tools (Beta)",           "playtime_forever": 60,     "rtime_last_played": 0},
    {"appid": 999004,  "name": "Some Game SDK Benchmark",                   "playtime_forever": 60,     "rtime_last_played": 0},
    # бэклог: жанры добыть не выйдет — и это не должно кэшироваться
    {"appid": 1245620, "name": "ELDEN RING",         "playtime_forever": 0, "rtime_last_played": 0},
    {"appid": 1030300, "name": "Hollow Knight: Silksong", "playtime_forever": 0, "rtime_last_played": 0},
]
RECENT = [
    {"appid": 730,     "playtime_2weeks": 420},
    {"appid": 2868840, "playtime_2weeks": 4152},
]

# store молчит для 1091500, 1245620, 1030300 (возрастной гейт / прочее)
STORE_SILENT = {1091500, 1245620, 1030300}
STEAMSPY_SILENT = {1245620, 1030300}

GENRES_STORE = {
    730:     ["Action", "Free To Play"],           # метка магазина — долой
    2868840: ["Strategy", "Indie", "Early Access"],  # и эта тоже
    2379780: ["Indie", "Strategy"],
    292030:  ["RPG", "Adventure"],
}
GENRES_SPY = {
    1091500: "RPG, Action, Nudity",                # 18+ — не жанр
}


def fake_get(url, params=None, retries=4, timeout=25, delay=1.0, binary=False):
    if "appdetails" in url and "steamspy" not in url:
        appid = int(params["appids"])
        if appid in STORE_SILENT:
            return json.dumps({str(appid): {"success": False}}).encode()
        genres = GENRES_STORE.get(appid, [])
        return json.dumps({str(appid): {"success": True, "data": {
            "genres": [{"description": g} for g in genres]}}}).encode()
    if "steamspy" in url:
        appid = int(params["appid"])
        if appid in STEAMSPY_SILENT:
            return None                            # совсем никак
        return json.dumps({"genre": GENRES_SPY[appid]}).encode()
    if "avatar" in url or url.endswith(".jpg"):
        return b"\xff\xd8\xff\xe0fake-jpeg"
    if "ResolveVanityURL" in url:
        return json.dumps({"response": {"success": 1, "steamid": "76561198000000000"}}).encode()
    if "GetPlayerSummaries" in url:
        return json.dumps({"response": {"players": [{
            "personaname": "mormyszka", "profileurl": "https://steamcommunity.com/id/K_Ak4d0/",
            "avatarfull": "https://avatars.steamstatic.com/fake_full.jpg",
            "timecreated": 1485993600}]}}).encode()   # 2017-02-02
    if "GetOwnedGames" in url:
        return json.dumps({"response": {"game_count": 324, "games": OWNED}}).encode()
    if "GetRecentlyPlayedGames" in url:
        return json.dumps({"response": {"games": RECENT}}).encode()
    raise AssertionError("неожиданный запрос: " + url)


# ---------------------------------------------------------------- стенд

WORK = os.path.join(ROOT, ".cache", "selftest")
shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(WORK, exist_ok=True)

F.http_get = fake_get
F.CACHE_DIR = os.path.join(WORK, "appdetails")
F.OUT_FILE = os.path.join(WORK, "data.test.js")
F.IMG_DIR = WORK
F.time.sleep = lambda *_: None

# словарь жанров из репозитория здесь не нужен: тест проверяет, что
# store и SteamSpy-фолбэк работают, а готовые ответы это бы скрыли
F.GENRE_DB = os.path.join(WORK, "genres.json")
F._GENRE_DB_CACHE = {}
F._GENRE_DB_DIRTY = False

EXTRA_TMP = os.path.join(WORK, "extra_games.json")
with open(EXTRA_TMP, "w", encoding="utf-8") as f:
    json.dump([{"appid": 570, "name": "Dota 2™", "hours": 2848.8, "hours2w": 0,
                "lastPlayed": None, "genres": ["Экшен", "Стратегия"]}], f, ensure_ascii=False)

sys.argv = ["fetch_data.py", "--user", "K_Ak4d0", "--key", "0" * 32,
            "--delay", "0", "--extra", EXTRA_TMP]

# ---------------------------------------------------------------- прогон 1

F.main()

out = open(F.OUT_FILE, encoding="utf-8").read()
assert out.startswith("/*") and "window.STEAM_DATA" in out, "формат файла сломан"
payload = json.loads(out[out.index("{"):out.rindex("}") + 1])

# Единый rules.json подхватился Python-частью, а не остался файлом «для вида».
assert 431960 in F.SKIP_APPIDS and F.GENRE_RU["Action"] == "Экшен"

# Steam-имя не должно иметь шанса закрыть подключаемый <script> data.js.
unsafe = F.json_for_script({"persona": "</script><img src=x onerror=alert(1)>"})
assert "</script" not in unsafe.lower(), unsafe
assert json.loads(unsafe)["persona"].startswith("</script>"), unsafe

# мета и итоги
assert payload["meta"]["source"] == "steam-api"
assert payload["meta"]["memberSince"] == "2017-02-02", payload["meta"]
assert payload["meta"]["avatar"] == "assets/img/avatar.jpg"
assert os.path.exists(os.path.join(WORK, "avatar.jpg")), "аватар не записан"
assert payload["meta"]["persona"] == "mormyszka"

t = payload["totals"]
assert t["gamesOwned"] == 324, t
assert t["hoursTotal"] == 5673, t                       # 2631+85+69.4+37+2+2848.8
assert t["hoursTwoWeeks"] == 76, t                      # 7 + 69.2
assert t["gamesNeverPlayed"] == 2, t

# extra_games.json: Dota подмешана и стала игрой жизни
assert payload["soulmateAppid"] == 570
games = {g["name"]: g for g in payload["games"]}
dota = games["Dota 2"]                                  # ™ из названия исчезла
assert dota["hours"] == 2848.8 and dota["genres"] == ["Экшен", "Стратегия"]

# служебный софт и тестовые ветки отсечены
for bad in ["Wallpaper Engine", "ShareX", "Jackbox Megapicker",
            "Counter-Strike: Source Dedicated Server",
            "Portal 2 Authoring Tools (Beta)", "Some Game SDK Benchmark"]:
    assert bad not in games, "мусор не отсечён: " + bad

# жанры: метки магазина выкинуты, фолбэк на SteamSpy сработал
assert games["Counter-Strike 2"]["genres"] == ["Экшен"], games["Counter-Strike 2"]
assert games["Slay the Spire 2"]["genres"] == ["Стратегия", "Инди"]
assert games["Cyberpunk 2077"]["genres"] == ["RPG", "Экшен"], "SteamSpy-фолбэк не сработал"

# названия почищены
assert "The Witcher 3: Wild Hunt" in games, "суффикс Complete Edition не отрезан"

# часы по жанрам: делятся поровну между жанрами игры
gh = {g["name"]: g["hours"] for g in payload["genreHours"]}
assert "Free to Play" not in gh and "Ранний доступ" not in gh and "18+" not in gh
assert gh["Экшен"] == 4098, gh                          # 2848.8/2 + 2631 + 85/2
assert gh["Стратегия"] == 1477, gh                      # + доля Dota и балатро-со-спайром
assert gh["Инди"] == 53 and gh["RPG"] == 44, gh
assert payload["genreHours"][0]["name"] == "Экшен", "жанры не отсортированы"

# компактный формат: одна игра на строку
lines = [l for l in out.splitlines() if l.strip().startswith('{"appid"')]
assert len(lines) == len(payload["games"]), "игры не по одной на строку"
assert ".0," not in out and ".0}" not in out, "хвосты .0 не убраны"

# кэш: непустые жанры записаны, пустые — нет
cached = {os.path.basename(p) for p in glob.glob(os.path.join(F.CACHE_DIR, "*.json"))}
assert "730.json" in cached and "1091500.json" in cached, cached
assert "1245620.json" not in cached and "1030300.json" not in cached, \
    "пустой результат закэширован — так он уже не переспросит"

# ---------------------------------------------------------------- прогон 2

calls = {"store": [], "spy": []}


def counting(url, params=None, **kw):
    if "appdetails" in url and "steamspy" not in url:
        calls["store"].append(int(params["appids"]))
    if "steamspy" in url:
        calls["spy"].append(int(params["appid"]))
    return fake_get(url, params, **kw)


F.http_get = counting
F.main()

# заджойненные жанры — из кэша; по двум бэклог-играм попытка повторена
assert calls["store"] == [1245620, 1030300], calls["store"]
assert calls["spy"] == [1245620, 1030300], calls["spy"]

print()
print("✓ selftest пройден: SteamSpy-фолбэк, кэш, фильтры, extra_games,")
print("  чистка жанров и названий, genreHours, компактный data.js")
