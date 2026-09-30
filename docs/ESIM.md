# The eSIM store — roulerodrig.com/esim

Built 30 Sep 2026 (M223). Visitors buy a Mauritius + Rodrigues data eSIM, pay by
PayPal (card accepted, no PayPal account needed), and install it from a page that
leads with one-tap install on the phone it is opened on. The store replaced
**Fishing** in the homepage's "What are you looking for?" grid.

This file is the whole design: provider choice, architecture, schema, money rules,
UX, pricing, install copy, security, testing, metrics and the road ahead. Code
comments carry the reasoning line by line; this is the map.

---

## 0. The brief, improved

The original brief was strong on ambition and wrong on three facts that would
have sunk the build:

| Brief said | Reality | What was done instead |
|---|---|---|
| "Seamless checkout + **Stripe**" | Stripe does not onboard Mauritius-registered businesses. PayPal is **already live** on roulerodrig.com (client id in the production bundle). | Checkout runs on the existing PayPal integration, EUR, guest card form included. Zero new payment setup. |
| "Recommend the ideal stack (Next 15…)" | The site is Next 16 + Supabase + Vercel, with 400+ test files and hard-won conventions. | Built inside the existing app, its design system, its email router, its admin, its SEO machinery. |
| "Only my.t or Emtel" (correct) — but most reseller catalogues **hide** the network, and the cheap "Mauritius" plans on several wholesalers are Chili-only. | TripoSIM's cheapest Mauritius plans are Chili; Keepgo/esimba are Chili-only. | The Rodrigues rule is **code**, not a promise: `lib/esim/networks.ts` classifies every operator at every sync; a plan without my.t/Emtel can never be switched on (DB function, admin guard and checkout all refuse it). |

The improved prompt, for the next iteration or another market:

> Add a white-label eSIM store to roulerodrig.com (Next 16, Supabase, Vercel, PayPal
> EUR — no Stripe: unavailable to Mauritian businesses). Sell only plans whose
> Mauritius operator list includes my.t (617-01) or Emtel (617-10); enforce this in
> code at sync, activation and checkout, never by hand. Wholesaler must be
> self-serve, prepaid, no setup fee, REST API with idempotent orders. Capture the
> customer's payment BEFORE buying wholesale; make every step after capture
> idempotent on our order id. Deliver on a private install page that leads with
> Apple/Android one-tap install links, then QR, then copyable manual codes; email
> the same with the QR attached. EN + FR server-rendered pages with reciprocal
> hreflang, Product/Offer + FAQPage JSON-LD computed from the live catalogue, and
> llms.txt lines. Owner desk: margins, supplier balance, retry/resend/refund.
> Replace the "Fishing" tile on the homepage grid, migrating saved grids in place.

---

## 1. Provider: eSIM Access (esimaccess.com)

Researched 30 Sep 2026 across 13 wholesalers (full notes in the session log).

**Why eSIM Access**

- **Network, verified from their own API data:** every Mauritius-covering package in
  the official docs lists `"operatorName":"my.t","networkType":"4G"` — my.t has the
  widest footprint on Rodrigues. Recomputed on every catalogue sync.
- **Commercials:** no contract, no MOQ, no setup or monthly fee, prepaid balance
  (card/PayPal), you set retail and keep the margin. $50 deposit recommended to start.
- **API:** plain REST, HMAC-SHA256 request signing, `transactionId` idempotency,
  price-guard fields, webhooks, usage and top-up endpoints, 8 req/s.
- **Fixed-data options for Mauritius** exist only as their "Global 120" family
  (1 GB/7 d $4.60, 3 GB/30 d $11.40, 5 GB/30 d $18.00, 10 GB/30 d $34.00 in the docs) —
  which is a feature: the same eSIM works at a Dubai/Paris/Johannesburg layover and
  back home in France, the UK, South Africa, Madagascar, the Seychelles (119 countries;
  **not** Réunion — the FAQ says so, computed from the data).

