# Email architecture audit — Phase 1

**Date:** 2026-08-08 · **Scope:** every email-producing path in the platform
**Status:** audit only. No code changed.

Commissioned to answer: *can Resend and Brevo both carry transactional email,
with quota-aware routing and a protected ticketing reserve?*

The answer is yes, and the foundation for it is already half-built. But the audit
overturned four premises the plan rested on, and those corrections change the
design. They are in §14 and §15 — read those before the implementation plan.

---

## 1. Current email architecture

One file, one function, one code path.

```
                        ┌─ app/api/bookings           (vehicle rentals)
                        ├─ app/api/place-bookings     (accommodation/activities)
                        ├─ app/api/contact            (enquiry ack)
                        ├─ app/api/waitlist           (welcome)
                        ├─ app/api/paypal/capture-order (vehicle-taken notice)
14 exported senders ────┼─ app/api/cron/reminders     (reminders/feedback/digest)
in lib/email.ts         ├─ app/api/admin/email        (test send)
                        └─ lib/notifications/dispatch (marketplace, via
                                                       order-placed + order-events)
                                    │
                                    ▼
                    lib/email.ts  send()   ← THE ONLY EXIT
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
         RESEND_API_KEY set?              else Brevo key set?
         POST api.resend.com              POST api.brevo.com/v3/smtp/email
         (dormant — no key in Vercel)     (LIVE — carries 100% today)
                                    │
                                    └─ neither → console.log, return false
```

Separately, and **entirely outside the application**:

```
Supabase Auth ──SMTP──▶ Brevo SMTP relay ──▶ signup confirm, password reset,
                                             magic link, email change
```

`send()` is at [lib/email.ts:472](../lib/email.ts). It is a 79-line
either/or switch: it checks `RESEND_API_KEY` first and returns from inside that
branch, so **if a Resend key exists, Brevo becomes unreachable code.** There is
no per-type routing, no quota check, no logging, no retry, and no fallback.

Everything is best-effort by design: `send()` returns `boolean` and never throws,
so an email failure can never fail a booking or a checkout. That property is
correct and must survive the refactor.

### Verified live state

`GET https://roulerodrig.com/api/health` → `"email": "brevo"`, commit `f2d7465f`.

**Production runs on Brevo. `RESEND_API_KEY` is not set in Vercel.** The Resend
branch is written, reviewed, and dead. Config resolution order for Brevo:
`app_secrets` table (admin-editable, no redeploy) → env fallback →
[lib/email.ts:349](../lib/email.ts).

---

## 2. Current Brevo usage

Three distinct uses, two of them invisible to the application:

| Use | Mechanism | Counts against 300/day | App can see it |
|---|---|---|---|
| Transactional sends | `POST /v3/smtp/email` | Yes | Yes |
| Contact/list sync | `POST /v3/contacts` | No (not a send) | Yes |
| **Supabase Auth emails** | **SMTP relay** | **Yes** | **No** |
| Owner's Brevo automations | list-triggered, built in Brevo UI | Yes | No |

The last two are the important ones. Brevo's free 300/day is **shared across
marketing, transactional API, and SMTP relay** — so password resets, signup
confirmations, and any automation the owner built inside Brevo's UI all draw from
the same bucket the app is spending, and the app cannot count them.

`brevoRemindersEnabled()` ([lib/email.ts:344](../lib/email.ts)) exists because of
this overlap: when a `brevo_list_id` is configured the built-in cron *skips* the
customer pickup/return reminders, on the assumption the owner built Brevo
automations to send them instead. That is a real duplicate-suppression mechanism
whose switch lives in a third-party UI, and nothing in the codebase can verify
which side is actually sending.

---

## 3–7. Every email type discovered

18 distinct emails. None of them has a type identifier today — the "type" is
which function you called.

**Vehicle rentals** (`bookings`) — up to **7 emails per booking**
| Email | Recipient | Trigger |
|---|---|---|
| Booking request confirmation (+ .ics) | customer | `POST /api/bookings` |
| New booking alert | owner | same |
| Pickup reminder | customer | cron, day before |
| Deliver-tomorrow | owner | cron, day before |
| Return reminder | customer | cron, day before |
| Collect-tomorrow | owner | cron, day before |
| Feedback request | customer | cron, day after |
| Vehicle-unavailable notice | customer | PayPal capture race loss |

