import { NextRequest, NextResponse } from "next/server";

// ── Rate limiting ────────────────────────────────────────────────────────────
// In-memory fixed-window limiter. This protects against brute-force, scraping
// and casual abuse. NOTE: serverless instances each hold their own map, so the
// effective limit is per-instance — good enough as a first line of defence.
// For strict, globally-consistent limits across instances, back this with
// Upstash Redis / Vercel KV (see `checkRateLimit` swap-in point below).

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded under attack.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of store) {
    if (b.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfter: number; // seconds
}

/**
 * @param key      unique identity (e.g. `login:1.2.3.4`)
 * @param limit    max requests allowed within the window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, limit, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, limit, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, limit, remaining: limit - bucket.count, retryAfter: 0 };
}

/** Best-effort client IP from common proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Convenience guard. Returns a 429 NextResponse if the limit is exceeded,
 * otherwise null. Adds standard rate-limit headers.
 *
 *   const limited = guard(req, "bookings", 10, 60_000);
 *   if (limited) return limited;
 */
export function guard(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const res = rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  return res.ok ? null : tooMany(res.retryAfter, res.limit);
}

function tooMany(retryAfter: number, limit: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

// ── Globally consistent limiting ────────────────────────────────────────────
//
// THE PROBLEM WITH guard() ALONE. Its Map lives in one serverless instance, so
// the real ceiling is `limit × instances`, not `limit`. Under the load that
// actually accompanies an attack, Vercel scales out and the limit loosens in
// exactly the moment it is supposed to tighten. That is fine for casual abuse
// and useless against a determined one — and this codebase's most sensitive
// surfaces (order lookup by guessable reference, admin login, stock-reserving
// checkout) are precisely the determined case.
//
// THE DESIGN. Upstash Redis over its REST API — plain `fetch`, no SDK, no new
// dependency, and it works from the Edge as well as Node. INCR + EXPIRE in one
// pipelined round trip is an atomic fixed window shared by every instance.
//
// FAILURE MODES, decided deliberately:
//   * NOT CONFIGURED → the local limiter is the whole answer, i.e. exactly
//     today's behaviour. Adding two env vars upgrades every wired endpoint with
//     no code change, and removing them degrades rather than breaks.
//   * REDIS UNREACHABLE / SLOW → FAIL OPEN, with a 1s timeout. A rate limiter
//     that takes the checkout down when its cache blinks has caused a worse
//     outage than the abuse it prevents. The local limiter still applies, so
//     failing open falls back to a real limit rather than to none.
//
// READ AT CALL TIME, NOT AT MODULE SCOPE. These were previously captured into
// module-level consts, which is a trap: a bundler is free to statically replace
// a `process.env.X` expression with its value AT BUILD TIME, and the build
// environment does not necessarily carry the runtime secrets. The symptom is
// the nastiest kind — the variables are correctly set in Vercel, the deploy
// succeeds, and the limiter silently reports "in-memory" forever. Reading
// inside the function costs one property lookup and removes the whole class.
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

/** True when a shared store is configured. Exposed for diagnostics (/api/health). */
export function hasSharedLimiter(): boolean {
  return redisConfig() !== null;
}

/**
 * Which half of the configuration is missing — BOOLEANS ONLY, never a value.
 *
 * "in-memory" alone cannot distinguish "I never set these", "I set them on
 * Preview instead of Production", "I typo'd a variable name" and "I set them
 * but never redeployed". Each has a different fix, and hunting through a
 * dashboard to tell them apart is exactly the kind of time this endpoint exists
 * to save.
 */
export function sharedLimiterDiagnostics(): { urlSet: boolean; tokenSet: boolean } {
  return {
    urlSet: Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()),
    tokenSet: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim()),
  };
}

async function sharedIncr(key: string, windowSec: number): Promise<number | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  const { url: REDIS_URL, token: REDIS_TOKEN } = cfg;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    // Pipelined so the window is set in the same round trip that opens it.
    // EXPIRE is unconditional-on-first-write via NX so a long-running window is
    // never extended by later hits — that would turn a fixed window into a
    // sliding one and could lock a legitimate caller out indefinitely.
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec), "NX"],
      ]),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: unknown }[];
    const count = body?.[0]?.result;
    return typeof count === "number" ? count : null;
  } catch {
    // Timeout, network error, malformed response — all fail open.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Two limiters, cheapest first.
 *
 * The in-memory check runs unconditionally: it costs nothing, and a caller
 * already over the per-instance budget is rejected without a network hop. Only
 * a request that survives that consults the shared counter, so Redis traffic is
 * proportional to legitimate load rather than to attack volume.
 *
 *   const limited = await guardShared(req, "checkout", 10, 60_000);
 *   if (limited) return limited;
 */
export async function guardShared(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const local = guard(req, scope, limit, windowMs);
  if (local) return local;
  if (!hasSharedLimiter()) return null;

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  // Bucket the key by window so a fixed window rolls over cleanly even if a key
  // outlives its TTL for a moment.
  const bucket = Math.floor(Date.now() / windowMs);
  const count = await sharedIncr(`rl:${scope}:${clientIp(req)}:${bucket}`, windowSec);
  if (count === null || count <= limit) return null;
  return tooMany(windowSec, limit);
}
