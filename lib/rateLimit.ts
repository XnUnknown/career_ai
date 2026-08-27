/**
 * lib/rateLimit.ts — in-memory token-bucket rate limiter (server-side).
 *
 * Stops one client (IP) from hammering the local Ollama model by capping how
 * many chat requests it can make over time.
 *
 * How a token bucket works:
 *   - The bucket holds up to `max` tokens (burst capacity).
 *   - Tokens refill continuously at `refillPerMinute` tokens/minute.
 *   - Each request costs 1 token. If the bucket is empty, the request is denied
 *     with HTTP 429 until enough time has passed to refill one token.
 *
 * NOTE: state lives in memory of THIS process — it resets on server restart and
 * doesn't work across multiple server instances. That's fine for a local /
 * college project. For production, swap this for a shared store (Upstash Redis,
 * or a DB table) — same interface, different backend.
 */

interface Bucket {
  tokens: number; // available tokens (can be fractional)
  lastRefill: number; // epoch ms of last refill
}

// keyed by client IP
const buckets = new Map<string, Bucket>();

// Guard against unbounded growth (rare, but be tidy about it).
const MAX_BUCKETS = 10_000;
const BUCKET_TTL_MS = 10 * 60_000; // forget IPs idle for 10 minutes

function config() {
  return {
    max: Math.max(1, parseInt(process.env.RATE_LIMIT_MAX ?? "30", 10)),
    refillPerMinute: Math.max(1, parseInt(process.env.RATE_LIMIT_REFILL_PER_MINUTE ?? "15", 10)),
  };
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number; // full tokens left (0 when limited)
  retryAfterSec: number; // seconds to wait before retrying (0 when allowed)
}

export function rateLimit(key: string): RateLimitResult {
  const { max, refillPerMinute } = config();
  const now = Date.now();

  // Housekeeping: if the map got huge, drop buckets that have been idle too long.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (now - b.lastRefill > BUCKET_TTL_MS) buckets.delete(k);
    }
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: max, lastRefill: now };
    buckets.set(key, bucket);
  }

  // 1. Refill: add tokens proportional to elapsed time, capped at `max`.
  const elapsedMs = now - bucket.lastRefill;
  bucket.tokens = Math.min(max, bucket.tokens + (refillPerMinute * elapsedMs) / 60_000);
  bucket.lastRefill = now;

  // 2. Take a token if one is available.
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      ok: true,
      limit: max,
      remaining: Math.floor(bucket.tokens),
      retryAfterSec: 0,
    };
  }

  // 3. Limited — how long until the next token refills?
  const msUntilNextToken = ((1 - bucket.tokens) / refillPerMinute) * 60_000;
  return {
    ok: false,
    limit: max,
    remaining: 0,
    retryAfterSec: Math.max(1, Math.ceil(msUntilNextToken / 1000)),
  };
}