**Accommodation / activities** (`place_bookings`) — up to **5 per reservation**
Reservation confirmation (customer), new-reservation alert (owner), reminder
(customer), reservation-tomorrow (owner), feedback request (customer).

**Marketplace** (`orders`) — **4 typical, 6 worst case, per order**
| Email | Recipient | Trigger |
|---|---|---|
| Order placed | customer | `POST /api/checkout` |
| New order | **each merchant staff member** | same (fan-out ×N) |
| Order accepted | customer | merchant accept |
| Payment confirmed | customer | merchant confirm-payment |
| Reservation ending soon | customer | cron, bank transfer only |
| Order expired | customer | cron sweep |

**Account / security** — **not in the application.** Supabase Auth owns signup
confirmation, password reset, magic link, and email change. They are unroutable
by any application-level router (§14, correction 3).

**Ticketing** — **zero. Does not exist yet.** `events` table is empty (0 rows);
there is no `tickets` table in any of the 118 migrations; no QR delivery, no
organiser notification, no check-in email. M33/M34 built the *sellable* half
only. A ticket order today would emit ordinary marketplace order emails, because
an event is a store and a ticket type is a product variant.

**Other** — enquiry auto-reply, waitlist/saved-list welcome, Ti Roulé weekly
digest to owner (Mondays), admin test send.

**Marketing** — no campaign code in the repo. Campaigns are composed in Brevo's
UI against the synced contact list.

---

## 8. Current email templates

One shared design system inside `lib/email.ts`: `shell()` (dark header, gold
rule, footer) composed from `paragraph()`, `sectionLabel()`, `detailCard()`,
`rows()`, `checkList()`, `primaryButton()`, `waButton()`, `sepFr()`, plus
`preheader()` for inbox preview text. Customer-facing mail is bilingual EN/FR
with a `· FRANÇAIS ·` divider; owner mail is English only.

Quality is genuinely good — inline styles, table layout, no external CSS, hidden
preheaders, `.ics` attachment on booking confirmations, Google Calendar links,
one-tap WhatsApp buttons, HTML-escaped user input in the marketplace path
([lib/notifications/order-placed.ts:40](../lib/notifications/order-placed.ts)).

**This is worth preserving as-is.** Templates are not the problem; delivery
infrastructure is. Recommendation: do not touch the template layer.

---

## 9. Current email delivery logging

**None.** This is the largest single gap.

- No `email_log`, `email_deliveries`, or equivalent table (grepped all 118 migrations)
- Provider message IDs are returned by both APIs and **discarded unread**
- `send()` returns `boolean`; most callers ignore even that
- Failures go to `console.error` → Vercel runtime logs, retained ~1 day on Hobby
- The `notifications` table logs *in-app* notifications only (10 rows), never email

Consequence: there is no way to answer "was this customer emailed?" — not for
support, not for reconciliation, not for a quota counter. **A quota system cannot
be built on top of nothing; the log is the prerequisite.**

---

## 10. Current retry behaviour

**No retry mechanism exists.** A failed send is lost permanently.

Two partial compensations, both accidental rather than designed:

1. **The cron's flag discipline** ([app/api/cron/reminders/route.ts:84](../app/api/cron/reminders/route.ts)) — `pickup_reminded` is only stamped when the send *succeeded*, so a failure retries naturally on tomorrow's run. Correct and deliberate, but the retry latency is 24 hours, and by then a "your rental is tomorrow" email is wrong.
2. **The M17 claim release** — a failed order-placed notification hands its claim back, so the order reappears in the `notified_at is null` sweep.

Every other path — booking confirmation, enquiry ack, waitlist welcome, order
accepted/payment-confirmed, expiry notice — has exactly one attempt and no record
that it happened.

Transient vs permanent failures are not distinguished anywhere. A 429 rate-limit
and a hard-bounced address are handled identically: `return false`.

---

## 11. Current duplicate-prevention behaviour

Better than expected in one place, absent everywhere else.

