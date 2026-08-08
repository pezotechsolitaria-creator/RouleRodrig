# Why functions run in Frankfurt (`fra1`)

**Measured on production, 2026-08-08.** `/api/health` on a *warm* instance
(`uptimeMs: 67762`, so not a cold start) reported:

```
dbLatencyMs: 457        ← one indexed SELECT of a single row
totalMs:     458        ← i.e. essentially ALL of the request was the database
```

457 ms for `select id from site_content limit 1` is not a slow query. It is a
slow *journey*.

## The cause

| | |
|---|---|
| Supabase project region | `eu-central-1` — Frankfurt |
| Vercel function region | unset → Vercel's default, `iad1` — Washington DC |

So every server-rendered page and every API route was doing
**Rodrigues → Washington → Frankfurt → Washington → Rodrigues**, paying a
transatlantic round trip *per query*. Checkout is the worst case because it is
several sequential round trips — cart resolve, then quote, then `create_order` —
so the delay compounds on exactly the screen where it costs money.

## Why Frankfurt and not somewhere else

Co-locating with the database removes the transatlantic hop entirely
(same-region function→DB is single-digit milliseconds). It also happens to be
**closer to the customer**, which is the unusual part — Rodrigues sits at roughly
19.7°S, 63.4°E:

| Leg | via `iad1` (Washington) | via `fra1` (Frankfurt) |
|---|---|---|
| Rodrigues → function | ~15,500 km | ~8,900 km |
| function → database | ~6,600 km | same region |

There is no trade-off to weigh here. Frankfurt is better on both legs, so this
is not "optimising the server at the user's expense".

## What this does NOT change

Static pages and ISR are served from Vercel's edge CDN and were never affected —
only *functions* (server components, route handlers, the cron) move. No
application code changes; this is purely where the code runs.

## If a deploy ever rejects this

`regions` is a plan-gated setting on Vercel and a single region is the entry
level. If a deploy fails complaining about it, there are two equivalent ways out:

1. Delete the `"regions"` line here and set **Project → Settings → Functions →
   Function Region → Frankfurt (fra1)** in the Vercel dashboard instead. Same
   effect; the only loss is that the setting stops being visible in the repo.
2. Revert the line and accept the latency until the plan allows it.

Prefer option 1 — the latency is worth far more than the config living in git.

## How to confirm it worked

Hit `https://roulerodrig.com/api/health` **twice** (the first call may be a cold
start — check `uptimeMs` is more than a few seconds before trusting the number):

```
dbLatencyMs: expect roughly 5–40 ms, down from ~457 ms
```

If it has not moved, the deploy did not pick up the region — check the
deployment's Functions tab in Vercel for the region it actually used.
