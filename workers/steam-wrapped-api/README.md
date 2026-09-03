# Steam Wrapped API Worker

Код подготовлен, но **ещё не развёрнут** и не подключён к странице. Секрета
Steam в этой папке нет.

## Что делает Worker

Worker не считает статистику и не принимает дизайнерских решений. Его задача:

1. принять только SteamID64, vanity-ник или обычную ссылку Steam Community;
2. запросить `ResolveVanityURL` (при необходимости), `GetPlayerSummaries`,
   `GetOwnedGames` и `GetRecentlyPlayedGames`;
3. вернуть эти ответы в сыром JSON;
4. по отдельному запросу вернуть сырой жанр SteamSpy для строго заданных AppID.

Перевод жанров, фильтрация служебного ПО, «игра жизни», числа и интерфейс
остаются в браузере: `assets/js/profile-data.js` + `assets/data/rules.json`.

## Маршруты

| Метод и маршрут | Назначение |
|---|---|
| `GET /health` | Проверка, что Worker опубликован. Ключ Steam не нужен. |
| `GET /v1/profile?profile=<SteamID64-or-vanity-or-Steam-URL>` | Профиль: три сырых ответа Steam Web API. |
| `POST /v1/genres` с `{"appids":[570,730]}` | До 8 AppID: сырые строки жанров SteamSpy. |

Пример будущей ручной проверки после деплоя — без ключа в адресе:

```text
https://steam-wrapped-api.<account>.workers.dev/v1/profile?profile=76561198000000000
```

## Защита и лимиты

- Браузерный CORS разрешён только для `https://kyuuketsukiakado.github.io`.
  Это не считается самостоятельной защитой: Worker также валидирует ввод и
  ограничивает запросы на сервере.
- На IP действует лимит **30 условных запросов в час**. Пакет жанров весит
  дороже одного запроса профиля.
- До обращения к Steam резервируется общий бюджет: по умолчанию **900 внешних
  Steam/SteamSpy-запросов в сутки**. Кэшированный профиль бюджет не расходует.
- `API_ENABLED=false` отключает живой API, оставляя статичный сайт доступным.
- IP в Durable Object хешируется; Worker не пишет `console.log` и не логирует
  URL Steam API, где лежит ключ.
- Профиль кэшируется на 24 часа, vanity-резолв — на час, жанры — на 30 дней.

## Cloudflare bindings

| Тип | Имя | Зачем |
|---|---|---|
| Secret | `STEAM_API_KEY` | Единственное место для API-ключа Steam. |
| KV namespace | `STEAM_CACHE` | Кэш профилей, vanity и жанров. |
| Durable Object | `RATE_LIMITER` | Строгий IP-лимит и общий дневной бюджет. |
| Variable | `API_ENABLED` | Аварийно включает/выключает API. |
| Variable | `DAILY_STEAM_CALL_LIMIT` | Дневной бюджет, по умолчанию `900`. |

`wrangler.jsonc` намеренно содержит заглушку KV ID. Перед командным деплоем её
нужно заменить ID созданного KV namespace. При деплое через Cloudflare Dashboard
те же binding-и добавляются через интерфейс; порядок кликов будет дан отдельно,
когда дойдём до настройки аккаунта.

## Локальная проверка кода

```bash
node test/worker.test.mjs
```

Тест не идёт в сеть и не требует ключа. Файл `.dev.vars`, если он понадобится
для локального запуска Wrangler, уже находится в `.gitignore`.