| Flow | Mechanism | Strength |
|---|---|---|
| Marketplace order placed | `claim_order_notification()` — atomic SQL `UPDATE … returning`, exactly one caller wins ([m17 migration](../supabase/migrations/20260806194533_m17_order_notification_claim.sql)) | **Strong.** Survives concurrent submits, retries, crashes |
| Cron reminders | boolean flags `pickup_reminded`, `return_reminded`, `feedback_reminded`, `reminded` | Adequate for a once-daily job |
| Payment-due reminder | `expiry_reminded_at` stamped *before* sending ([cron:214](../app/api/cron/reminders/route.ts)) — deliberately prefers one lost email over daily spam | Good reasoning |
| Checkout | `20260806104726_m10_checkout_idempotency.sql` — dedupes the *order*, so the email inherits it | Indirect but effective |
| **Booking confirmation** | **none** | Double POST ⇒ two emails |
| **Place-booking confirmation** | **none** | Double POST ⇒ two emails |
| **Enquiry ack / waitlist welcome** | **none** | Resubmit ⇒ duplicate |
| **Order accepted / payment confirmed / expired** | **none** | Retried request ⇒ duplicate |

There is no generic idempotency key concept for email. M17's claim is
order-specific: it lives in an `orders` column, not a reusable table.

---

## 12. Current security posture

**Clean. No credential exposure found.**

- No `NEXT_PUBLIC_*` variable references any mail provider (grepped `app`, `components`, `lib`)
- No client component imports `@/lib/email`, directly or transitively
- Keys are read only inside `send()` / `getBrevoConfig()`, both server-path
- Admin GET returns `apikeyHint: "••••" + key.slice(-4)` and a boolean — never the key ([app/api/admin/email/route.ts:29](../app/api/admin/email/route.ts))
- `/api/health` reports the provider **name** only, never keys or sender addresses
- Error logs print status codes and response bodies, never the request headers that carry the key
- Brevo key format is validated (`xkeysib-`) before storage; the base64 blob Brevo shows on creation is decoded server-side

Three findings, all minor:

1. **`lib/email.ts` lacks `import "server-only"`.** Its sibling `lib/notifications/dispatch.ts` has it. Nothing imports it client-side today, so this is defence-in-depth, not a live leak — but it is the one guard that would make a future mistake a build error instead of a bundled API key.
2. **API keys live in `app_secrets` as plaintext.** Acceptable — the table is service-role-only and this is the deliberate no-redeploy design — but worth stating plainly: a service-role key compromise is also a mail-provider compromise.
3. **`onboarding@resend.dev` fallback** ([lib/email.ts:479](../lib/email.ts)) is a live trap, covered in §14.

### Marketing-consent finding (§18 of the brief)

**Every booking with an email address is pushed into the Brevo marketing list,
with no consent check.** [app/api/bookings/route.ts:280](../app/api/bookings/route.ts)
and [app/api/place-bookings/route.ts:195](../app/api/place-bookings/route.ts)
call `upsertBrevoContact()` unconditionally, which posts `listIds: [listId]`.

The list is dual-purpose: it triggers lifecycle automations *and* is the audience
a campaign would be sent to. So the moment the owner sends a promotional campaign
to that list, every customer who ever booked receives it — having only ever
booked a scooter. That is precisely the transactional-implies-marketing coupling
the brief forbids, and under GDPR it is a real exposure, not a style issue.

`/api/waitlist` is fine — that one *is* an opt-in.

---

## 13. Files involved

