# Production readiness — Roulé Rodrigues Marketplace

Prepared at commit `43a8a84`+ (release hardening pass). Nothing pushed.

---

## Completed fixes

### Stale quote protection — `RR012`

Server-derived pricing stops a client *dictating* a price. It does not stop a
customer being **charged a figure they never saw**. Reproduced end to end:

| Step | Result |
|---|---|
| Customer is quoted | subtotal 2000 + delivery 15000 = **17000** |
| Platform re-prices the Port Mathurin zone | 15000 → 50000 |
| Customer presses Place order | order created for **52000** |

Rs 170 shown, **Rs 520 charged**, silently. Under bank transfer this is the worst
case: the customer wires what they saw, the order says otherwise, the merchant
records a short payment and a human arbitrates. The same window opens on any
mid-checkout change — product price edit, zone fee change, tax settings.

`create_order` gained an optional `p_expected_total`. When it disagrees with the
derived total, the order is refused with `RR012` naming both figures, and the
form re-quotes. **Not a price lock** — the database still decides the price; it
just will not complete a purchase nobody agreed to.

*A bug in the first version of this fix:* the comparison was placed where
`v_total` is still `0`, so it refused the stale total for the wrong reason **and
refused the correct one**, which would have blocked every checkout. Caught by
testing the fix rather than trusting it.

### Payment / order ledger divergence

Two controls read "Confirm payment received": a prominent gold header button
(`update_order_status`) and one inside `PaymentConfirmCard`
(`confirm_order_payment`). Only the second captured the payment.

| Stage | State |
|---|---|
| Before | order `pending_payment` / payment `pending` |
| Tap header button | accepted |
| After | order **`paid`** / payment **still `pending`** |

Permanent: `confirm_order_payment` refuses non-pending orders and
`mark_order_paid` is revoked, so nothing in the app could repair it. Revenue keyed
on `captured` would undercount, and the merchant's own card kept reading
"pending" on a paid order.

Fixed at the root: `update_order_status` now captures the payment in the same
statement, under the lock it already holds. The two paths converge and cannot
diverge again. One pre-existing bad row was repaired. The duplicate button was
also removed — from the *forward list*, not just the label map, because the
label falls back to `Mark ${STATUS_LABEL}` and would have rendered "Mark Paid".

### Checkout idempotency

A dropped response on a mobile network produced a **second real order**: a second
48h stock reservation, a second payments row, a second merchant notification. On
a shop with one of something, the item immediately read as out of stock. A fast
double-tap did the same — `canSubmit` is a render-time constant, so a second
click can land before React commits the disabled state.

`orders.idempotency_key`, scoped to `(customer_id, key)` with a partial unique
index. Concurrency safety comes from a transaction-scoped advisory lock plus that
index — **not** a check-then-act, which would race. The replay returns *before*
any stock movement, payment insert or notification.

Verified through the real HTTP stack: **five simultaneous POSTs with one key →
all 200, one order, one payment, one stock movement (net −1), one notification.**

### Subscription renewals recording Rs 0.00

Traced: the API accepted an optional `amount`, defaulted it to `0`, and the admin
UI never sent one — and no plan price existed anywhere to fall back to. Added
`marketplace_settings.plan_prices` (minor units, CHECK-constrained), defaulted
the invoice from it, and gave the renewal control a pre-filled, overridable
amount prompt.

### Bank details could not be erased

Found by using the admin RPC to strip the test shop's fake details: the update
succeeded, bank transfer switched off, and `MCB / 000123456789` were still there.
`coalesce(patch, current)` conflated "field absent" with "explicitly null", so
nothing could ever be cleared. Beyond the cleanup this was a **retention
problem** — a merchant asking for their account number to be removed could not
have it removed. Now `patch ? 'field'` distinguishes the two.

---

### Migration recovery — a correction to an earlier finding

I originally recorded the 27-file gap between the ledger (93) and the repo (66)
as *"pre-M7 filenames use rounded timestamps… acceptable post-launch debt."*
**That was wrong.** The files were not misnamed. They were absent.

The 27 were the entire pre-marketplace foundation: `create_bookings_table`,
`create_place_bookings`, `create_taxi_drivers`, `create_partners_and_marketplace`,
`site_content_and_uploads_storage`, `app_secrets_table`, `create_lead_events`,
`create_owner_applications` — and critically
**`rls_lockdown_anon_least_privilege`** and **`lockdown_storage_uploads_bucket`**.

A fresh clone plus `supabase db reset` would have rebuilt the platform with no
bookings, no taxi, no site content — and **without the two migrations that take
the browser-shipped anon key down to least privilege**. The restored database
would have let the anon role read every booking, every contact submission and
every partner record, and upload into storage. That is the live rentals/tourism
half of the business, not the marketplace.

