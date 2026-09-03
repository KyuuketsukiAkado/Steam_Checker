import assert from "node:assert/strict";
import Worker, { parseAppids, parseProfileInput } from "../src/index.mjs";

// SteamID64, vanity и две стандартные ссылки — допустимые формы.
assert.deepEqual(parseProfileInput("76561198000000000"), { kind: "steamid", value: "76561198000000000" });
assert.deepEqual(parseProfileInput("K_Ak4d0"), { kind: "vanity", value: "K_Ak4d0" });
assert.deepEqual(
  parseProfileInput("https://steamcommunity.com/id/K_Ak4d0/?xml=1"),
  { kind: "vanity", value: "K_Ak4d0" }
);
assert.deepEqual(
  parseProfileInput("https://www.steamcommunity.com/profiles/76561198000000000/"),
  { kind: "steamid", value: "76561198000000000" }
);

// Никаких произвольных путей, внешних хостов или неожиданно длинных строк.
for (const bad of [
  "",
  "7656119800000000",
  "https://example.com/?target=steam",
  "https://steamcommunity.com/id/K_Ak4d0/games",
  "https://steamcommunity.com/profiles/not-an-id/",
  "javascript:alert(1)"
]) assert.equal(parseProfileInput(bad), null, bad);

assert.deepEqual(parseAppids([570, "730", 413150, 570]), ["570", "730", "413150"]);
assert.equal(parseAppids([]), null);
assert.equal(parseAppids(["0"]), null);
assert.equal(parseAppids(["1.5"]), null);
assert.equal(parseAppids(["https://example.com"]), null);
assert.equal(parseAppids([1, 2, 3, 4, 5, 6, 7, 8, 9]), null);

const health = await Worker.fetch(new Request("https://worker.example/health", {
  headers: { Origin: "https://kyuuketsukiakado.github.io" }
}), {});
assert.equal(health.status, 200);
assert.equal(health.headers.get("access-control-allow-origin"), "https://kyuuketsukiakado.github.io");
assert.deepEqual(await health.json(), { ok: true, schemaVersion: 1 });

const alienOrigin = await Worker.fetch(new Request("https://worker.example/health", {
  headers: { Origin: "https://example.com" }
}), {});
assert.equal(alienOrigin.status, 403);
assert.equal(alienOrigin.headers.get("access-control-allow-origin"), null);

const noSecret = await Worker.fetch(new Request("https://worker.example/v1/profile?profile=76561198000000000"), {});
assert.equal(noSecret.status, 503);
assert.equal((await noSecret.json()).error.code, "steam_key_not_configured");

// Мини-стенд профиля: Worker возвращает три неочищенных Steam-ответа и
// второй раз обслуживает тот же SteamID из KV, не вызывая Steam повторно.
const cache = new Map();
const env = {
  STEAM_API_KEY: "test-key-not-secret",
  STEAM_CACHE: {
    async get(key, type) {
      const value = cache.get(key);
      return value && type === "json" ? JSON.parse(value) : null;
    },
    async put(key, value) { cache.set(key, value); }
  },
  RATE_LIMITER: {
    idFromName(name) { return name; },
    get() { return { fetch: async () => Response.json({ allowed: true, remaining: 1 }) }; }
  }
};
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (rawUrl) => {
  const url = new URL(rawUrl);
  calls.push(url);
  assert.equal(url.origin, "https://api.steampowered.com");
  if (url.pathname.includes("GetPlayerSummaries")) {
    return Response.json({ response: { players: [{ personaname: "Friend" }] } });
  }
  if (url.pathname.includes("GetOwnedGames")) {
    return Response.json({ response: { game_count: 1, games: [{ appid: 730, name: "Counter-Strike 2", playtime_forever: 60 }] } });
  }
  if (url.pathname.includes("GetRecentlyPlayedGames")) {
    return Response.json({ response: { games: [{ appid: 730, playtime_2weeks: 30 }] } });
  }
  throw new Error("unexpected upstream route " + url.pathname);
};
try {
  const first = await Worker.fetch(new Request("https://worker.example/v1/profile?profile=76561198000000000"), env);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.cached, false);
  assert.equal(firstBody.summary.response.players[0].personaname, "Friend");
  assert.equal(firstBody.owned.response.games[0].playtime_forever, 60);
  assert.equal(firstBody.recent.response.games[0].playtime_2weeks, 30);
  assert.equal(JSON.stringify(firstBody).includes("test-key-not-secret"), false);
  assert.equal(calls.length, 3);

  const second = await Worker.fetch(new Request("https://worker.example/v1/profile?profile=76561198000000000"), env);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).cached, true);
  assert.equal(calls.length, 3, "кэшированный профиль не должен снова звать Steam");
} finally {
  globalThis.fetch = realFetch;
}

console.log("✓ worker: строгий ввод, CORS, сырой профиль и KV-кэш");