| File | Role |
|---|---|
[lib/email.ts](../lib/email.ts) | 1,065 lines. Provider switch + 14 senders + template system. **The file to refactor.**
[lib/notifications/dispatch.ts](../lib/notifications/dispatch.ts) | Multi-channel fan-out (email/whatsapp/web-push/mobile-push). Channel abstraction already exists.
[lib/notifications/order-placed.ts](../lib/notifications/order-placed.ts) | M17 claim → notify → release-on-failure.
[lib/notifications/order-events.ts](../lib/notifications/order-events.ts) | Customer lifecycle emails.
[lib/whatsapp.ts](../lib/whatsapp.ts) | CallMeBot owner alerts. **Reuse for quota alerts** (§14 of the brief).
[app/api/cron/reminders/route.ts](../app/api/cron/reminders/route.ts) | Daily job, ~10 email types. Natural home for a quota-reconcile pass.
[app/api/admin/email/route.ts](../app/api/admin/email/route.ts) | GET/PUT settings + POST test send.
[app/admin/AdminDashboard.tsx:5798](../app/admin/AdminDashboard.tsx) | "Alerts & Email" tab. **Where the quota panel belongs** — no new dashboard needed.
[app/api/health/route.ts:121](../app/api/health/route.ts) | Reports provider name. Extend with quota state.
[docs/supabase-auth-emails.md](supabase-auth-emails.md) | The auth-email/SMTP setup. Explains the shared-bucket problem.
`app/api/{bookings,place-bookings,contact,waitlist,checkout}/route.ts`, `app/api/merchant/orders/[id]/{,accept,confirm-payment}/route.ts`, `app/api/paypal/capture-order/route.ts` | Call sites. Should not need changing if the abstraction is done right.
`supabase/migrations/20260808330000_m33_event_foundation.sql`, `…340000_m34_ticket_types.sql` | Define what an event is. Source of the "active ticketing" predicate.

---

## 14. Problems discovered

Ordered by what they cost you.

### 🔴 P1 — Setting `RESEND_API_KEY` in Vercel today would break all customer email

Not "change the provider" — **break it.** Two faults compound:

1. `send()` returns from inside the Resend branch, so one env var silently moves 100% of traffic off Brevo.
2. If `RESEND_FROM` is not *also* set, the from-address falls back to `onboarding@resend.dev` — a shared Resend test sender that **can only deliver to the Resend account owner's own address.** Every customer email would be rejected.

And because `send()` never throws, the failure is silent: bookings still succeed,
`/api/health` still reports `"ok"`, and the only symptom is customers not
receiving anything.

**Do not add `RESEND_API_KEY` to Vercel until the router ships.** This is the
single most important line in the audit.

### 🔴 P2 — Resend's free tier has a **daily** cap of 100, not just 3,000/month

The brief models Resend as monthly-only and Brevo as daily-only. Verified against
Resend's pricing page: **free is 3,000/month AND 100/day.** Both providers are
daily-capped, and Resend's daily ceiling is *three times tighter* than Brevo's.

Consequences:
- Combined free capacity is **400 emails/day**, not 12,000/month. The daily gate binds long before the monthly one.
- A "1,500 ticketing reserve" — or 300, or 500 — is incoherent against a 100/day bucket. **Reserves must be expressed per-day**, in the same unit as the ceiling that binds.
- Resend free also allows **1 verified domain**.

### 🔴 P3 — Auth emails are unroutable and uncountable, and they share Brevo's bucket

Password reset and signup confirmation are sent by Supabase Auth over Brevo's
SMTP relay. The application never sees them. So:

- They **cannot** be routed to Resend by any application-level router. The only way to move them is to change Supabase's SMTP settings — a dashboard action, all-or-nothing.
- They **consume Brevo's 300/day** alongside the app's sends.
- Any counter built purely from app-side sends will **under-count Brevo** and report headroom that does not exist.

This is the strongest single argument in the whole audit for how to route: the
most critical mail on the platform (password reset) sits in a bucket the app is
also spending, and the app cannot see the balance.

### 🟠 P4 — No delivery log

§9. Blocks quota counting, support lookups, reconciliation, and the observability
table the brief asks for. Prerequisite for everything else.

### 🟠 P5 — Idempotency covers one flow out of eight

§11. Booking confirmations, place bookings, enquiry acks, waitlist welcomes and
three of four order-lifecycle emails will duplicate on a retried request.

### 🟠 P6 — Transactional booking implies marketing subscription

§12. Consent exposure. Independent of the dual-provider work and worth fixing
regardless.

### 🟡 P7 — No retry, no transient/permanent distinction

§10. A 429 and a hard bounce are treated identically.

### 🟡 P8 — Duplicate-suppression switch lives in Brevo's UI

`brevoRemindersEnabled()` decides whether the cron sends reminders based on
whether a list ID is set — a proxy for "the owner built automations in Brevo".
Nothing can verify that. If the list is set but no automation exists, customers
get **no** reminder; if both fire, they get **two**.

