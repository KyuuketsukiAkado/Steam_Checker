/* =============================================================
   STEAM WRAPPED — данные страницы
   -------------------------------------------------------------
   Реальные цифры профиля mormyszka (K_Ak4d0), собраны вручную
   2026-09-02. При следующем запуске fetch_data.py файл будет
   перезаписан данными из Steam Web API (Dota 2 подтянется из
   extra_games.json — магазин её не отдаёт).
   Формат: одна игра на строку.
   ============================================================= */

window.STEAM_DATA = {
  "meta": {
    "persona": "mormyszka",
    "profileUrl": "https://steamcommunity.com/id/K_Ak4d0/",
    "avatar": null,
    "source": "manual",
    "generatedAt": "2026-09-02",
    "memberSince": "2017-02-02"
  },

  "totals": {
    "gamesOwned": 324,
    "hoursTotal": 8057,
    "hoursTwoWeeks": 94,
    "gamesPlayed": 252,
    "gamesNeverPlayed": 68
  },

  "soulmateAppid": 570,

  /* часы по жанрам — как их отдаёт fetch_data.py (жанры карточек
     магазина, часы игры делятся поровну между её жанрами) */
  "genreHours": [
    { "name": "Экшен",        "hours": 3307 },
    { "name": "RPG",          "hours": 352 },
    { "name": "Приключения",  "hours": 345 },
    { "name": "Инди",         "hours": 261 },
    { "name": "Гонки",        "hours": 213 },
    { "name": "Казуальные",   "hours": 127 },
    { "name": "Стратегия",    "hours": 38 },
    { "name": "Симулятор",    "hours": 32 },
    { "name": "MMO",          "hours": 22 }
  ],

  "games": [
    { "appid": 570,     "name": "Dota 2",             "hours": 2848.8, "hours2w": 0,    "lastPlayed": null, "genres": ["Экшен", "Стратегия"] },
    { "appid": 730,     "name": "Counter-Strike 2",   "hours": 2631,   "hours2w": 7,    "lastPlayed": null, "genres": ["Экшен"] },
    { "appid": 413150,  "name": "Stardew Valley",     "hours": 313,    "hours2w": 0,    "lastPlayed": null, "genres": ["Инди", "RPG"] },
    { "appid": 359550,  "name": "Rainbow Six Siege",  "hours": 179,    "hours2w": 0,    "lastPlayed": null, "genres": ["Экшен"] },
    { "appid": 1293830, "name": "Forza Horizon 4",    "hours": 151,    "hours2w": 0,    "lastPlayed": null, "genres": ["Гонки"] },
    { "appid": 238960,  "name": "Path of Exile",      "hours": 99,     "hours2w": 0,    "lastPlayed": null, "genres": ["Экшен", "Приключения"] },
    { "appid": 1091500, "name": "Cyberpunk 2077",     "hours": 85,     "hours2w": 0,    "lastPlayed": null, "genres": ["RPG", "Экшен"] },
    { "appid": 310780,  "name": "Mortal Kombat X",    "hours": 83,     "hours2w": 0,    "lastPlayed": null, "genres": ["Экшен"] },
    { "appid": 489830,  "name": "Skyrim",             "hours": 64,     "hours2w": 0,    "lastPlayed": null, "genres": ["RPG"] },
    { "appid": 2868840, "name": "Slay the Spire 2",   "hours": 69.4,   "hours2w": 69.2, "lastPlayed": null, "genres": ["Инди", "Стратегия"] },
    { "appid": 2379780, "name": "Balatro",            "hours": 18.2,   "hours2w": 18.2, "lastPlayed": null, "genres": ["Инди", "Стратегия"] },
    { "appid": 239030,  "name": "Papers, Please",     "hours": 0.1,    "hours2w": 0.1,  "lastPlayed": null, "genres": ["Инди", "Стратегия"] }
  ]
};
