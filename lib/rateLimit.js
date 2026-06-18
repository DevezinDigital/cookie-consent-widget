// lib/rateLimit.js
import { Redis } from "@upstash/redis";

const LIMIT = 20; // max requests
const WINDOW = 60; // per 60 seconds
const WINDOW_MS = WINDOW * 1000;

let redis = null;
if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL,
    token: process.env.UPSTASH_REDIS_TOKEN,
  });
}

// Lets an environment assert "this SHOULD have distributed rate limiting".
// Set REQUIRE_RATE_LIMIT=true in production so a typo'd/absent Redis config
// is loud at startup instead of looking identical to intentionally-off in dev.
if (process.env.REQUIRE_RATE_LIMIT === "true" && !redis) {
  console.error(
    "[RATELIMIT_MISCONFIGURED] REQUIRE_RATE_LIMIT is set but Upstash Redis " +
      "is not configured — degrading to the per-instance in-memory limiter.",
  );
}

// Per-instance in-memory fallback. When Redis is unconfigured or unreachable,
// this still caps a single warm container instead of removing the only abuse
// control entirely (a Redis outage previously meant unlimited throughput).
// It's not shared across instances, but it blunts a burst against one box.
const memWindows = new Map(); // identifier -> { count, resetAt }

function memCheck(identifier) {
  const now = Date.now();

  // Opportunistic prune so the map can't grow unbounded on a long-lived
  // warm instance.
  if (memWindows.size > 5000) {
    for (const [k, v] of memWindows) {
      if (v.resetAt <= now) memWindows.delete(k);
    }
  }

  const w = memWindows.get(identifier);
  if (!w || w.resetAt <= now) {
    memWindows.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: LIMIT - 1 };
  }
  w.count += 1;
  return { allowed: w.count <= LIMIT, remaining: Math.max(0, LIMIT - w.count) };
}

/**
 * Fixed-window rate limiter.
 *
 * Degradation policy is explicit and per-caller:
 *   - Redis UNCONFIGURED (normal in dev): fall back to the in-memory limiter.
 *   - Redis CONFIGURED but THROWS (a production incident): log loudly with a
 *     greppable tag so alerting can catch it, then either fail closed
 *     (destructive endpoints) or degrade to the in-memory limiter.
 *
 * @param {string} identifier               key to bucket on (usually the IP)
 * @param {{ failClosed?: boolean }} [opts]  failClosed denies on Redis error
 */
export async function checkRateLimit(identifier, { failClosed = false } = {}) {
  if (!redis) {
    // Expected when Redis isn't set up — degrade to in-memory, don't open up.
    return memCheck(identifier);
  }

  try {
    const key = `consent:ratelimit:${identifier}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW);

    return {
      allowed: count <= LIMIT,
      remaining: Math.max(0, LIMIT - count),
    };
  } catch (err) {
    // A configured Redis that errors is NOT the dev "no Redis" case — it's an
    // incident that silently removes our only abuse control. Tag it so it's
    // alertable rather than buried in logs.
    console.error("[RATELIMIT_REDIS_DOWN] Redis rate-limit check failed", err);

    if (failClosed) {
      // Destructive endpoints (erasure) must not become unlimited on outage.
      return { allowed: false, remaining: 0 };
    }
    // Best-effort endpoints degrade to the stricter local limiter, not open.
    return memCheck(identifier);
  }
}
