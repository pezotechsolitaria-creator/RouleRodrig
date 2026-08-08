# Production checklist — Roulé Rodrigues Marketplace

State at commit `a7f4af7`. **31 commits unpushed. Nothing deployed.**

Every claim here was verified against the live database or a production build
during this session. Items I could not verify are marked **UNVERIFIED**.

---

## 1. Launch recommendation

### NO-GO

Not because the code is bad — the transaction lifecycle is sound and every
security defect found this session is fixed and proven. It is NO-GO because
**a merchant is never told an order exists.**

M13 gave merchants a 7-day window to accept an order. M15 gave them the button.
Nothing sends them an email. `dispatchNotification()` has exactly one production
call site (`app/api/merchant/orders/[id]/route.ts:146`, a status change), and
`app/api/checkout/route.ts` notifies nobody. The DB writes an in-app row; a
merchant sees it only if they happen to open the dashboard.

A marketplace where orders arrive silently and expire after a week is not
launchable, regardless of how good the checkout is.

---

## 2. Blocking work, in order

| # | Item | Why it blocks | Owner |
|---|---|---|---|
| 1 | `replayed` flag on `create_order` | Prerequisite for notifications. On an idempotent retry `create_order` returns the same payload **indistinguishably from a first creation**, so naively dispatching on success double-sends to both parties. | engineer |
| 2 | Order-placement notifications | See §1. | engineer |
| 3 | Approve one merchant | `stores_active = 0`. Blocks browser verification, E2E walkthrough and any real notification test. | **owner** |
| 4 | `CRON_SECRET` in Vercel | The cron guard now fails **closed**. Unset ⇒ daily reminders stop (503). | **owner** |
| 5 | `RESEND_API_KEY` / `RESEND_FROM` | Email is the only channel that reaches a merchant. Unset ⇒ notifications silently no-op. | **owner** |
| 6 | `TEST_*` CI secrets | 30 E2E tests skip; they cover price tampering, oversell, cross-tenant IDOR. | **owner** |
| 7 | CI gate on deploy | `vercel.json` has only a `crons` array. `git push origin main` ships a red build. | **owner** |
| 8 | Marketplace discovery (`/shop`) | No index page, no nav entry, no sitemap entry. `browse_stores()` RPC is built and tested; the UI is not. | engineer |

Items 1–2 must land before 3–5 can be tested end to end.

---

## 3. Deployment steps

1. `npm run build` — must pass locally. The build validates required env vars
   (`next.config.ts`), so a missing `NEXT_PUBLIC_SUPABASE_URL` fails here rather
   than at a customer's checkout.
2. Confirm `public/sw.js` cache version. Currently **`rr-cache-v95`**, mirrored
   in `app/api/health/route.ts`. One bump covers all 31 unpushed commits; it has
   never been deployed, so **do not bump again**.
3. Confirm the owner actions in §2 are done.
4. `git push origin main` — Vercel auto-deploys. There is no separate step, and
   **nothing gates this on CI** (blocker 7).

---

## 4. Smoke tests after deploy

```bash
curl -s https://roulerodrig.com/api/health
```

Expect `"database":"ok"`, `"adminBackend":"configured"`, `"cron":"configured"`,
and `build.commit` matching the pushed SHA.

Then, by hand:

| Check | Expected |
|---|---|
| Guest booking lookup, real ref + email | resolves |
| Same ref with `email=%` | **404** (M11 wildcard bypass) |
| Upload an SVG to merchant media | rejected `415` (M11 bucket limits) |
| `GET /api/cron/reminders` without the bearer token | **401** (or 503 if unset) |
| Place a cash order | `auto_release_at` ≈ 7 days out |
| Merchant order detail | "Accept order" button present, countdown shown |

---

## 5. Environment variables

Full table in [TESTING.md](./TESTING.md). Production-critical:

| Variable | Unset ⇒ |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build fails |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build fails |
| `SUPABASE_SERVICE_ROLE_KEY` | 5 of 23 admin routes 503; the other 18 degrade confusingly |
| `SESSION_SECRET`, `ADMIN_PASSWORD` | no admin login |
| `CRON_SECRET` | **reminders stop** (fails closed) |
| `RESEND_API_KEY`, `RESEND_FROM` | all email silently not sent |
| `NEXT_PUBLIC_SITE_URL` | absolute links wrong in emails/SEO |

---

## 6. Rollback

Vercel → Deployments → previous → **Promote**.

Migrations 94–98 are additive — new functions, a new nullable column
(`orders.accepted_at`), a new settings column, and storage bucket limits. No
schema was dropped or altered, so they are safe to leave in place under a
rolled-back build. Rolling the *database* back is not required and not advised.

**Backup strategy: UNVERIFIED.** Supabase's automatic daily backups depend on
the project's plan tier, which I have not inspected. Confirm in the dashboard
before launch — a marketplace holding real orders needs a known RPO.

---

## 7. What is actually proven

Verified live this session, not inferred:

- Booking-lookup wildcard bypass closed; 10 assertions incl. `%`, `*`, `_`
- Cron fails closed (503 anonymous); 7 unit tests
- Storage buckets reject SVG/HTML `415` and oversize `413`, **ahead of RLS**
- Cash hold 168h / non-cash 48h; 6 malformed configs blocked `23514`
- Acceptance does **not** touch the payment record; accepted orders survive the
  sweep, unaccepted ones are released
- Checkout attacks refused: price/zone/fee tampering, closed shop, delivery
  window, payment method, stale quote, 5-way parallel submit

Gates: typecheck clean · **112/112** unit · production build clean ·
migrations **98 = 98** · E2E **26 passed / 30 skipped** (skips are config, and
CI fails on them by design).

---

## 8. Known gaps — not hidden

- Order placement emails nobody (blocker 2)
- Customer timeline has no **Accepted** step
- Customer/admin order APIs omit `accepted_at`
- `OrdersTable` mobile card omits the payment column
- ~~`qr_pickup_tokens` is never inserted — the pickup panel is permanently empty~~ — fixed in M28: a code is issued by trigger on `ready_for_pickup` and redeemed at `/api/merchant/pickup/redeem`
- No password reset for customers or merchants
- Customer notifications render nowhere in the UI
- `lib/logger.ts` imported nowhere; no structured logging or correlation id
- M15 merchant UI has **no browser verification** (blocked on blocker 3)