### 🟡 P9 — `lib/email.ts` has no `server-only` guard

§12, finding 1.

---

## 15. Recommended architecture

### The finding that should shape the decision

**Current production email volume is approximately 30 emails per month.**

Measured against the live database on 2026-08-08:

| Table | Total rows | Last 30 days |
|---|---|---|
| `bookings` | 2 | 2 |
| `orders` | 3 | 3 |
| `place_bookings` | 0 | 0 |
| `contact_submissions` | 0 | 0 |
| `waitlist` | 0 | 0 |
| `events` | **0** | 0 |
| `stores` | 1 | 1 |

Applying the real fan-out: 2 bookings × 7 + 3 orders × 4 + ~4 digests ≈ **30
emails/month**, against a combined free capacity of ~12,000/month (400/day).
**You are at roughly 0.25% of quota.** Brevo alone has ~10× headroom for a 10×
launch.

This does not make the project wrong — it makes the *ordering* matter. The parts
that pay for themselves immediately are the ones that are cheap now and
expensive to retrofit: the central router, the delivery log, per-type routing
config, and idempotency keys. The parts with no current job are the forecasting
and dynamic-reserve machinery — they would be code with no traffic to manage,
which is what §17 and §39 of your brief warn against.

**And the honest ceiling finding:** a real ticketed event breaks the free tiers
regardless of how clever the reserve is. A 200-seat event selling out in one day
at 2 emails per ticket = 400 emails = **100% of both providers' combined daily
capacity**, leaving nothing for password resets or marketplace orders. No
reservation algorithm creates capacity. When ticketing goes live for real, the
answer is Brevo Starter (~$9/month, removes the daily cap) — and the quota
dashboard's real job is to tell you *when* that day arrives, before a customer
does.

### Recommended design

**A. Central router — `lib/email/send.ts`**

```ts
sendTransactionalEmail({
  type: "marketplace_order_confirmation",  // typed enum
  to, subject, html,
  idempotencyKey: "marketplace_order_confirmation:{orderId}",
  relatedType: "order", relatedId: orderId,
})
```

Resolves: type → category → priority → preferred provider → quota check →
reserve check → idempotency check → send → log. `lib/email.ts` keeps every
template and sender; its `send()` is replaced by a call into the router. **Call
sites do not change** — that is the test of whether the abstraction is right.

**B. Provider registry** — Resend and Brevo behind one `EmailProvider` interface
(`send()`, `quota()`, `health()`). Both already exist as inline fetch calls; this
extracts them. Adding a third provider later touches one file.

**C. Routing table in config, not in code** — `email_routing` rows or an
`app_secrets` JSON blob, admin-editable, with a code default. Changing
`ticket_qr_delivery` from Resend to Brevo becomes a config edit.

**D. `email_log` table** — the prerequisite. Fields per §19 of the brief, plus a
`unique` index on `idempotency_key` so the database enforces exactly-once rather
than application code checking first (which races). Quota counters become
`count(*) where provider = ? and sent_at >= ?` — derived, never a mutable
counter that can drift.

**E. Quota model — track BOTH windows for BOTH providers**

| | Resend | Brevo |
|---|---|---|
| Daily ceiling | **100** (configurable) | **300** (configurable) |
| Monthly ceiling | 3,000 (configurable) | — (derived, informational) |
| Binding constraint | daily | daily |
| Blind spot | none | **Supabase Auth SMTP + owner's Brevo automations** |

Brevo's counter must be presented as a **floor, not a total** — "at least N of
300 used; auth and automation sends are not visible here." A dashboard that
implies precision it cannot have is worse than one that admits the gap. Where
Brevo's API exposes authoritative usage, reconcile against it in the daily cron
and show the drift.

**F. Recommended initial routing** — and the reasoning, per §6 of the brief

