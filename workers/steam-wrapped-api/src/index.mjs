/* =========================================================
   Steam Wrapped API — Cloudflare Worker

   Worker deliberately does not clean games, calculate totals or choose
   "soulmate" facts. It only:
     1. validates a SteamID64 / vanity name / standard Steam profile URL;
     2. proxies three fixed Steam Web API endpoints;
     3. obtains raw SteamSpy genres for explicit AppIDs and caches responses.

   All presentation rules belong to assets/data/rules.json and run in the
   browser. Never log request URLs: Steam Web API key is a query parameter.
   ========================================================= */

const API_ORIGIN = "https://api.steampowered.com";
const STEAMSPY_ORIGIN = "https://steamspy.com/api.php";
const DEFAULT_ALLOWED_ORIGIN = "https://kyuuketsukiakado.github.io";
const PROFILE_TTL_SECONDS = 24 * 60 * 60;
const VANITY_TTL_SECONDS = 60 * 60;
const GENRE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_GENRE_APPIDS = 8;
const IP_REQUEST_LIMIT = 30;
const IP_WINDOW_SECONDS = 60 * 60;
const DEFAULT_DAILY_STEAM_CALL_LIMIT = 900;

function json(body, status, request, extraHeaders) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...corsHeaders(request)
  });
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  }
  return new Response(JSON.stringify(body), { status: status || 200, headers });
}

function error(code, status, request, extra) {
  return json({ error: { code, ...(extra || {}) } }, status, request);
}

function allowedOrigin(request) {
  return request.headers.get("Origin") || "";
}

function corsHeaders(request) {
  const origin = allowedOrigin(request);
  // CORS is intentionally strict for browser calls. Direct navigation to the
  // endpoint sends no Origin and remains possible for the first manual check.
  if (origin !== DEFAULT_ALLOWED_ORIGIN) return { "vary": "Origin" };
  return {
    "access-control-allow-origin": DEFAULT_ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

function originIsAllowed(request) {
  const origin = allowedOrigin(request);
  return !origin || origin === DEFAULT_ALLOWED_ORIGIN;
}

function text(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength || 400);
}

/**
 * Only three public input forms are accepted. Parsing exists in the browser
 * too for UX, but it is repeated at this boundary on purpose: CORS is not an
 * authorization mechanism and clients can bypass JavaScript.
 */
export function parseProfileInput(value) {
  const input = text(value, 400);
  if (/^\d{17}$/.test(input)) return { kind: "steamid", value: input };
  // Числовой ввод — только SteamID64. Иначе опечатка в одной цифре могла бы
  // уйти в ResolveVanityURL как бессмысленный «ник».
  if (/^\d+$/.test(input)) return null;
  if (/^[A-Za-z0-9_-]{2,64}$/.test(input)) return { kind: "vanity", value: input };

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if ((url.protocol !== "https:" && url.protocol !== "http:") ||
        (host !== "steamcommunity.com" && host !== "www.steamcommunity.com")) return null;

    const profile = /^\/profiles\/(\d{17})\/?$/.exec(url.pathname);
    if (profile) return { kind: "steamid", value: profile[1] };

    const vanity = /^\/id\/([A-Za-z0-9_-]{2,64})\/?$/.exec(url.pathname);
    if (vanity) return { kind: "vanity", value: vanity[1] };
  } catch (_) {
    // Invalid URL: falls through to the same generic input error.
  }
  return null;
}

export function parseAppids(value) {
  if (!Array.isArray(value)) return null;
  const appids = [];
  const seen = new Set();
  for (const raw of value) {
    const id = String(raw || "");
    // Steam AppIDs are positive decimal integers. Hard cap prevents strange
    // giant identifiers from becoming cache keys or upstream requests.
    if (!/^[1-9]\d{0,9}$/.test(id)) return null;
    if (!seen.has(id)) {
      seen.add(id);
      appids.push(id);
    }
  }
  if (!appids.length || appids.length > MAX_GENRE_APPIDS) return null;
  return appids;
}

function enabled(env) {
  return String(env.API_ENABLED || "true").toLowerCase() !== "false";
}

function dailyLimit(env) {
  const number = Number(env.DAILY_STEAM_CALL_LIMIT || DEFAULT_DAILY_STEAM_CALL_LIMIT);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : DEFAULT_DAILY_STEAM_CALL_LIMIT;
}

function responseBody(payload) {
  return payload && typeof payload === "object" && payload.response && typeof payload.response === "object"
    ? payload.response : {};
}

async function readCache(env, key) {
  const value = await env.STEAM_CACHE.get(key, "json");
  return value && typeof value === "object" ? value : null;
}

