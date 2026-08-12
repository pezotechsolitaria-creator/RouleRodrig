# Notifications

How Roulé Rodrigues tells people things. Read this before adding a notification
anywhere — the answer is almost always "add an entry to the registry", not
"call a send function".

## The shape

```
domain event  →  notify()  →  registry decides  →  channels  →  record
                                 (who / how loud / where)
```

- **`lib/notifications/registry.ts`** — every event type, its audience,
  category, priority, allowed channels, copy, and deep link. One entry per
  event. This is the only file you edit to add a notification.
- **`lib/notifications/engine.ts`** — `notify(type, target, ctx, { dedupeKey })`.
  Resolves the template, writes the in-app row, then pushes and queues WhatsApp.
- **`lib/notifications/dispatch.ts`** — the older router that owns **email**
  (Brevo → Resend failover, templates, per-recipient idempotency keys) and also
  carries a real web-push channel for customer order events.
- **`lib/notifications/queue.ts`** + `notification_jobs` — the WhatsApp queue.
  Drained by `/api/cron/notifications` every 60s.
- **`lib/push/send.ts`** — VAPID web push, plus dead-subscription pruning.

### One entry point, and a delegated email channel

`notify()` owns all four channels. Email is **delegated** to
`dispatchNotification` rather than reimplemented — that router already has
Brevo → Resend failover, the quota ceiling and per-recipient idempotency, and
duplicating it would give the platform two email paths that drift.

**Rich email is passed through, not flattened.** `opts.email` lets a caller
supply its own subject, body, detail rows and CTA. That is what made migrating
safe: the order lifecycle emails are hand-written per event, carry a total, and
choose their CTA based on whether the buyer is a guest — a guest cannot open
`/orders/[id]`, which filters on `customer_id = auth.uid()`. Collapsing that
into a registry one-liner would have been a visible downgrade to the most
valuable mail the marketplace sends. The registry still decides *whether* email
is allowed, the priority, and every other channel.

**Migrated so far:** `order-events.ts` — the customer order lifecycle
(`accepted`, `payment_confirmed`, `expired`, `payment_due`). Those four
previously reached **email only**; they now also produce an in-app entry and a
push.

**Still calling `dispatchNotification` directly:** `order-placed.ts` (3 sites)
and the two merchant/kitchen status routes. They work correctly; they simply
have not been moved yet. Move one at a time and check its `emailType`.

## Channels, and when each is right

| Channel | For | Never for |
|---|---|---|
| **In-app** | History and context. Everything lands here. | — |
| **Push** | Immediate attention. | Sole channel for money, tickets, or legal records |
| **Email** | A durable record the user can find in six months. | Progress updates, reminders, driver operations |
| **WhatsApp** | High-value local comms to people who opted in with their own CallMeBot key. | Anyone who hasn't personally activated a key |

**The email constraint is real, not stylistic.** Brevo (300/day) + Resend
(100/day) ≈ 400/day free, and Supabase's own auth mail spends the Brevo quota
invisibly. Emailing every status change exhausts it and takes password resets
down with it. `lib/notifications/registry.test.ts` enforces this — routine
progress events fail CI if someone adds `"email"` to them.

## Priority

`low | normal | high | critical`

`critical` is not decoration. It does two things:

1. **Ignores mute.** `emit_notification()` skips a muted category *unless* the
   priority is critical. Someone who silenced "payments" still learns their
   payment failed.
2. **Excludes the category from the preferences UI**, because
   `mutableCategories()` is generated from the registry. It is structurally
   impossible to ship a toggle that hides a failed payment.

## Push payload safety

A push renders on a locked screen anyone can read, and travels through Google's
and Apple's infrastructure. Templates for money, failure, and identity define a
separate `pushBody` that says less:

```ts
body:     (c) => `Your payment for ${ref(c)} is confirmed.`
pushBody: () => "Tap to view your order."
```

A test asserts no `pushBody` contains an amount.

## Idempotency

`notify()` **requires** a `dedupeKey`. The in-app insert has a partial unique
index on it, so:

- Cron runs twice → one row.
- Webhook retries → one row.
- When the insert reports the row already existed, **every other channel is
  skipped**, so a duplicate event cannot produce twenty pushes.

Key format: `<domain>:<event>:<id>`, e.g. `delivery:no-driver:<uuid>`.

Scheduled reminders in `/api/cron/reminders` use a second, older mechanism —
boolean columns (`pickup_reminded`, `return_reminded`) on the booking row. Both
are valid; prefer `dedupeKey` for new work.

## Database

| Table | Purpose |
|---|---|
| `notifications` | The in-app feed. `recipient_id` = `auth.uid()`. RLS: read own, mark own read. |
| `notification_preferences` | **Opt-out** rows (`user_id`, `category`). No row = on. |
| `push_subscriptions` | One row per device. `endpoint` is UNIQUE — that is what makes multi-device work and re-subscription idempotent. |
| `notification_jobs` | WhatsApp queue: `dedupe_key`, attempts, backoff. |
| `notification_slots` | Per-category CallMeBot numbers for the owner. |
| `driver_contact_channels` | Per-driver CallMeBot key. RLS with **zero policies** — service role only. |

### Two known architectural limits

