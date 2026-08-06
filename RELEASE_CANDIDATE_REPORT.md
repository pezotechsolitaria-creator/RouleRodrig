# Release candidate — Roulé Rodrigues Marketplace

Prepared at `a25790b`. **26 commits unpushed. Nothing deployed.**

Supersedes the test counts and the `getPrivileged()` claim in
[PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md).

---

## 1. Headline

A release-candidate audit found three exploitable defects that earlier passes
missed. All three are fixed and verified against live data. **One of them was in
the rentals system — the live half of the business — not the marketplace.**

The remaining launch blocker is not a defect. It is that **the marketplace has
no way in**: there is no `/shop` index, and neither navigation component links
to it. Every line of M4–M11 is currently unreachable by a customer who was not
handed a direct URL.

**Recommendation: NO-GO for the marketplace. GO for the security fixes.** The
fixes should ship regardless, because one closes a live data-exposure hole.

---

## 2. What was actually broken

### 2.1 Anonymous booking enumeration — rentals, live (HIGH)

`app/api/bookings/lookup/route.ts` passed the caller's email straight into
PostgREST's `.ilike("email", email)`. In `ILIKE`, `%` is a wildcard.

The email is the **only** authenticator on this endpoint. The reference was
4+ hex characters. Proven against production data:

| Request | Result |
|---|---|
| `ref=abf0`, `email=attacker@evil.test` | nothing |
| `ref=abf0`, `email=%` | **a real confirmed booking** — vehicle, dates, Rs 14,252, status |

The authenticator contributed nothing. An attacker iterating 4-hex prefixes
enumerates the entire `bookings` and `place_bookings` tables.

Escaping `%` would **not** have been a complete fix — PostgREST also rewrites
`*` into `%` for `like`/`ilike`, leaving a second vector. The fix removes
pattern matching from the path entirely: matching moved into a `lookup_booking`
RPC using exact case-insensitive equality, with the reference reduced to hex so
no metacharacter can survive by construction. The full 6-character reference is
now required (guess space 65,536 → 16,777,216). The RPC returns only the safe
summary columns and is granted to `service_role` alone, so the app's rate
limiter remains the sole entry point.

Ten assertions, live: `%`, `*`, `_`, `%@%` and a `%`-prefixed real address all
blocked; short reference and wrong email rejected; legitimate lookup, uppercase
email, and `RR-`-prefixed whitespace-padded input all still work.

> **A measurement trap worth recording.** My first probe hit the real HTTP route
> with `email=%` and got 404 — apparently safe. It was not. `getPrivileged()`
> silently falls back to the anon client when the service-role key is absent,
> RLS then hides `bookings`, and the route 404s regardless of input. The probe
> measured RLS and never reached the `ilike`. Production *has* the key, so
> production ran the query with RLS bypassed. **A negative result from a probe
> that never exercised the code path is not evidence.**

### 2.2 Cron endpoint failed OPEN (BLOCKER)

```ts
const secret = process.env.CRON_SECRET;
if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) → 401
```

An **unset** `CRON_SECRET` skipped authentication entirely, on a route published
in `vercel.json`. That handler emails customers, sends the owner a WhatsApp
digest containing **customer names and phone numbers**, and cancels pending
bookings. Anyone who read `vercel.json` could fire it at will.

Now fails closed via `lib/cron-auth.ts` — 503 for misconfiguration, 401 for a
bad token, constant-time comparison over SHA-256 digests. Seven unit tests,
including the exact regression. Verified live: anonymous GET → 503.

Three further defects in the same job:

- **Reminder flags were written even when the send failed.** A mail outage
  marked the customer as reminded, and the row then dropped out of the next
  day's query — the reminder was buried permanently. Flags now written only
  when the send succeeded (or there is no address on file).
- **`ok: true` regardless of outcome.** The only signal that customers had
  stopped receiving mail was a customer complaining. Failures are now counted
  and turn the run non-2xx, so it shows red in Vercel's cron log.
- **Silent no-op without a service-role key** — `getPrivileged()` degrades to
  anon, RLS hides every booking, and the job reports a cheerful "0 sent" while
  doing nothing. Now returns 503.

