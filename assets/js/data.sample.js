/* =============================================================
   STEAM WRAPPED — данные страницы
   -------------------------------------------------------------
   Этот файл перезаписывается скриптом fetch_data.py.
   Сейчас здесь ОБРАЗЦОВЫЕ данные (реальные числа из профиля,
   остальное — правдоподобная заглушка), чтобы страница жила
   и без ключа Steam Web API.
   ============================================================= */

window.STEAM_DATA = {
  meta: {
    persona: "sample",
    profileUrl: "https://steamcommunity.com/id/sample",
    avatar: null,                 // fetch_data.py положит сюда assets/img/avatar.jpg
    source: "sample",             // "sample" | "steam-api"
    generatedAt: "2026-09-01",
    memberSince: null
  },

  totals: {
    gamesOwned: 263,
    hoursTotal: 3612,
    hoursTwoWeeks: 95,
    gamesPlayed: 118,
    gamesNeverPlayed: 145
  },

  // Главная игра жизни определяется автоматически (макс. часов),
  // но можно зафиксировать вручную через appid.
  soulmateAppid: 730,

  games: [
    { appid: 730,     name: "Counter-Strike 2",        hours: 2631, hours2w: 72, lastPlayed: "2026-08-31", genres: ["Экшен", "Шутер"] },
    { appid: 1091500, name: "Cyberpunk 2077",          hours: 85,   hours2w: 3,  lastPlayed: "2026-08-24", genres: ["RPG", "Экшен"] },
    { appid: 2868840, name: "Slay the Spire 2",        hours: 69,   hours2w: 8,  lastPlayed: "2026-08-30", genres: ["Стратегия", "Инди"] },
    { appid: 2379780, name: "Balatro",                 hours: 37,   hours2w: 12, lastPlayed: "2026-08-31", genres: ["Инди", "Стратегия"] },
    { appid: 1086940, name: "Baldur's Gate 3",         hours: 61,   hours2w: 0,  lastPlayed: "2026-06-12", genres: ["RPG", "Приключения"] },
    { appid: 413150,  name: "Stardew Valley",          hours: 54,   hours2w: 0,  lastPlayed: "2026-05-02", genres: ["Симулятор", "Инди"] },
    { appid: 105600,  name: "Terraria",                hours: 48,   hours2w: 0,  lastPlayed: "2026-03-18", genres: ["Приключения", "Инди"] },
    { appid: 1145360, name: "Hades",                   hours: 41,   hours2w: 0,  lastPlayed: "2026-04-27", genres: ["Экшен", "Инди"] },
    { appid: 550,     name: "Left 4 Dead 2",           hours: 33,   hours2w: 0,  lastPlayed: "2026-02-09", genres: ["Экшен", "Шутер"] },
    { appid: 292030,  name: "The Witcher 3",           hours: 31,   hours2w: 0,  lastPlayed: "2026-01-22", genres: ["RPG", "Приключения"] },
    { appid: 632470,  name: "Disco Elysium",           hours: 24,   hours2w: 0,  lastPlayed: "2025-12-30", genres: ["RPG", "Приключения"] },
    { appid: 620,     name: "Portal 2",                hours: 22,   hours2w: 0,  lastPlayed: "2025-11-14", genres: ["Головоломка", "Приключения"] },
    { appid: 1174180, name: "Red Dead Redemption 2",   hours: 29,   hours2w: 0,  lastPlayed: "2025-10-08", genres: ["Приключения", "Экшен"] },
    { appid: 236850,  name: "Europa Universalis IV",   hours: 18,   hours2w: 0,  lastPlayed: "2025-09-19", genres: ["Стратегия", "Симулятор"] },
    { appid: 322330,  name: "Don't Starve Together",   hours: 16,   hours2w: 0,  lastPlayed: "2025-08-11", genres: ["Выживание", "Инди"] },
    { appid: 367520,  name: "Hollow Knight",           hours: 14,   hours2w: 0,  lastPlayed: "2025-07-25", genres: ["Приключения", "Инди"] },
    { appid: 431960,  name: "Wallpaper Engine",        hours: 12,   hours2w: 0,  lastPlayed: "2026-08-20", genres: ["Утилиты"] },
    { appid: 275850,  name: "No Man's Sky",            hours: 11,   hours2w: 0,  lastPlayed: "2025-06-03", genres: ["Приключения", "Выживание"] },
    { appid: 250900,  name: "The Binding of Isaac",    hours: 9,    hours2w: 0,  lastPlayed: "2025-05-16", genres: ["Экшен", "Инди"] },
    { appid: 391540,  name: "Undertale",               hours: 7,    hours2w: 0,  lastPlayed: "2025-04-01", genres: ["RPG", "Инди"] },

    /* --- бэклог: куплено, но ни минуты не запущено --- */
    { appid: 1245620, name: "ELDEN RING",              hours: 0, hours2w: 0, lastPlayed: null, genres: ["RPG", "Экшен"] },
    { appid: 1517290, name: "Battlefield 2042",        hours: 0, hours2w: 0, lastPlayed: null, genres: ["Шутер", "Экшен"] },
    { appid: 1030300, name: "Hollow Knight: Silksong", hours: 0, hours2w: 0, lastPlayed: null, genres: ["Приключения", "Инди"] },
    { appid: 1593500, name: "God of War",              hours: 0, hours2w: 0, lastPlayed: null, genres: ["Экшен", "Приключения"] },
    { appid: 1817070, name: "Marvel's Spider-Man",     hours: 0, hours2w: 0, lastPlayed: null, genres: ["Экшен", "Приключения"] },
    { appid: 1237970, name: "Titanfall 2",             hours: 0, hours2w: 0, lastPlayed: null, genres: ["Шутер", "Экшен"] },
    { appid: 460950,  name: "Katana ZERO",             hours: 0, hours2w: 0, lastPlayed: null, genres: ["Экшен", "Инди"] },
    { appid: 646570,  name: "Slay the Spire",          hours: 0, hours2w: 0, lastPlayed: null, genres: ["Стратегия", "Инди"] },
    { appid: 1332010, name: "Stray",                   hours: 0, hours2w: 0, lastPlayed: null, genres: ["Приключения", "Инди"] },
    { appid: 1794680, name: "Vampire Survivors",       hours: 0, hours2w: 0, lastPlayed: null, genres: ["Экшен", "Инди"] },
    { appid: 648800,  name: "Raft",                    hours: 0, hours2w: 0, lastPlayed: null, genres: ["Выживание", "Инди"] },
    { appid: 1966720, name: "Lethal Company",          hours: 0, hours2w: 0, lastPlayed: null, genres: ["Выживание", "Инди"] },
    { appid: 1621690, name: "Sifu",                    hours: 0, hours2w: 0, lastPlayed: null, genres: ["Экшен"] },
    { appid: 1811260, name: "EA SPORTS FC",            hours: 0, hours2w: 0, lastPlayed: null, genres: ["Спорт", "Симулятор"] },
    { appid: 1888930, name: "The Last of Us Part I",   hours: 0, hours2w: 0, lastPlayed: null, genres: ["Приключения", "Экшен"] },
    { appid: 1091500 + 1, name: "Pentiment",           hours: 0, hours2w: 0, lastPlayed: null, genres: ["Приключения", "RPG"] },
    { appid: 1284190, name: "Chained Echoes",          hours: 0, hours2w: 0, lastPlayed: null, genres: ["RPG", "Инди"] },
    { appid: 1057090, name: "Ragnarock",               hours: 0, hours2w: 0, lastPlayed: null, genres: ["Ритм", "Инди"] },
    { appid: 1113560, name: "NieR Replicant",          hours: 0, hours2w: 0, lastPlayed: null, genres: ["RPG", "Экшен"] },
    { appid: 1868140, name: "DAVE THE DIVER",          hours: 0, hours2w: 0, lastPlayed: null, genres: ["Приключения", "Инди"] }
  ]
};