1. **Guests get no in-app feed.** `notifications.recipient_id` is an auth user,
   and guest checkout is the default path. Guests get push (keyed on
   `contact_email`) and email; `/orders/track` is their history.
2. **The admin has no in-app *inbox*, by design.** `platform_admins` is empty —
   the owner authenticates with the `ADMIN_PASSWORD` cookie, so there is no
   `auth.uid()` to address a row to. Instead of faking one, `/admin/operations`
   derives the feed from live state with the service role. See below.

## Web push setup

Env vars (Vercel; `VAPID_SUBJECT` is optional and defaults):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT=mailto:contact@roulerodrig.com
```

Generate a pair with `node -e "console.log(require('web-push').generateVAPIDKeys())"`.
**Never rotate once devices have subscribed** — existing subscriptions bind to
the old public key and go permanently silent with no error.

Without the keys, `pushIsConfigured()` is false, the subscribe routes answer
503, and the UI toggles hide themselves rather than lying.

### Service worker

`public/sw.js` handles `push` and `notificationclick`. Both are defensive: a
throw inside `push` makes the browser show its own "site updated in the
background" notice, which tells the user nothing.

**Bump `const CACHE = "rr-cache-vNN"` on every deploy.**

### Subscription lifecycle

- **Multi-device** — one row per endpoint; phone, laptop and tablet coexist.
- **Re-subscribe** — the browser returns the same endpoint, so registration
  deletes-then-inserts and stays idempotent.
- **Device changes hands** — `register_push_subscription` re-homes the endpoint
  to the new user. RLS cannot express moving a row between users, which is why
  this is an RPC.
- **Expired/revoked** — a 404 or 410 from the push service deletes the row
  immediately; transient failures are left alone.

## Cron

Vercel's plan caps this project at **2 cron jobs, once-daily**:

| Path | Schedule | Does |
|---|---|---|
| `/api/cron/reminders` | `0 6 * * *` | Booking pickup/return/feedback reminders, order expiry |
| `/api/cron/posthog-health` | `30 7 * * *` | Analytics health |

The 60-second notification worker (`/api/cron/notifications`) therefore runs on
an **external pinger (cron-job.org)** with `CRON_SECRET`. It drains
`notification_jobs` and runs `sweep_delivery_escalations()`.

### Watching the watchman

That external pinger was the single point of failure: if it lapsed, WhatsApp and
delivery escalation stopped **silently**. It is now monitored:

1. The worker calls `record_heartbeat('notification_worker')` on every run.
2. The daily reminders cron calls `checkHeartbeats()`, which claims any
   heartbeat older than 15 minutes and WhatsApps the owner.

**`checkHeartbeats` sends inline, never through the queue.** The queue is
drained by the very worker being reported dead, so a queued alert about a dead
worker would never arrive. It is the one message in the system that bypasses the
queue by design. The claim also latches (`alerted_at`), so a week-long outage
produces one message a day rather than one per check.

The same staleness shows up as a CRITICAL row in the admin operations feed.

## Admin operations feed

`/admin/operations` — **derived from live state, not an inbox.**

An inbox was impossible here: `notifications.recipient_id` is an auth user,
`platform_admins` is empty, and the owner signs in with the `ADMIN_PASSWORD`
cookie, so there is no `auth.uid()` to address a row to. Building it that way
would have produced a panel that silently shows nothing forever.

Deriving is also simply better for one operator: nothing to mark read, and an
item disappears when the problem is actually fixed rather than when someone
clicks it. `admin_operations_feed()` reports, by severity:

- **Critical** — deliveries in `requires_admin`/`driver_unresponsive`/failed,
  deliveries searching for more than two offer windows, a stale worker heartbeat.
- **High** — payment proofs awaiting a decision, pending driver applications.
- **Notice** — WhatsApp jobs that exhausted their retries.

## Preferences

`mutableCategories()` in the registry generates the preferences screen, and
`/api/notifications/preferences` rejects any category not on that list. Because
the list excludes categories whose events are critical, **a toggle that hides a
failed payment cannot be built.** `emit_notification()` enforces the same rule
independently: it ignores mutes at critical priority.

## Adding a notification

1. Add an entry to `TEMPLATES` in `registry.ts`.
2. Call `notify("your.type", target, ctx, { dedupeKey })` from the place the
   domain event actually happens — not from a UI handler.
3. If it needs email, also call `dispatchNotification` (see above).

`npx vitest run lib/notifications` will fail if the entry breaks policy.

## Testing

- `lib/notifications/registry.test.ts` — policy: email restraint, push payload
  safety, priority rules, deep-link validity, empty-context rendering.
- `lib/notifications/dispatch.test.ts` — channel routing and idempotency.
- DB guarantees (idempotency, mute-vs-critical, cross-user isolation) are
  verified in rolled-back transactions; see the notes at the foot of each
  migration.

## Scaling

The shape holds well past this island. `notification_jobs` with
`FOR UPDATE SKIP LOCKED` is the right pattern into the millions of rows. At
100k+ users the changes are: run several workers instead of one cron, and
partition `notifications` by month. **Do not buy a notification SaaS** —
OneSignal or Knock would cost more than the business earns and add lock-in for
infrastructure that already exists here.
