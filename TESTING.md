# Testing & environment setup

## The short version

```bash
npm test           # unit — runs with no configuration at all
npm run build      # production build
npx playwright test
```

Unit tests need nothing. **End-to-end tests need a Supabase service-role key**, and
without it 27 of 56 silently skip. A skipped test asserts nothing — see
[Why skips matter](#why-skips-matter).

---

## Why skips matter

Running `npx playwright test` on a machine with no service-role key prints:

```
27 skipped
29 passed
```

That reads like a green build. It is not. The 29 that ran are almost all
`401`-and-redirect checks. The 27 that skipped are the ones that matter:

| Skipped area | What goes unverified |
|---|---|
| `checkout.spec.ts` | price tampering, oversell race, delivery-fee correctness |
| `merchant-orders.spec.ts` | cross-tenant IDOR, order state machine, XSS |
| `merchant-onboarding.spec.ts` | duplicate-merchant race, slug collisions |
| `merchant-dashboard.spec.ts` | shop isolation |
| `customer-orders.spec.ts` | a customer reading another customer's order |

CI (`.github/workflows/ci.yml`) runs `scripts/assert-no-blocked-skips.mjs` after
Playwright and **fails the build** if anything skipped for a configuration
reason. That is deliberate: it removes the possibility of a green tick over
untested money paths.

---

## Environment variables

### Required — the app will not work without these

| Variable | Used for | If missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | every database call | **build fails** (validated in `next.config.ts`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser/SSR client — this is the name `lib/supabase/{client,server,middleware}.ts` actually read. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as an alias for older tooling. | **build fails** if neither is set |
| `SESSION_SECRET` | signs the `/admin` cookie | admin login cannot issue a session |
| `ADMIN_PASSWORD` | `/admin` login | nobody can reach the admin dashboard |

### Required for admin writes and for E2E

| Variable | Used for | If missing |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | every `/api/admin/*` write; all E2E fixtures | admin routes return an honest **503**; 27 E2E tests skip |

`getPrivileged()` used to fall back silently to the anon client when this was
unset, which produced confusing half-working behaviour. It now fails loudly with
a 503 — see `lib/supabase/admin.ts`.

### Required for the rentals flow (separate from the marketplace)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV` | vehicle/place bookings only. **Never** used by the marketplace, which is cash + bank transfer. Absent locally, so create-order returns 503 — expected. |
| `NEXT_PUBLIC_PAYPAL_FEE_PERCENT` | deposit maths |

### Optional — features degrade rather than break

| Variable | Feature | Behaviour when unset |
|---|---|---|
| `RESEND_API_KEY`, `RESEND_FROM` | transactional email | email silently not sent |
| `BREVO_API_KEY`, `BREVO_FROM`, `BREVO_LIST_ID` | newsletter | signup no-ops |
| `CALLMEBOT_APIKEY`, `CALLMEBOT_PHONE` | WhatsApp alerts | no alert |
| `OWNER_EMAIL`, `OWNER_PHONE`, `OWNER_WHATSAPP` | owner notifications | no notification |
| `CRON_SECRET` | guards `/api/cron/*` | **cron endpoints become callable by anyone — set this in production** |
| `HOLD_EXPIRY_HOURS` | booking hold window | defaults apply |
| `NEXT_PUBLIC_SITE_URL` | absolute links, SEO, emails | links may be relative |
| `NEXT_PUBLIC_GOOGLE_VERIFICATION`, `GOOGLE_REVIEW_URL`, `EMAIL_LOGO_URL` | SEO / branding | omitted |

---

## Local setup

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SESSION_SECRET=<any long random string>
ADMIN_PASSWORD=<your admin password>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Both Supabase keys are in the dashboard under **Project Settings → API**. The
service-role key bypasses RLS entirely — treat it like a database password. It
must never be committed, and never exposed to the browser (note it has no
`NEXT_PUBLIC_` prefix, which is what keeps it server-only).

---

## Running E2E against a *test* project, not production

The fixtures create real merchants, stores and orders using the service-role
key, and delete them afterwards (`deleteOrderFixture`). A crashed run can still
leave rows behind — which you do not want in a live marketplace.

**Recommended:** create a second Supabase project for tests, apply the same
migrations (`supabase db push`), and point the test env at it.

```bash
SUPABASE_SERVICE_ROLE_KEY=<test project key> npx playwright test
```

CI uses separate `TEST_*` secrets for exactly this reason.

---

## CI secrets

Set these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | production URL (build only) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production publishable key (build only) |
| `TEST_SUPABASE_URL` | **test** project URL |
| `TEST_SUPABASE_PUBLISHABLE_KEY` | test publishable key |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | test service-role key |
| `TEST_ADMIN_PASSWORD` | any value |
| `TEST_SESSION_SECRET` | any long random string |

Until `TEST_SUPABASE_SERVICE_ROLE_KEY` is set, the E2E job **fails** rather than
passing with skips. That is the intended behaviour.

---

## Fixture reproducibility

`e2e/support/order-test-fixtures.ts` seeds a merchant, store, product, variant
and order per test, then removes them. Two known limitations:

1. **Store hours are not seeded.** `store_schedule_status()` therefore reports
   `has_schedule = false`, which the default-open policy treats as open, so
   schedule enforcement is not exercised by the fixtures. Tests that need a
   closed shop must insert `store_hours` rows themselves.
2. **Three storefront tests depend on a hardcoded slug**
   (`m4-test-shop-ffa411a9`) that nothing seeds. They skip cleanly when it is
   absent, and those skips are on the allow-list. Seeding hours in the fixture
   would let them assert properly.

---

## What each suite covers

| File | Runs without service key | Covers |
|---|---|---|
| `smoke.spec.ts` | yes | homepage, explore, bottom nav |
| `store-hours.spec.ts` | yes | 401 gates, storefront hours widget, axe, keyboard |
| `checkout.spec.ts` | partly | redirect; **price tampering and oversell need the key** |
| `customer-orders.spec.ts` | partly | redirect; **cross-customer isolation needs the key** |
| `merchant-*.spec.ts` | partly | 401s; **IDOR, state machine, onboarding race need the key** |

Unit tests (`lib/*.test.ts`, 94) cover money parsing, file signatures, the
checkout schema, and the scheduling engine including timezone and boundary
behaviour.
