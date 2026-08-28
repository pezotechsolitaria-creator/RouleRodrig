# Analytics & the owner's dashboard — specification

**For:** whoever implements the next stage.
**Status of this document:** written against the repository as it stands, not against a template. Every file path, event name and configuration value below was read from the code. Where something does not exist yet, it says so.

---

## 0. The recommendation, first

**Do not migrate to Umami or Plausible. Do not self-host PostHog.**

The brief that prompted this document asked for a self-hosted, cookieless analytics stack. Three facts about this specific site make that the wrong build:

1. **PostHog is already installed, configured with unusual care, and collecting.** See `instrumentation-client.ts`. Session replay is disabled _in code_ rather than by dashboard toggle, exception capture is off because Sentry owns errors and scrubs PII, autocapture is disabled on routes whose DOM holds customer data, and every outbound event passes through `scrubPostHogEvent` (`lib/posthog-scrub.ts`) so a careless `posthog.capture("checkout", { phone, email })` is sanitised rather than silently becoming analytics data. That is a stronger privacy posture than a default Umami install, and it took real work to get.

2. **Eight conversion events are already firing.** Replacing the tool means rewriting all of them and losing every row of history behind them. Umami and Plausible can count custom events but cannot express the funnels this business needs.

3. **Self-hosting PostHog needs ClickHouse, Kafka, Redis and Postgres.** This is a one-person business on an island of 43,000 people, deployed on Vercel. The operational cost of that stack — and the consequence of it falling over unattended — is not proportionate to the value.

**What to do instead** is in §2. It is four changes, none of them large, and it gets everything the brief actually asked for.

---

## 1. What already exists

Read this before writing anything, because most of the ground floor is built.

### Collection

| Thing                  | Where                                                           | State                                                           |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| PostHog browser SDK    | `instrumentation-client.ts`                                     | Live, EU region (`eu.i.posthog.com`)                            |
| Pageviews              | `defaults: "2026-01-30"` → `history_change`                     | Live. Do **not** add manual pageview capture — it double-counts |
| PII scrubbing          | `lib/posthog-scrub.ts`, wired via `before_send`                 | Live, with tests                                                |
| Session replay         | `disable_session_recording: true`                               | Off, deliberately                                               |
| Exception capture      | `capture_exceptions: false`                                     | Off — Sentry owns errors and scrubs them                        |
| Autocapture            | `url_ignorelist: AUTOCAPTURE_SENSITIVE_ROUTES`                  | On, except on sensitive routes                                  |
| Core Web Vitals        | `<SpeedInsights />` in `app/layout.tsx`                         | **Already collected** by Vercel Speed Insights                  |
| Ingestion health check | `lib/posthog-health.ts`, `app/api/cron/posthog-health/route.ts` | Live — alerts if PostHog goes silent                            |

### Events already firing

```
scooter_booking_requested       components/BookingSection.tsx
checkout_order_placed           components/checkout/CheckoutForm.tsx
event_tickets_ordered           components/events/EventCheckout.tsx
event_package_selected          components/events/PackagePicker.tsx
place_reservation_requested     (reservation flow)
merchant_onboarding_completed   components/merchant/OnboardingForm.tsx
merchant_order_accepted         components/merchant/orders/OrderDetail.tsx
merchant_order_status_updated   (merchant console)
```

### Enquiries, separately

`lead_events` in Postgres, written by `POST /api/leads`. Kinds: `taxi`, `food_concierge`, `stay_eat_do`, `tiroule_miss`, `transfer`.

> **Note for whoever picks this up:** `transfer` recorded **zero** rows between June and late August 2026 because the caller sent `target` where the route reads `target_name`. Fixed, and guarded by `app/api/leads/contract.test.ts`. If you add a caller, that test enforces the shape.

### The dashboard panel

`app/admin/PageAnalytics.tsx` + `app/api/admin/analytics/pages/route.ts`, with the ranking logic isolated and tested in `lib/analytics/pages.ts` (23 tests).

It rolls pageviews up into **parts of the business** rather than URLs, pairs them with `lead_events` over the same window, and leads with **"Looked at, never acted on"** — real traffic, no enquiries. Three deliberate decisions worth preserving:

- Visitors are **never summed** across paths. The same person visits several, so summing inflates reach. It reports the largest single path's visitors — a floor, never an inflated number.
- A section with no enquiry route shows **nothing, not 0%**. "We do not measure this" and "nobody enquired" are different facts.
- **"Quietest" excludes zero-view sections.** A page nobody reached is usually a page nobody _can_ reach — a navigation fault, not a content one.

**It currently shows "not configured"** because `POSTHOG_PERSONAL_API_KEY` is unset. That is the single blocker between the owner and their data.

---

## 2. The four changes

