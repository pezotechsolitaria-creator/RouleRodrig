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

## CORRECTION — measured after deploying (2026-08-08)

**The original diagnosis above was partly wrong, and the honest numbers are
worse for it than the ones that motivated the change.**

Four samples on the Frankfurt build (`f4a9be2f`):

| dbLatencyMs | uptimeMs | |
|---|---|---|
| 629 | 18,215 | fresh instance |
| 615 | 162,449 | |
| **71** | 19,135 | warm |
| **127** | 21,812 | warm |

And two on the previous Washington build (`7ef17c8a`): **457 ms** at
`uptimeMs: 1083` (cold) and **148 ms** at `uptimeMs: 361726` (very warm).

The pattern is not geography. It is **connection establishment on a fresh
serverless instance**: the first database call from a new instance costs
600 ms+, and subsequent calls on that same instance cost 70–150 ms. The app
talks to Supabase over PostgREST/HTTPS, so a new instance pays a full TLS
handshake before the query even starts.

So the 457 ms figure that triggered this change was mostly *cold-instance
setup*, which I attributed to the transatlantic hop. That was a
misattribution — one measurement, over-interpreted.

**Is the change still right?** Keeping it, for two reasons, neither of which is
proof:

1. The best warm sample improved from 148 ms to 71 ms, which is consistent with
   removing the transatlantic leg from the steady state. But n=1 — treat it as
   suggestive, not demonstrated.
2. Co-locating a function with its database is correct regardless, and Frankfurt
   is also physically closer to Rodrigues than Washington. There is no scenario
   where iad1 is the better choice here.

**What this change did NOT fix:** the 600 ms first-call penalty on every new
instance. That is the real latency problem, it is unaddressed, and it will be
felt by the first visitor to hit each cold instance. Fixing it properly means
attacking connection reuse, not geography.

## How to confirm the region actually applied

Latency is far too noisy to infer this from. `/api/health` → `build.region`
reports `VERCEL_REGION` directly:

```
build.region: "fra1"   ← the pin worked
build.region: "iad1"   ← the pin was ignored; set it in the Vercel dashboard
                          (Project → Settings → Functions → Function Region)
```

Take several samples before judging latency, and always check `uptimeMs` — any
reading under a few seconds is a cold start and tells you nothing.