All 27 were reconstructed from the ledger's own `statements` array and verified
byte-for-byte under the normalised hash: **27/27 match, 0 mismatches.** Local
count is now 93, exactly matching the ledger. The repo can rebuild production
from scratch again.

The lesson worth keeping: "pre-existing" is not a synonym for "safe", and a
count that does not reconcile deserves to be reconciled rather than explained
away.

## Security validation

| Area | Status |
|---|---|
| RLS | Row access verified per role. **A visibility-based policy is not an authorization policy** — `store_is_visible()` in a SELECT policy meant every signed-in user could read every shop's bank details. Now scoped to an actual order relationship. |
| Column grants | `orders.internal_notes` and the bank columns withheld via per-column grants + SECURITY DEFINER accessors. A column-level REVOKE is a no-op under a table grant — verified by attempting the read as the target role. |
| `TRUNCATE` | Revoked from `anon`/`authenticated` on all 36 tables. RLS does not constrain TRUNCATE, so it was the one verb where RLS was not the last line of defence. Defence-in-depth: PostgREST cannot emit it. |
| Checkout attacks | Price tampering, zone tampering, closed-shop bypass, delivery-window bypass, payment-method bypass, stale quote, double submit, 5-way parallel submit — all refused. |
| Merchant isolation | Cross-shop writes refused (`RR003`, identical message to "not found" so store ids cannot be probed). Admin doors and internal writers unreachable from a customer session (`42501`). |
| Time manipulation | `store_schedule_at` (the time-injectable core) is revoked from all app roles — a customer cannot claim it is Monday noon. |
| Admin degradation | Without a service-role key, admin routes return an honest **503**, not a confusing 500 or half-working reads. |

---

## Testing

| Suite | Result |
|---|---|
| Unit | **101 / 101** |
| E2E runnable | **26 / 26** |
| E2E skipped | **30 — assert nothing. Not counted as passing.** |
| Typecheck | clean |
| Build | clean |
| Migration ledger | 95 local files, 95 ledger entries, each hash-verified |

> Counts updated after the M11 security pass. Unit rose 94 → 101 (`cron-auth`).
> E2E moved 29/27 → 26/30 because hiding the M4 test shop correctly skips its
> three storefront specs — a skip caused by intended data state, not by a
> regression. Superseded by
> [RELEASE_CANDIDATE_REPORT.md](./RELEASE_CANDIDATE_REPORT.md), which is the
> current authority.

### CI — new

There was **no CI at all**; tests ran on one laptop, which is not a gate.
`.github/workflows/ci.yml` now runs typecheck, lint (advisory), unit, build and
E2E on every push and PR, and `scripts/assert-no-blocked-skips.mjs` **fails the
build** when a test skips for a configuration reason. Verified: exit code 1
against the current 30 skips. A green tick over untested money paths is now
impossible.

`TESTING.md` documents every environment variable, what breaks without it, and
how to point E2E at a *test* Supabase project rather than production.

---

## Remaining risks

1. **30 E2E tests still do not execute** locally or in CI until
   `TEST_SUPABASE_SERVICE_ROLE_KEY` is set. They cover price tampering, the
   oversell race, cross-tenant IDOR and the order state machine. This is the
   largest remaining confidence gap and it is configuration, not code.
2. **Fixtures do not seed store hours**, so `has_schedule = false` and the
   default-open policy applies — schedule enforcement is not exercised by E2E.
   It is covered by SQL-level verification and unit tests.
3. **Plan prices are all 0.** Renewals will record Rs 0.00 until set.
4. **Delivery zone fees are all placeholder Rs 150.**
5. ~~Pre-M7 migration filenames use rounded timestamps~~ — **this was wrong, and
   it was worse than described. See "Migration recovery" below. Now resolved.**
6. **Three lint errors** (`react-hooks/set-state-in-effect`) in pre-existing
   admin components. Lint is advisory in CI for this reason.
7. **No automated coverage of the admin store editor** — verified manually only.

---

## Launch recommendation

### NO-GO — conditional

The code is in good shape. Every defect found this pass is fixed, verified live,
and covered by a regression test. The blockers are configuration:

**Flip to GO when:**

1. `TEST_SUPABASE_SERVICE_ROLE_KEY` (and the other `TEST_*` secrets) are set so
   the 30 security-critical tests actually run — and pass.
2. Real per-zone delivery fees are configured. The stale-quote bug's blast radius
   is proportional to how wrong these are.
3. Subscription plan prices are set, or renewals are knowingly recorded at 0.

**Already resolved this pass:** the M4 test shop is now `draft` (invisible) with
all fake bank details cleared, done through the admin RPCs rather than raw SQL —
which also proved that path works. Service worker bumped to `rr-cache-v95`, so no
client can keep running a checkout bundle predating these fixes.

Items 4–7 under Remaining Risks are acceptable post-launch debt.