**Weaknesses and how the code handles them**

| Risk | Mitigation |
|---|---|
| No sandbox | `ESIM_PROVIDER=mock` for development (refuses to run in production); engine tested end to end against fakes (`lib/esim/service.test.ts`); production proven with one real order + cancel (§11). |
| Webhooks unsigned | Treated as a doorbell only: the body names an order, the state is re-read through the signed API. Usage figures accepted only from their published IPs. |
| Prices change without notice | Live price check **before** PayPal opens; plan refused + owner emailed if it would sell below €1 net. Order carries the expected price, so a silent rise is refused by the wholesaler. |
| Deposits non-refundable | Keep the balance small (§8); top up weekly from the desk's balance figure. |
| Traffic exits UK/Norway (`ipExport`) | Stated in the FAQ-able data; harmless for maps/WhatsApp/banking. |

**Rejected, and why:** eSIM Go (Emtel-only, but asks ~$30k top-ups over the first 3 months);
Airalo Partner (Emtel local plans, but contract + go-live review, and a **minimum retail
price** you must respect, "Airalo" shows as network name); Maya (NDA, postpaid per-MB);
zendit (Mauritius networks unknown); TripoSIM (good API + sandbox, but its cheap Mauritius
plans are **Chili**); Mobimatter (no sandbox, $250 min, marketplace inventory);
Bappy/Omax (cheapest, €500 deposit, no webhooks, networks unverified); Roamic (signups
paused); esimba/Keepgo (Chili-only); eSIMCard (NDA, high prices); Telna, 1GLOBAL
(operator/sales-led).

**Second supplier later:** Airalo's local Mauritius plans are Emtel 5G — a good
redundancy for when my.t is congested. It is one new file implementing
`EsimProvider` (`lib/esim/providers/types.ts`).

---

## 2. Architecture and data flow

```
Browser (/esim)                    Next.js route handlers (Vercel)         Outside
────────────────                   ───────────────────────────────         ───────
plans (SSR, anon RPC) ◄──────────  public_esim_plans()  ◄── Supabase
tap plan → sheet
  email + "phone supports eSIM"
PayPal button ─ createOrder ────►  POST /api/esim/checkout
                                     live price check ─────────────────►  eSIM Access /package/list
                                     insert esim_orders (pending_payment)
                                     PayPal create (EUR, ref = order id) ►  PayPal
  ◄──────────── paypalOrderId ─────
PayPal approve ─ onApprove ─────►  POST /api/esim/capture
                                     PayPal capture, verify ref/EUR/amount ► PayPal
                                     status → paid
                                     wholesale order (transactionId = id) ► eSIM Access /esim/order
                                     poll profile ≤20 s ────────────────►  eSIM Access /esim/query
                                     status → delivered, email QR ──────►  Brevo/Resend (email router)
  ◄──────── /esim/order/ES-…?k=… ──
install page ── polls ───────────►  POST /api/esim/order (nudges provisioning)
                                   POST /api/esim/webhook/esimaccess ◄──  eSIM Access (doorbell)
owner ──────────────────────────►  /admin/esim → /api/admin/esim (sync, price, retry, resend, refund)
```

No cron (the project sits at Vercel's 3-cron cap — adding a 4th silently blocks every
deploy). The retry loop is the customer's own install page plus the webhook plus the
admin Retry button.

Files: `lib/esim/*` (engine, provider, pricing, networks, content), `app/esim/*`
(store, sheet, install page), `app/fr/esim-maurice-rodrigues`, `app/api/esim/*`,
`app/admin/esim`, `app/api/admin/esim`.

## 3. Database (M223, M223b, M223c)

- `esim_plans` — one row per product (package × days for day passes). Wholesale in
  `wholesale_usd_micros`, retail in `retail_eur_cents` (units in the names, after two
  rupees-vs-cents incidents). `covers_rodrigues` computed at sync; `retail_locked` once
  the owner types a price; `active` is the owner's switch; `available` is the supplier's.
