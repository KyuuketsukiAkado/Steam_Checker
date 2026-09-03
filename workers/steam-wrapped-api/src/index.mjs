/* Cloudflare entry point. Runtime-specific Durable Object lives here so the
   request parser and Worker handler remain testable in Node without a Cloudflare
   runtime. */
import { DurableObject } from "cloudflare:workers";
import Worker, { parseAppids, parseProfileInput } from "./worker-core.mjs";

export { parseAppids, parseProfileInput };

// Cloudflare's current Durable Object runtime requires the exported class to
// extend DurableObject. `this.ctx` is supplied by the base class after super().
export class RateLimiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
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
    const bucket = typeof input.bucket === "string"
      ? input.bucket.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) : "";
    if (!bucket) return new Response("bad request", { status: 400 });

    const now = Date.now();
    const stored = await this.ctx.storage.get(bucket);
    const current = stored && typeof stored === "object" && stored.resetAt > now
      ? stored : { used: 0, resetAt: now + windowSeconds * 1000 };

    if (current.used + amount > limit) {
      return Response.json({ allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) });
    }

    current.used += amount;
    await this.ctx.storage.put(bucket, current);
    return Response.json({ allowed: true, remaining: Math.max(0, limit - current.used) });
  }
}

export default Worker;