| Category | Provider | Why |
|---|---|---|
| Account/security (auth) | **Brevo (SMTP, unchangeable)** | Not application-routable. Reserve headroom for it. |
| Ticketing (all) | **Resend** | Isolate the burstiest, most critical stream in its own bucket so marketplace volume cannot starve it. This is the reserve, structurally. |
| Marketplace (all) | **Brevo** | Highest expected volume → largest bucket (300/day vs 100/day). |
| Vehicle rentals | **Brevo** | Moderate volume, domain already authenticated, currently working. Don't move what works. |
| Accommodation / activities | **Brevo** | Lowest volume. |
| Owner/internal alerts | **Brevo** | Low volume, low criticality — a missed owner alert is backed by WhatsApp. |
| Marketing | **Brevo** | Contact management, campaigns, unsubscribe all live there. |

Note this **inverts** the brief's draft (marketplace → Resend). The reason is
P2: Resend's 100/day is the *smaller* bucket, so it cannot host the highest-volume
category. Put the big stream on the big bucket, and use the small isolated bucket
as the protected lane for the critical one. Overflow rule: once Brevo passes the
warning threshold, `normal` and `low` priority traffic spills to Resend's
flexible portion. `critical` is never blocked by a reserve.

**G. Conditional ticketing reserve — the exact predicate, from the schema**

"Active ticketing" is not a guess; M33 defines it:

```sql
exists (
  select 1 from events e join stores s on s.id = e.store_id
  where s.status = 'active'          -- published (draft is unpurchasable by construction)
    and e.cancelled_at is null       -- M33: cancellation is a fact with a time
    and coalesce(e.ends_at, e.starts_at) >= now()   -- not yet over
)
```