- `esim_orders` — id generated by the server (= PayPal `reference_id` = wholesaler
  `transactionId`), `ref` ES-XXXXXX, per-order salt for link keys, frozen
  `plan_snapshot`, PayPal ids (unique), wholesaler order/profile ids, activation data,
  usage, attempts, last error, attribution.
- `esim_webhook_events` — every notification verbatim, unique `event_key` (dedupe).
- All three: RLS on, **no policies, no grants** to anon/authenticated. The only public
  read is `public_esim_plans(region)`, security definer, returning shopper columns only,
  and filtering `active AND available AND covers_rodrigues` itself. Verified: the public
  key gets the 4 plans from the RPC and "permission denied" on the table.

## 4. Roadmap

| Phase | Status | Scope |
|---|---|---|
| **MVP** | **Built, tested** | Catalogue, device check, EN/FR store, PayPal checkout, provisioning, install page, email with QR, webhooks, lookup, admin desk, homepage tile, SEO/GEO. |
| Go-live | **Needs you (§11)** | eSIM Access account + keys, one real test order. |
| Next (2–4 wks) | Designed | Top-ups (API ready: `/esim/topup`), "Add an eSIM" upsell on scooter/car/transfer confirmations and emails, usage page ("data left") from webhooks, promo codes (PayPal amount stays server-computed). |
| Later | Designed | Second supplier (Airalo, Emtel), regions `reunion`/`madagascar`/`europe` (schema already has `region`, `country_codes`), affiliate links via the `source` attribution column. |

## 5. Backend API

| Route | Auth | Does |
|---|---|---|
| `POST /api/esim/checkout` | rate-limited (shared) | `{planId,email,language,source}` → `{orderId,ref,paypalOrderId}`. Price read from DB; live wholesale price checked first. |
| `POST /api/esim/capture` | PayPal approval (pair of ids) | Captures, verifies reference/currency/amount to the cent, buys, waits ≤20 s, returns `{ref,url,status}`. Idempotent. |
| `POST /api/esim/order` | link key | Install-page poll; each call nudges provisioning. Rate-limited per order. |
| `POST /api/esim/lookup` | ref + email | Returns the install URL; same 404 for wrong ref and wrong email; 6 per 10 min per IP. |
| `POST /api/esim/webhook/[provider]` | none (doorbell) | Stores + dedupes the event, re-reads the order via the signed API. |
| `GET/POST /api/admin/esim` | admin cookie | Desk data; `sync`, `webhook`, `plan`, `retry`, `resend`, `refund`, `link`. |

Key code: `lib/esim/service.ts` (engine), `lib/esim/providers/esimaccess.ts` (signed
client; signature pinned to the docs' worked example), `lib/esim/admin.ts` (sync,
pricing, refund with profile cancel).

## 6. Frontend

- `/esim` and `/fr/esim-maurice-rodrigues` — `EsimStore` (hero, 2×2 plan cards, how it
  works, **why the network matters**, compatibility checker, FAQ, lost-link lookup,
  onward links). French renders French on the **server**.
- `CheckoutSheet` — portalled bottom sheet: plan restated, email, "my phone supports
  eSIM" tick (the #1 refund cause), PayPal buttons incl. guest card; "opening soon +
  notify me" (waitlist, source `esim`) until keys are set.
- `/esim/order/ES-XXXXXX?k=…` — `OrderInstall`: one-tap install for the device it is
  opened on (Apple universal link iOS 17.4+, Android link), QR for another phone,
  copyable SM-DP+ and activation code, iPhone/Android step tabs, "when you land"
  checklist, order summary, help. Polls while preparing. noindex, no-referrer.
- `/admin/esim` — totals, supplier balance (red under $20), sync, webhook
  registration, orders needing action first, per-plan price/net/badge/on-sale.

