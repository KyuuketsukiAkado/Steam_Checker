#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Офлайн-проверка fetch_data.py: подменяем сеть моками и смотрим,
что data.js собирается корректно. Ключ и интернет не нужны.

    python3 tools/selftest.py
"""
import json, os, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import fetch_data as F

OWNED = [
    {"appid": 730,     "name": "Counter-Strike 2",   "playtime_forever": 157860, "rtime_last_played": 1756600000},
    {"appid": 1091500, "name": "Cyberpunk 2077",     "playtime_forever": 5100,   "rtime_last_played": 1756000000},
    {"appid": 2868840, "name": "Slay the Spire 2",   "playtime_forever": 4140,   "rtime_last_played": 1756500000},
    {"appid": 2379780, "name": "Balatro",            "playtime_forever": 2220,   "rtime_last_played": 1756600000},
    {"appid": 1245620, "name": "ELDEN RING",         "playtime_forever": 0,      "rtime_last_played": 0},
    {"appid": 1030300, "name": "Silksong",           "playtime_forever": 0,      "rtime_last_played": 0},
    {"appid": 250820,  "name": "SteamVR",            "playtime_forever": 12,     "rtime_last_played": 1700000000},
]
RECENT = [
    {"appid": 730,     "playtime_2weeks": 4320},
    {"appid": 2379780, "playtime_2weeks": 720},
]
GENRES = {
    730: ["Action", "Free To Play"], 1091500: ["RPG", "Action"],
    2868840: ["Strategy", "Indie"],  2379780: ["Indie", "Strategy"],
    1245620: ["Action", "RPG"],      1030300: ["Adventure", "Indie"],
}

def fake_get(url, params=None, retries=4, timeout=25, delay=1.0, binary=False):
    if "appdetails" in url:
        appid = int(params["appids"])
        return json.dumps({str(appid): {"success": True, "data": {
            "genres": [{"description": g} for g in GENRES.get(appid, [])]}}}).encode()
    if "avatar" in url or url.endswith(".jpg"):
        return b"\xff\xd8\xff\xe0fake-jpeg"
    if "ResolveVanityURL" in url:
        return json.dumps({"response": {"success": 1, "steamid": "76561198000000000"}}).encode()
    if "GetPlayerSummaries" in url:
        return json.dumps({"response": {"players": [{
            "personaname": "repro4chful", "profileurl": "https://steamcommunity.com/id/repro4chful/",
            "avatarfull": "https://avatars.steamstatic.com/fake_full.jpg", "timecreated": 1500000000}]}}).encode()
    if "GetOwnedGames" in url:
        return json.dumps({"response": {"game_count": 263, "games": OWNED}}).encode()
    if "GetRecentlyPlayedGames" in url:
        return json.dumps({"response": {"games": RECENT}}).encode()
    raise AssertionError("неожиданный запрос: " + url)

F.http_get = fake_get
F.CACHE_DIR = os.path.join(ROOT, ".cache", "selftest")
F.OUT_FILE = os.path.join(ROOT, ".cache", "data.test.js")
F.IMG_DIR = os.path.join(ROOT, ".cache")
F.time.sleep = lambda *_: None

sys.argv = ["fetch_data.py", "--user", "repro4chful", "--key", "0" * 32, "--delay", "0"]
F.main()

out = open(F.OUT_FILE, encoding="utf-8").read()
assert out.startswith("/*") and "window.STEAM_DATA" in out, "формат файла сломан"
payload = json.loads(out[out.index("{"):out.rindex("}") + 1])

t = payload["totals"]
assert t["gamesOwned"] == 263, t
assert t["hoursTotal"] == 2631 + 85 + 69 + 37, t
assert t["hoursTwoWeeks"] == 84, t
assert t["gamesNeverPlayed"] == 2, t
assert payload["soulmateAppid"] == 730
assert payload["meta"]["source"] == "steam-api"
assert payload["meta"]["avatar"] == "assets/img/avatar.jpg"
names = [g["name"] for g in payload["games"]]
assert "SteamVR" not in names, "служебный софт должен отсекаться"
assert payload["games"][0]["genres"] == ["Экшен", "Free to Play"], payload["games"][0]
assert payload["games"][0]["hours2w"] == 72.0

# второй прогон должен взять жанры из кэша
calls = {"n": 0}
def counting(url, params=None, **kw):
    if "appdetails" in url:
        calls["n"] += 1
    return fake_get(url, params, **kw)
F.http_get = counting
F.main()
assert calls["n"] == 0, "кэш жанров не сработал: %d запросов" % calls["n"]

print("\n✓ selftest пройден: data.js собирается, кэш работает, служебный софт отсекается")