- **No active event** → reserve is 0. Resend's full 100/day joins the flexible pool.
- **Active event** → reserve `ticketing_reserve_daily` (recommended initial: **40/day**, ~40% of Resend's daily bucket) protected from non-ticketing traffic.
- **Event ends** → the predicate goes false on its own. Nothing to release; the reserve simply stops applying. No cleanup job, no stale lock.
- **Reserve insufficient** → compare reserve against unsold `stock_quantity` across active events' ticket variants × emails-per-ticket. If demand > reserve, warn. This uses only data that already exists — no forecasting model.

Today the predicate is trivially false (0 events), which is exactly the
behaviour §10 of the brief asks for: no capacity locked for a business line that
isn't running.

**H. Fallback — narrow and explicit**, per §15 of the brief. Classify the failure
before deciding:

| Failure | Fallback? |
|---|---|
| Network error / timeout **before** a response | **No** — acceptance unknown. Log `unknown`, reconcile via provider message ID. Never blind-retry to the other provider. |
| 4xx explicit rejection (bad payload, unverified sender) | **No** — the other provider fails the same way. Log permanent. |
| 401/403 auth failure | **No** — alert the owner; this is a config fault. |
| 429 / 5xx | **Retry same provider** with backoff, bounded attempts. |
| Quota exhausted | **Yes** — the only clean fallback case. Nothing was sent, so nothing can duplicate. |
| Invalid recipient | **No** — terminal. |

**I. Alerts — reuse `sendOwnerWhatsApp()`.** It already exists, is free, and
reaches the owner faster than email — which matters, because the thing being
alerted about is email. Do not build a second notification system.

**J. Priority** — `critical` (auth, ticket QR, payment confirmation) /
`high` (order + booking confirmations) / `normal` (reminders) / `low` (digests,
marketing). Reserves and thresholds may throttle `normal` and `low`. `critical`
is never blocked — a protected reserve that stops a password reset has inverted
its own purpose.

### Recommended migrations

1. `email_log` — the log, with `unique(idempotency_key)` and indexes on `(provider, sent_at)` and `(related_type, related_id)`. Service-role only; no anon policy.
2. `email_routing` *or* an `app_secrets` JSON blob — routing + limits + thresholds + reserve. A table is cleaner for per-type rows; `app_secrets` reuses the existing admin-settings pattern and needs no new RLS.

Both additive. No destructive change. No existing table altered.

### Recommended sequencing

| Phase | Work | Risk |
|---|---|---|
| 2 | `email_log` + central router, single provider (Brevo), every send logged and idempotent. Behaviour identical; now observable. | Low |
| 3 | Resend as a second registered provider + routing config. **Only now is it safe to set `RESEND_API_KEY`.** Verify domain first. | Low |
| 4 | Quota counters, thresholds, admin panel, WhatsApp alerts, `/api/health` extension. | Low |
| 5 | Ticketing reserve — best done *with* the ticketing build, since the emails it protects don't exist yet. | Low |
| — | Deferred: forecasting, dynamic reserve sizing, emergency pool. Revisit when daily volume exceeds ~100. | — |

Fix P6 (marketing consent) in Phase 2 — it is independent and a real exposure.

---

## Manual actions you will eventually need to take

Full click-by-click steps come with the phase that needs them. Summary so you can
plan:

1. **Do nothing about `RESEND_API_KEY` yet** (P1). Adding it now breaks email.
2. **Create a Resend account** and verify `roulerodrig.com` — DNS records at Cloudflare (SPF/DKIM). Coexists with Brevo's records; both can authenticate the same domain. Free tier allows exactly 1 domain, so use the apex.
3. **Confirm whether Supabase custom SMTP is actually enabled** ([docs/supabase-auth-emails.md](supabase-auth-emails.md) Fault 2). If not, auth email is still on Supabase's rate-limited shared service and password resets can fail silently. This is a launch blocker independent of this project, and I could not verify it from the codebase.
4. **Decide the marketing-consent fix** (P6): stop adding bookers to the list, or add a consent checkbox at booking, or split into a transactional-only list.
5. **Budget decision, when ticketing launches**: Brevo Starter ~$9/month removes the daily cap. Free tiers cannot carry a real event.

---

# Phase 2–4 — what was built (M41)

Implemented after the audit was approved. Scope decision: foundation + quota and
alerts; forecasting and dynamic reserve sizing deferred, but the reserve itself is
configurable from day one so neither needs restructuring later.

## Architecture

```
business logic (unchanged call sites)
        │  sendTransactionalEmail({ type, to, subject, html, idempotencyKey })
        ▼
lib/email/send.ts ── the ONLY exit
  1. type → category + priority          lib/email/types.ts   (57 types)
  2. claim idempotency key               lib/email/log.ts     (Postgres UNIQUE)
  3. candidate providers                 lib/email/config.ts  (routing table)
  4. quota + reserve check               lib/email/quota.ts   (pure policy)
  5. send, retry transient only          lib/email/providers/*
  6. record outcome, alert a human       lib/email/alerts.ts  (WhatsApp)
```

`lib/email.ts` keeps all 18 templates and every export it had; its `send()` is now
a thin adapter onto the router. **No API route or cron call site changed shape** —
that was the test of whether the abstraction was right.

## Routing (defaults, all configurable)

| Category | Provider | Why |
|---|---|---|
| Ticketing (8 types) | **Resend** | Burstiest and most critical; isolated in a bucket the app owns entirely, so marketplace volume cannot starve a ticket QR. |
| Marketplace (8) | **Brevo** | Highest expected volume → the larger bucket (300/day vs 100/day). |
| Scooter + car rentals (12) | **Brevo** | Moderate volume, domain already authenticated, currently working. |
| Accommodation + activities (11) | **Brevo** | Lowest volume. |
| Account/security (3) | Brevo (SMTP) | Not application-routable — declared, not sent by us. |
| Operational (8) | **Brevo** | Owner mail is backed by a WhatsApp ping. |
| Marketing (4) | **Brevo** | Contacts, campaigns and unsubscribe all live there. |

Changing one is a settings edit: `ticket_qr_delivery → brevo` is a row in the
routing table, asserted by a test.

## Quota and reserve

Usage is **derived** from `email_log` (`count(*) where provider = ? and sent_at >= window`),
never a stored counter — a counter drifts the first time a process dies mid-send.
Windows are **UTC**, matching the providers' own reset, not island time.

Reserve behaviour, per the exact M33 predicate (`stores.status='active'` +
`cancelled_at is null` + `coalesce(ends_at, starts_at) >= now()`):

| State | Effect |
|---|---|
| No active event (**today: 0 events**) | Reserve is 0. Resend's full 100/day is available to everyone. |
| Event on sale | 40/day + 300/month held back from non-ticketing traffic. |
| Several events | Same reserve; the estimate sums unsold capacity across all of them. |
| Reserve insufficient | Warned in the dashboard and once-per-day on WhatsApp, comparing unsold `stock_quantity` × 2 against the reserve. |
| Event ends | Predicate goes false on its own. **No cleanup job** — nothing was ever locked. |

`critical` priority is never blocked by a reserve, only by a real ceiling. That
invariant is asserted directly, because a reserve that stops a password reset has
inverted its own purpose.

## Fallback

Only on `quota` — the one class where nothing was accepted and the other provider
has a different answer. `auth`/`permanent`/`invalid` fail identically elsewhere;
`unknown` may already have been delivered and is **never** retried or failed over,
only recorded for reconciliation against `provider_message_id`.

## Test results

`npm test` — **26 files, 344 tests, all passing** (254 pre-existing, 90 new).
`npm run build` — clean. `npx eslint` on the touched paths — no errors.

Verified against the live database, not just in mocks:
- duplicate `idempotency_key` → `unique_violation` raised; multiple NULL keys still legal
- anon `INSERT` into `email_log` → **HTTP 401**, RLS violation
- anon `SELECT` → empty
- the ticketing-predicate PostgREST filter → HTTP 200 (valid syntax, 0 events)
- `/api/health` → new `emailQuota` field present, no crash
- `/api/admin/email` GET and PATCH → 401 unauthenticated

## Files

**New:** `lib/email/{types,config,quota,log,send,alerts}.ts`,
`lib/email/providers/{types,resend,brevo}.ts`,
`supabase/migrations/20260808410000_m41_email_log.sql`, five test files.

**Changed:** `lib/email.ts` (send → router, marketing consent, idempotency keys),
`lib/vehicle-name.ts` (+`vehicleCategory`), `lib/notifications/{dispatch,order-placed,order-events}.ts`,
`app/api/admin/email/route.ts`, `app/api/health/route.ts`,
`app/api/cron/reminders/route.ts`, `app/api/{bookings,place-bookings,waitlist}/route.ts`,
`app/api/merchant/orders/[id]/route.ts`, `app/admin/AdminDashboard.tsx`, `.env.example`.

## Database

One additive migration. `email_log` + five indexes, RLS enabled with no policies
(service-role only, M22 convention). `unique(idempotency_key)`, nullable so
ad-hoc sends are unconstrained. No existing table altered, nothing destructive.
Settings live in `app_secrets` under `email_config` / `email_alert_state`, reusing
the table that already has the right posture.

## Corrections to the audit, found while building

- **P8 was overstated.** `brevoRemindersEnabled()` is declared but called from
  nowhere in the repo. The documented "Brevo automations take over the reminders"
  behaviour has therefore never happened — the cron has always sent them. The
  duplicate risk is theoretical until something reads it. It now keys on the
  transactional list, which is the list a booker actually joins.
- **Two types were miscounted as unbuilt.** `marketplace_pickup_ready` and
  `marketplace_order_completed` *are* emitted, via the generic merchant
  status-change path. The audit's "18 emails" undercounts because that one call
  site produces several distinct messages.

## Still outstanding — yours

1. **Resend is safe to add now, and needs two variables, not one.** `RESEND_API_KEY` *and* `RESEND_FROM` on a verified domain. With only the key, Resend reports itself unconfigured and the router keeps using Brevo — no silent breakage either way.
2. **Confirm Supabase custom SMTP is actually on** ([supabase-auth-emails.md](supabase-auth-emails.md) Fault 2). Unverifiable from the codebase, and if it is off, password resets are on Supabase's rate-limited shared service and can fail silently.
3. **Create the second Brevo list** and paste both IDs in Admin → Alerts & Email. Until a transactional list exists, bookers sync as contacts with no list — attributes still work, automations keyed on list membership do not. The safe failure direction.
4. **Budget decision when ticketing launches.** Free tiers cap the platform at ~400 emails/day combined. A 200-seat event selling out in a day is 400 emails on its own.

## Sources for the quota facts

- [Resend pricing](https://resend.com/pricing) — free: 3,000/month, **100/day**, 1 domain
- [Resend account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- [Brevo free plan — 300/day shared across marketing and transactional](https://www.emailtooltester.com/en/reviews/brevo/pricing/)
- [Brevo free SMTP server — 300/day](https://www.brevo.com/free-smtp-server/)