### 2.1 Set `POSTHOG_PERSONAL_API_KEY` — 5 minutes, unblocks everything

PostHog → Settings → Personal API keys → create one scoped to **Query: Read** on this project only. Add to Vercel as `POSTHOG_PERSONAL_API_KEY`.

`POSTHOG_PROJECT_ID` and `POSTHOG_API_HOST` already default correctly (`lib/posthog-health.ts`).

Nothing else in the panel needs changing. It will populate on the next admin page load.

### 2.2 Make it genuinely cookieless — the brief's actual requirement

**This is the real privacy gap.** `posthog.init` sets no `persistence` option, so it uses the default `localStorage+cookie`. The site _does_ set an analytics cookie today.

In `instrumentation-client.ts`, inside `posthog.init`:

```ts
// Cookieless. `memory` keeps the distinct_id for the tab and nothing more:
// no cookie, no localStorage entry, nothing that survives the visit.
//
// The cost is real and worth stating: a returning visitor counts as new, so
// "unique visitors" becomes "unique visits". For a tourism site whose
// audience visits a handful of times before a trip and then never again,
// that trade is cheap — and it removes the consent banner question entirely.
persistence: "memory",

// Do not build person profiles for anonymous traffic.
person_profiles: "identified_only",
```

Then confirm no consent banner is needed. With `persistence: "memory"` and session replay already off, there is nothing stored on the visitor's device.

### 2.3 Send Core Web Vitals to PostHog so they sit beside the traffic

Vercel Speed Insights already measures them, but in a different dashboard from everything else — so nobody correlates a slow page with its bounce rate.

New file `components/WebVitals.tsx`:

```tsx
"use client";
import { useReportWebVitals } from "next/web-vitals";
import posthog from "posthog-js";

/**
 * Core Web Vitals into PostHog, so page speed sits beside the traffic it
 * affects rather than in a separate dashboard nobody opens.
 *
 * Rounded, and no identifiers: a metric is a number about a PAGE, not about
 * the person who loaded it.
 */
export default function WebVitals() {
  useReportWebVitals((metric) => {
    posthog.capture("web_vital", {
      metric: metric.name, // LCP | INP | CLS | FCP | TTFB
      value: Math.round(
        metric.name === "CLS" ? metric.value * 1000 : metric.value,
      ),
      rating: metric.rating, // good | needs-improvement | poor
      path: window.location.pathname,
    });
  });
  return null;
}
```

Mount it once in `app/layout.tsx` beside `<SpeedInsights />`.

Thresholds to render against: **LCP** good ≤ 2500 ms · **INP** good ≤ 200 ms · **CLS** good ≤ 0.1 (sent ×1000, so ≤ 100).

### 2.4 Fill the event gaps

Eight events exist; these are the ones whose absence makes a funnel unanswerable. Names follow the existing `noun_verb_past` convention.

| Event                    | Fire where                                        | Properties                                                  |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------- |
| `deliver_request_posted` | `app/deliver/DeliverForm.tsx`, on successful post | `service`, `schedule_kind`, `has_photo`                     |
| `deliver_step_advanced`  | same, on each screen change                       | `from_step`, `to_step`                                      |
| `ride_request_submitted` | `app/taxi/book/BookRide.tsx`                      | `service`, `direction`, `when_kind`                         |
| `ride_quote_shown`       | same, when a price renders                        | `service`, `flat`                                           |
| `tiroule_opened`         | `components/GlobalTiRoule.tsx`                    | `source_path`                                               |
| `tiroule_question_asked` | same                                              | `matched` (boolean — did the knowledge base have an answer) |
| `whatsapp_handoff`       | every `wa.me` link                                | `context` (`taxi` \| `transfer` \| `food` \| `booking`)     |
| `language_switched`      | `components/Navbar.tsx`                           | `from`, `to`                                                |

**Never as properties:** name, phone, email, address, reference codes. `scrubPostHogEvent` will strip them, but the rule is that they should never be written in the first place.

`tiroule_question_asked` with `matched: false` is the most valuable of these: it is a list of questions the island's visitors ask that the site cannot answer, which is a content backlog written by the customers themselves.

---

## 3. Dashboard specification

Extends `app/admin/PageAnalytics.tsx`. Mobile-first: the owner will read this on a phone.

### Row 1 — Is the site healthy today?

Six tiles, each a number, a sparkline, and a change against the previous equal period.

| Tile            | Source                                 | Notes                                                                 |
| --------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Visits          | PostHog `$pageview`, distinct sessions | Call it **visits**, not "unique visitors", once cookieless — see §2.2 |
| Engaged visits  | visits with ≥2 pageviews or ≥30s       |                                                                       |
| Enquiries       | `lead_events` + conversion events      | The number the business actually runs on                              |
| Conversion rate | enquiries ÷ visits                     | Show **—** when visits < 50, never 0%                                 |
| Web Vitals      | worst of LCP / INP / CLS at p75        | Good / Needs work / Poor                                              |
| Ingestion       | `lib/posthog-health.ts`                | Green, or "silent for N hours"                                        |