async function writeCache(env, key, value, ttl) {
  await env.STEAM_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

class UpstreamError extends Error {}

async function steamJson(path, key, params) {
  const url = new URL(path, API_ORIGIN);
  url.searchParams.set("key", key);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, String(value)));

  // Do not add console logging here or in callers: url contains the secret.
  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (_) {
    throw new UpstreamError();
  }
  if (!response.ok) throw new UpstreamError();
  try {
    return await response.json();
  } catch (_) {
    throw new UpstreamError();
  }
}

async function steamSpyGenre(appid) {
  const url = new URL(STEAMSPY_ORIGIN);
  url.searchParams.set("request", "appdetails");
  url.searchParams.set("appid", appid);

  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (_) {
    throw new UpstreamError();
  }
  if (!response.ok) throw new UpstreamError();
  try {
    const data = await response.json();
    return typeof data.genre === "string" ? data.genre : "";
  } catch (_) {
    throw new UpstreamError();
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function hashIp(ip) {
  const bytes = new TextEncoder().encode(ip || "unknown");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeBucket(env, instanceName, bucket, limit, windowSeconds, amount) {
  const id = env.RATE_LIMITER.idFromName(instanceName);
  const stub = env.RATE_LIMITER.get(id);
  const response = await stub.fetch("https://rate-limit.internal/consume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket, limit, windowSeconds, amount })
  });
  return response.json();
}

/**
 * Real counters need serializable storage. KV is deliberately not used here:
 * its eventual consistency is good for cache, but not for enforcing a quota.
 */
export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    let input;
    try {
      input = await request.json();
    } catch (_) {
      return new Response("bad request", { status: 400 });
    }

    const limit = Math.max(1, Math.floor(Number(input.limit) || 0));
    const windowSeconds = Math.max(1, Math.floor(Number(input.windowSeconds) || 0));
    const amount = Math.max(1, Math.floor(Number(input.amount) || 0));
    const bucket = text(input.bucket, 80);
    if (!bucket) return new Response("bad request", { status: 400 });

    const now = Date.now();
    const stored = await this.state.storage.get(bucket);
    const current = stored && typeof stored === "object" && stored.resetAt > now
      ? stored : { used: 0, resetAt: now + windowSeconds * 1000 };

    if (current.used + amount > limit) {
      return Response.json({ allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) });
    }

    current.used += amount;
    await this.state.storage.put(bucket, current);
    return Response.json({ allowed: true, remaining: Math.max(0, limit - current.used) });
  }
}

async function allowRequest(env, request, amount) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const opaqueIp = await hashIp(ip);
  const byIp = await consumeBucket(env, "ip:" + opaqueIp, "hour", IP_REQUEST_LIMIT, IP_WINDOW_SECONDS, amount || 1);
  if (!byIp.allowed) return { allowed: false, code: "rate_limit_reached", retryAfter: byIp.retryAfter };
  return { allowed: true };
}

async function reserveSteamBudget(env, calls) {
  const day = new Date().toISOString().slice(0, 10);
  const result = await consumeBucket(
    env,
    "global-steam-budget",
    "steam-calls:" + day,
    dailyLimit(env),
    24 * 60 * 60,
    calls
  );
  return result.allowed;
}

async function resolveVanity(env, key, vanity) {
  const cacheKey = "vanity:v1:" + vanity.toLowerCase();
  const cached = await readCache(env, cacheKey);
  if (cached && /^\d{17}$/.test(cached.steamid || "")) return cached.steamid;

  if (!await reserveSteamBudget(env, 1)) return null;
  const data = await steamJson("/ISteamUser/ResolveVanityURL/v1/", key, { vanityurl: vanity });
  const body = responseBody(data);
  if (body.success !== 1 || !/^\d{17}$/.test(body.steamid || "")) return false;
  await writeCache(env, cacheKey, { steamid: body.steamid }, VANITY_TTL_SECONDS);
  return body.steamid;
}

async function profilePayload(env, key, steamid) {
  const cacheKey = "profile:v1:" + steamid;
  const cached = await readCache(env, cacheKey);
  if (cached) return { cached: true, data: cached };

  // The three documented calls below are the entire profile surface of this
  // Worker. They are returned intact, not transformed into presentation data.
  if (!await reserveSteamBudget(env, 3)) return { limited: true };
  const [summary, owned, recent] = await Promise.all([
    steamJson("/ISteamUser/GetPlayerSummaries/v2/", key, { steamids: steamid }),
    steamJson("/IPlayerService/GetOwnedGames/v1/", key, {
      steamid,
      include_appinfo: 1,
      include_played_free_games: 1,
      format: "json"
    }),
    steamJson("/IPlayerService/GetRecentlyPlayedGames/v1/", key, { steamid })
  ]);

  const players = responseBody(summary).players;
  if (!Array.isArray(players) || !players.length) return { notFound: true };

  // Steam commonly answers an inaccessible game library with an empty
  // response. Client copy deliberately says «Steam не отдал библиотеку», not
  // a misleading definite «ты точно всё скрыла».
  if (!Array.isArray(responseBody(owned).games)) return { gamesUnavailable: true };

  const data = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    summary,
    owned,
    recent
  };
  await writeCache(env, cacheKey, data, PROFILE_TTL_SECONDS);
  return { cached: false, data };
}