## 7. Customer journey

1. Homepage → **eSIM Data** tile (Fishing's old slot) — or Google "Rodrigues eSIM" /
   "eSIM Maurice" → `/esim` or the French page.
2. Reads "only my.t and Emtel reach Rodrigues" — the trust moment no global site offers.
3. Taps a plan → sheet → email → ticks compatibility (or checks it inline) → PayPal
   or card.
4. Lands on the install page, usually already showing the eSIM (≤20 s wait in the
   capture call); if not, it updates itself.
5. Taps **Install on this iPhone** → iOS eSIM sheet. Or scans the QR from a laptop.
6. Email arrives with QR (attached + inline), codes, link back.
7. Lands at Plaine Corail → turns on the line + data roaming → my.t in a minute.
8. Lost the link → "Already bought one?" on `/esim` with ref + email.

## 8. Pricing

All-in EUR, PayPal fee absorbed (never added at checkout — a fee on the last screen
kills eSIM conversions). Margins computed with a deliberately pessimistic PayPal
estimate (5.4% + €0.35) and a live FX rate (pessimistic fallback 0.98 €/$).

| Plan | Wholesale | Price | ≈ Net | Role |
|---|---|---|---|---|
| 1 GB · 7 days | $4.60 | **€6.90** | €2.2 | Short stay / anchor "from" price |
| 3 GB · 30 days | $11.40 | **€15.90** | €4.9 | **Most chosen** (a normal week or two) |
| 5 GB · 30 days | $18.00 | **€23.90** | €6.8 | **Best value** (€4.78/GB) |
| 10 GB · 30 days | $34.00 | **€42.90** | €11.0 | Heavy use / remote workers |

Benchmarks: Airalo Mauritius 3 GB/7 d $13, 5 GB/30 d $34, 10 GB/30 d $48; Ubigi
1 GB/7 d $5; Saily 1 GB/7 d $7.49. We are at or under the market on 5–10 GB, a little
over on 1 GB — justified by the only Rodrigues-specific guarantee on the market.

Rules in code: new synced plans arrive **inactive** at a tiered suggested price
(3.2× small → 1.45× large, rounded up to x.90); a sale is refused below €1 net;
a typed price is never overwritten by a sync. Day passes are seeded but off (≈€6/day
is poor value next to a €23.90 month).

Balance policy: keep ~$50–100 on eSIM Access; top up when the desk shows red (<$20).

## 9. Install guides

Live copy is in `lib/esim/content.ts` (store FAQ + iPhone/Android steps, EN + FR) and
the install page/email. Summary:

**iPhone (XS/XR and later, unlocked)** — on Wi-Fi before you fly: tap *Install on this
iPhone* (iOS 17.4+) or Settings → Mobile Service → Add eSIM → Use QR Code (or *Enter
Details Manually* with SM-DP+ address + activation code). Name it "Rodrigues"; keep
your usual line for calls/iMessage; choose Rodrigues for Mobile Data; turn off *Allow
Mobile Data Switching*. On landing: turn the line on + Data Roaming.

**Android (Samsung S20+, Pixel 3+, …)** — Samsung: Settings → Connections → SIM
manager → Add eSIM → scan, or *Enter activation code* with the full `LPA:1$…`.
Pixel: Settings → Network & internet → SIMs → Add SIM → scan. Set it for mobile data;
on landing enable it + Roaming.

Always: dial `*#06#` — an EID means eSIM-capable; the eSIM installs **once**, don't
delete it; days start at first connection (180 days to install), so switching it on at
a layover starts the clock there.

## 10. Security checklist

- [x] Supplier keys server-only (`ESIM_ACCESS_CODE`, `ESIM_ACCESS_SECRET`), HMAC-signed requests.
- [x] Price never from the client; PayPal amount computed from the plan row; capture must match to the cent, in EUR, with our reference id.
- [x] Replay guard: a PayPal order is accepted only for the row that created it.
- [x] Capture before purchase; every later step idempotent on our id (PayPal `PayPal-Request-Id`, wholesaler `transactionId`, conditional status updates, email only by the caller that flips to delivered).
- [x] Tables RLS-locked with no grants; wholesale cost never leaves the server.
- [x] Install link = HMAC key over (order id, per-order salt); nothing secret stored; constant-time compare; noindex; `Referrer-Policy: no-referrer`; POST for polling.
- [x] Webhook = doorbell; dedupe by event key; usage written only from supplier IPs.
- [x] Rate limits: checkout 10/min (shared), capture 12/min, lookup 6/10 min (IP only), poll 30/min per order.
- [x] Mock supplier refuses to exist in production.
- [x] No card data ever touches the site (PayPal-hosted fields).
- [ ] Owner: set `ESIM_LINK_SECRET` (optional — falls back to `SESSION_SECRET`).

## 11. Testing plan

**Done (automated):** 80+ tests in `lib/esim/*` — coverage rule, pricing/margins
across the whole range, launch catalogue profitability, LPA parsing, link keys, QR
decodes to the exact LPA, signature vs. the docs' worked example, package/profile/
webhook mapping from the docs' own JSON, and the engine end to end against fakes
(happy path, double tap, lost PayPal response, replayed PayPal order, under-payment,
price rise, withdrawn plan, non-Rodrigues plan, slow supplier, no balance → retry,
network blip, webhook dedupe, webhook trust, lookup). Plus the whole site suite
(tiles, sitemap, hreflang reciprocity, French hub, llms.txt, dead links, email links).

**Done (browser, 375×812):** store renders live plans from Supabase; sheet above the nav;
validation; homepage tile in Fishing's slot; French page server-rendered in French;
JSON-LD valid; install page (Android + French) with QR and copy fields.

**Go-live (needs you):**
1. Create the eSIM Access account (console.esimaccess.com), deposit $50.
2. Developer → copy **AccessCode** and **SecretKey** → Vercel env: `ESIM_ACCESS_CODE`,
   `ESIM_ACCESS_SECRET` (Production) → redeploy.
3. `/admin/esim` → **Sync catalogue** (refreshes costs; new plans arrive off) →
   **Register webhook**.
4. Buy the €6.90 plan yourself with a real card. Expect the QR on screen in ~10 s and
   the email. Don't install it.
5. `/admin/esim` → **Refund** that order: PayPal refunds you, and the uninstalled
   profile is cancelled so eSIM Access refunds the balance.
6. Check `/esim` shows **Buy** (not "notify me") and the Product markup says InStock.

## 12. Metrics

PostHog funnel (`lib/esim/analytics.ts`, no personal data): `esim_store_viewed` →
`esim_plan_chosen` → `esim_checkout_started` → `esim_paid` → `esim_install_tapped`
(method: apple/android/copy/qr), plus `esim_checkout_failed` (stage + status),
`esim_compat_checked`, `esim_notify_me`. Business: sales, revenue, net and
needs-action on the desk; attribution per order (`source`: utm, referrer, landing).
SEO: Search Console for `rodrigues esim`, `esim maurice`, `esim rodrigues`,
`carte sim rodrigues`, `internet rodrigues`.

Targets for the first 90 days: view→paid ≥ 4%; install-tap on ≥ 70% of delivered
orders; support contacts < 5% of orders; zero refunds for "no signal on Rodrigues".

## 13. Expansion

1. **Bundles** — add "eSIM for your trip" to rental/transfer confirmation emails and
   the manage-booking page (the traveller is already paying us).
2. **Top-ups** from the install page (supplier support flag stored per plan).
3. **Second supplier** (Airalo local, Emtel) for redundancy and price competition.
4. **Regions** — Réunion first (the audience lives there), then Madagascar; the
   network rule generalises to "operators that cover the destination".
5. **Usage page** — webhooks already store data used/total/expiry.