### 2.3 Storage buckets had no size or MIME limit (HIGH)

All four buckets: `file_size_limit` NULL, `allowed_mime_types` NULL.

The RLS path-scoping is sound, but `merchant-media` and `order-receipts` both
carry INSERT policies for `authenticated` — so the Storage API could be called
**directly with the browser key**, skipping the routes' 4 MB cap and magic-byte
checks. `merchant-media` is public, making SVG/HTML upload a stored-XSS and
malware-hosting shape.

Limits now mirror each bucket's owning route, set from live evidence (the
largest existing object anywhere is a 4004 kB HEIC, so nothing legitimate is
rejected). `image/svg+xml` is excluded everywhere. Verified by attack:

| Attack | Result |
|---|---|
| SVG with `<script>` → `merchant-media` | `415 InvalidMimeType` |
| `text/html` → `merchant-media` | `415 InvalidMimeType` |
| 6 MB payload → `merchant-media` (4 MB cap) | `413 EntityTooLarge` |
| SVG → `order-receipts` | `415 InvalidMimeType` |

Enforced **ahead of RLS**, with only a browser key — so the bypass is closed for
every client, not just the app's own routes.

### 2.4 Also fixed

- **`/api/admin/upload` trusted the client-declared `file.type`** via
  `startsWith("image/")` — which `image/svg+xml` satisfies — with no size cap,
  into a public bucket. Now uses the same magic-byte detection as the other
  three upload routes.
- **`/orders` and `/orders/[id]` discarded the Supabase error.** A transient
  database fault rendered **"Page not found" for a real paid order** — the page
  a bank-transfer customer needs in order to pay — and "no orders yet" for a
  customer who has orders. Both now raise to the error boundary, which is
  recoverable; `notFound()` is not.

---

## 3. Audit triage — what was real

The audit returned 18 blocking findings. Verifying each myself rather than
acting on the report:

| Verdict | Count | Notes |
|---|---|---|
| Confirmed and fixed | 6 | §2 above |
| Confirmed, open — product surface | 5 | §5 |
| Confirmed, open — owner action | 3 | §6 |
| **Stale — already fixed before the audit's snapshot** | **2** | below |
| Confirmed, accepted post-launch debt | 2 | §7 |

The two stale findings claimed `next.config.ts` validated a variable that exists
nowhere and that CI never supplies `PUBLISHABLE_KEY`. Both were true when the
audit sampled the tree and both were fixed in `47b82fe`. Acting on them would
have re-broken working code — the reason every finding was re-verified first.

---

## 4. Security posture

| Area | Status |
|---|---|
| Booking lookup | Wildcard bypass closed. Exact equality, hex-only reference, service-role-only RPC, safe columns only. |
| Cron | Fails closed. Constant-time token compare. 7 unit tests. |
| Storage | Size + MIME enforced by the storage service, ahead of RLS, for every client. No bucket allows SVG. |
| RLS | Row access verified per role. A visibility policy is not an authorization policy — `store_is_visible()` in a SELECT policy had exposed every shop's bank details to any signed-in user; now scoped to a real order relationship. |
| Column grants | `orders.internal_notes` and bank columns withheld per-column + SECURITY DEFINER accessors. A column REVOKE is a no-op under a table grant — verified by reading as the target role. |
| `TRUNCATE` | Revoked from `anon`/`authenticated` on all 36 tables. RLS does not constrain TRUNCATE. |
| Checkout attacks | Price, zone and fee tampering; closed-shop and delivery-window bypass; payment-method bypass; stale quote; double submit; 5-way parallel submit — all refused. |
| Merchant isolation | Cross-shop writes refused (`RR003`, message identical to "not found" so store ids cannot be probed). |
| Time manipulation | `store_schedule_at` revoked from all app roles. |

---

## 5. Open — product surfaces (engineering work, not yet done)

These are real and verified. None is a security issue; all are completeness
gaps that make the marketplace unfit to launch as a customer-facing product.