async function handleProfile(request, env) {
  if (!enabled(env)) return error("api_disabled", 503, request);
  if (!env.STEAM_API_KEY || !env.STEAM_CACHE || !env.RATE_LIMITER) return error("service_misconfigured", 503, request);

  const input = parseProfileInput(new URL(request.url).searchParams.get("profile"));
  if (!input) return error("invalid_profile_input", 400, request);

  const allowance = await allowRequest(env, request, 1);
  if (!allowance.allowed) return error(allowance.code, 429, request, { retryAfter: allowance.retryAfter });

  try {
    let steamid = input.kind === "steamid" ? input.value : await resolveVanity(env, env.STEAM_API_KEY, input.value);
    if (steamid === false) return error("profile_not_found", 404, request);
    if (steamid === null) return error("daily_limit_reached", 429, request);

    const result = await profilePayload(env, env.STEAM_API_KEY, steamid);
    if (result.limited) return error("daily_limit_reached", 429, request);
    if (result.notFound) return error("profile_not_found", 404, request);
    if (result.gamesUnavailable) return error("profile_games_unavailable", 403, request);
    return json({ ...result.data, cached: result.cached }, 200, request);
  } catch (cause) {
    if (cause instanceof UpstreamError) return error("upstream_unavailable", 502, request);
    return error("service_unavailable", 503, request);
  }
}

async function handleGenres(request, env) {
  if (!enabled(env)) return error("api_disabled", 503, request);
  if (!env.STEAM_CACHE || !env.RATE_LIMITER) return error("service_misconfigured", 503, request);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return error("invalid_genre_input", 400, request);
  }
  const appids = parseAppids(body && body.appids);
  if (!appids) return error("invalid_genre_input", 400, request);

  // A batch costs more than one profile lookup in the hourly limiter. This
  // prevents a client from turning eight arbitrary AppIDs into an open
  // SteamSpy harvester.
  const weight = 1 + Math.ceil(appids.length / 4);
  const allowance = await allowRequest(env, request, weight);
  if (!allowance.allowed) return error(allowance.code, 429, request, { retryAfter: allowance.retryAfter });

  try {
    const genres = {};
    const missing = [];
    await Promise.all(appids.map(async (appid) => {
      const cached = await readCache(env, "genre:v1:" + appid);
      if (cached && typeof cached.genre === "string") genres[appid] = cached.genre;
      else missing.push(appid);
    }));

    if (missing.length && !await reserveSteamBudget(env, missing.length)) {
      return error("daily_limit_reached", 429, request);
    }

    // SteamSpy has no batch endpoint. Eight is an intentional upper bound;
    // requests are only made for AppIDs the public genres.json does not know.
    const fresh = await mapWithConcurrency(missing, 2, async (appid) => {
      const genre = await steamSpyGenre(appid);
      return { appid, genre };
    });
    await Promise.all(fresh.map(async ({ appid, genre }) => {
      // Cache empty answers too: otherwise age-gated/deleted applications turn
      // every visitor into the same repeated SteamSpy request.
      await writeCache(env, "genre:v1:" + appid, { genre }, GENRE_TTL_SECONDS);
      genres[appid] = genre;
    }));

    // genre is deliberately raw English SteamSpy text. Translation and DROP_GENRES
    // happen in profile-data.js using the common rules.json.
    return json({ schemaVersion: 1, genres }, 200, request);
  } catch (cause) {
    if (cause instanceof UpstreamError) return error("upstream_unavailable", 502, request);
    return error("service_unavailable", 503, request);
  }
}

function health(request) {
  return json({ ok: true, schemaVersion: 1 }, 200, request);
}

export default {
  async fetch(request, env) {
    if (!originIsAllowed(request)) return error("origin_not_allowed", 403, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

    const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    if (request.method === "GET" && pathname === "/health") return health(request);
    if (request.method === "GET" && pathname === "/v1/profile") return handleProfile(request, env);
    if (request.method === "POST" && pathname === "/v1/genres") return handleGenres(request, env);
    return error("not_found", 404, request);
  }
};
