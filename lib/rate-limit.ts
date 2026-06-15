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
  if (res.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(res.retryAfter),
        "X-RateLimit-Limit": String(res.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
