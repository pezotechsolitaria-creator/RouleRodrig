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

### Why two entry points, honestly

`notify()` owns in-app + push + WhatsApp. Email still flows through
`dispatchNotification`. That is deliberate and temporary: the email router
already has provider failover and idempotency, and twelve call sites use it.
Routing email through the engine too would mean either duplicating that router
or double-sending from every one of those sites. **Migrating them is the next
step, not a finished one.** Until then: if your event needs email, call
`dispatchNotification`; if it needs in-app/push/WhatsApp, call `notify`.

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
2. **The admin has no in-app feed.** `platform_admins` is empty — the owner
   authenticates with the `ADMIN_PASSWORD` cookie, so there is no `auth.uid()`
   to address a row to. An admin operations centre must query with the service
   role in `/admin`, not through `recipient_id`. Admin alerts currently reach
   the owner by WhatsApp.

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

> **This is the single point of failure in the system.** If that external
> account lapses, WhatsApp and delivery escalation stop silently. Nothing
> currently monitors it.

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