1. **The marketplace is unreachable.** There is no `/shop` index page — only
   `/shop/[storeSlug]` and its product pages. `BottomNav` offers Home, Explore,
   Bookings, More; `Navbar` offers Explore, Map, Routes, Taxi, FAQ, Contact.
   Nothing links to a shop, a directory, or the cart. **This is the single
   largest blocker.** I have not built it: it is a new surface needing design,
   trilingual copy, SEO metadata and empty states, and it changes navigation you
   have deliberately shaped. That is your call, not mine to make silently.
2. **No password reset** for customers or merchants — zero occurrences of
   `resetPasswordForEmail` or any reset route. A locked-out merchant has no
   self-service path.
3. **Customer notifications are written but never displayed.** Rows are created
   and the UI promises them; `NotificationBell` exists only for merchants, and
   the only other consumer is the admin dashboard.
4. **The 48-hour payment deadline is never disclosed** to the customer. No
   copy anywhere in checkout or the order pages mentions it. Stock is reserved
   against a deadline the customer cannot see.
5. **Pickup orders never show the store address.**

---

## 6. Open — owner actions (I cannot do these)

1. **Set `CRON_SECRET` in Vercel.** The guard now fails closed, so **if it is
   unset the daily reminders stop** and the cron run shows 503. That is the
   intended trade. Check without opening the dashboard:
   ```bash
   curl -s https://roulerodrig.com/api/health | grep -o '"cron":"[a-z]*"'
   ```
2. **Gate the deploy on CI.** `vercel.json` contains only a `crons` array;
   nothing prevents `git push origin main` from promoting a commit that failed
   typecheck or tests, because Vercel's Git integration builds in parallel with
   GitHub Actions. Enable branch protection on `main` requiring the `static` and
   `e2e` checks. CI already triggers on `pull_request`.
3. **Set the `TEST_*` CI secrets** so the 30 skipped E2E tests actually run.
4. Real per-zone delivery fees (all Rs 150 placeholders) and subscription plan
   prices (all 0).

---

## 7. Accepted debt

- **`getPrivileged()` does not fail closed.** Only 5 of 23 `/api/admin/*` routes
  check `hasServiceRole()`; the other 18 degrade to the anon client and fail
  against RLS with a confusing 500. Not a security issue — RLS still governs
  what anon may do, so it cannot escalate privilege. Fixing it centrally changes
  every caller including read paths, which is not a release-candidate change.
  **An earlier version of `TESTING.md` claimed this already failed loudly with a
  503. That claim was wrong and has been corrected.**
- **`lib/logger.ts` exists and is imported nowhere** (0 references). No
  structured logging, no correlation id. Diagnosis is `console.error` grep.
- Three pre-existing `react-hooks/set-state-in-effect` lint errors in admin
  components; lint is advisory in CI for this reason.

---

## 8. Gates at `a25790b`

| Gate | Result |
|---|---|
| Typecheck | clean |
| Unit | **101 / 101** (94 + 7 new `cron-auth`) |
| Production build | clean |
| E2E runnable | **26 / 26** |
| E2E skipped | **30 — assert nothing, not counted as passing** |
| Migrations | 95 local files, 95 ledger entries, reconciled |

The 30 skips cover price tampering, the oversell race, cross-tenant IDOR and the
order state machine. `scripts/assert-no-blocked-skips.mjs` fails CI on any skip
caused by configuration, so a green tick over untested money paths is not
possible — but the tests still do not run until the `TEST_*` secrets exist.

---

## 9. Deployment checklist

**Before pushing:**

1. `npm run build` passes locally.
2. `public/sw.js` cache is `rr-cache-v95`. One bump covers all 26 unpushed
   commits; it has never been deployed, so do not bump again.
3. Confirm `CRON_SECRET` exists in Vercel — **or accept that reminders stop.**

**After deploying:**

4. `curl -s https://roulerodrig.com/api/health` — expect
   `"database":"ok"`, `"adminBackend":"configured"`, `"cron":"configured"`, and
   a `build.commit` matching the pushed SHA.
5. Guest booking lookup with a real reference + email still resolves; the same
   reference with `email=%` returns 404.
6. First cron run at 06:00 UTC returns 200 with `emailFailures: 0`.

**Rollback:** Vercel → Deployments → previous → Promote. The two M11 migrations
are additive (a new function; bucket limits) and safe to leave in place on a
rollback — no schema was dropped or altered.