> Every tile with a denominator must refuse to render a rate below a floor. On an island with this traffic, "0% conversion" from nine visits is noise that will be acted on as signal.

### Row 2 — What is working

- **Busiest sections** — already built.
- **Best converting sections** — enquiries per hundred visits, minimum 50 visits.
- **Where they come from** — organic / direct / social / referral, with UTM campaigns broken out.
- **Countries** — Mauritius and Réunion separated from the rest; they behave differently and one of them is a day-trip market.
- **Language** — from `language_switched` and the `rr_language` distribution. This decides whether the French estate is worth extending.

### Row 3 — What is not working

- **Looked at, never acted on** — already built. Keep it first; it is the reason to open the screen.
- **Funnel drop-off** — see §4.
- **Slow pages** — p75 LCP by path, worst first, with the visit count beside it.
- **Quietest sections** — already built, zero-view sections excluded.
- **Unanswered Ti Roulé questions** — `tiroule_question_asked` where `matched: false`, grouped. A content backlog written by customers.

### Row 4 — Trends

Traffic and enquiries over time, period comparison, device split (mobile vs desktop — most visitors are tourists on phones), and top landing and exit pages.

---

## 4. Funnels

Define these three in PostHog. They are the questions the business cannot currently answer.

**Scooter or car rental**

```
$pageview /            → $pageview /browse/{scooter|car}
                       → $pageview (vehicle detail)
                       → scooter_booking_requested
```

**Delivery (Ti Roulé)**

```
$pageview /deliver     → deliver_step_advanced (1→2)
                       → deliver_step_advanced (2→3)
                       → deliver_step_advanced (3→4)
                       → deliver_request_posted
```

Per-step, because the flow was rebuilt for zero scrolling and this is how you find out whether that worked.

**Taxi and transfers**

```
$pageview /taxi|/transfers → ride_quote_shown → ride_request_submitted
```

Segment every funnel by **device** and by **language**. A funnel that converts on desktop and dies on mobile is the single most common finding on a tourism site, and it is invisible in the aggregate.

---

## 5. Alerts

Weekly digest to the owner (Monday morning, Indian/Mauritius), reusing the existing email infrastructure in `lib/email.ts`:

- visits and enquiries, versus the previous week
- the best and worst converting sections
- any page whose p75 LCP crossed 2.5s
- any funnel step whose drop-off worsened by more than 10 points

Immediate alerts only for: PostHog silent for 24h (**already built**, `app/api/cron/posthog-health/route.ts`), and enquiries at zero for 48h during a period that normally has them.

Keep the list short. An alert that fires weekly without anyone acting on it trains the owner to ignore the ones that matter.

---

## 6. What this document will not tell you to build

**Revenue attribution.** No payment processor is connected. Bank transfer and cash are confirmed by hand. Building attribution now means building it against data that does not exist.

**Rage-click and dead-click detection.** It needs session replay, which is off on purpose — this site's DOM holds customer names, phone numbers and delivery addresses. Do not turn it on for analytics convenience.

**A/B testing.** Traffic is far below the volume where a result would be significant. A test that cannot reach significance is a decision made on noise while feeling rigorous.

**Any consent banner**, once §2.2 lands. With memory persistence, no replay, and PII scrubbed at the boundary, nothing is stored on the visitor's device — so there is nothing to ask consent for, and a banner would cost conversions to solve a problem that no longer exists.

---

## 7. Order of work

| #   | Task                           | Effort                | Unblocks                          |
| --- | ------------------------------ | --------------------- | --------------------------------- |
| 1   | Set `POSTHOG_PERSONAL_API_KEY` | minutes               | The whole panel                   |
| 2   | Cookieless persistence (§2.2)  | < 1 hour              | The privacy requirement           |
| 3   | Web Vitals into PostHog (§2.3) | 1–2 hours             | Health tile, slow pages           |
| 4   | The eight events (§2.4)        | half a day            | Every funnel                      |
| 5   | Funnels (§4)                   | 1 hour, in PostHog UI | Drop-off                          |
| 6   | Dashboard rows 1–4 (§3)        | 2–3 days              | The full picture                  |
| 7   | Weekly digest (§5)             | 1 day                 | Owner reads it without logging in |

**Do 1 first and stop.** The panel that exists will start showing real numbers, and those numbers should shape everything after it. Building rows 2–4 before seeing a single real figure is how dashboards get built for questions nobody asked.
