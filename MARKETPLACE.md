# Roulé Rodrigues Marketplace — Architecture

> ## ⚠️ PARTS OF THIS DOCUMENT ARE SUPERSEDED (verified 2026-08-08)
>
> It was written before the owner set the canonical business rules on 2026-08-05.
> Where this file disagrees with the list below, **the list below is correct** —
> it has been verified against the live database and the shipped code.
>
> | This document says | Reality |
> |---|---|
> | Commission model (`merchants.commission_rate`, commission netting, payouts) | **Monthly subscription, no commission.** `orders.commission_amount` is written as 0 and read by nothing — dead columns kept for compatibility |
> | PayPal / MCB Juice / card checkout | **Cash and Direct Bank Transfer only.** Cards and PayPal are reserved exclusively for vehicle rentals and place bookings; MCB Juice was removed in M6. Enforced in three independent places: the Zod enum, the `create_order()` whitelist, and a CHECK on `payments` |
> | `app/api/marketplace/qr/redeem/route.ts` | Does not exist. `qr_pickup_tokens` is modelled but has no redeem route or UI yet |
> | A `features/` + `lib/marketplace/` layout | Never created. Domain logic lives in `lib/merchant/`, `lib/orders/`, `lib/schemas/`, `lib/cart/`, `lib/notifications/` |
> | Delivery ETA promises | Roulé Rodrigues does **not** promise a delivery time. `marketplace_settings.delivery_max_minutes` is an upper bound used for wording only; the customer and driver agree the time |
>
> Also not described here because they postdate it: guest checkout (M20),
> `max_open_reservations` and `guest_report_payment()` (M21), and the
> five-zone `delivery_zones` pricing model (M7).
>
> The authoritative sources are [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md),
> [ARCHITECTURE.md](./ARCHITECTURE.md), and the migration chain itself.

The Local Store marketplace: a production-grade commerce platform for Rodrigues,
built to scale to Mauritius and beyond. It lives **inside the existing Next.js /
Supabase / Vercel app** as three separate surfaces, not a separate codebase.

> Scope discipline: this document is the target architecture. We build it in
> phases (see Roadmap). "Production-grade" means the *foundation* is right so
> features slot in cleanly — not that every feature ships at once.

## Surfaces (three apps, one deployment)

| Surface | Route | Audience | Mode |
|---|---|---|---|
| **Storefront** | `/store`, `/store/[slug]`, `/product/[id]`, `/cart`, `/checkout` | Customers | Persuade→Operate |
| **Merchant platform** | `/merchant/**` | Business owners + staff | Operate |
| **Super admin** | `/admin/marketplace/**` | Platform team | Operate |

The tourism site (home, browse, guides…) stays on its current design system.
The **merchant + admin dashboards are a distinct product surface** and use the
dashboard stack below, themed to the dark/gold identity in `DESIGN.md`.

## Stack decisions

- **Next.js 16 App Router + Server Actions** for mutations; **Route Handlers**
  for webhooks (PayPal, MCB Juice) and the QR-redeem endpoint.
- **Supabase (Postgres + RLS + Auth + Storage)** — one project, tracked
  migrations in `supabase/migrations/`. Product media in Supabase Storage.
- **TanStack Query** for dashboard data (caching, optimistic mutations).
- **Zod** schemas shared by client + Server Actions (single source of validation).
- **React Hook Form** for the many merchant forms.
- **shadcn/ui** (Radix) for dashboard primitives — tables, dialogs, command
  palette, sheets — themed dark/gold. *Kept out of the tourism site* to avoid
  running two design systems where it isn't needed.
- Keep `framer-motion`, `lucide-react`, Tailwind v4 (already in the project).

### Feature-based folder layout
```
app/
  store/…                      # customer storefront (public)
  merchant/                    # merchant platform (auth-gated)
    layout.tsx                 # shell: sidebar, store switcher, command-K
    products/  orders/  inventory/  promotions/  analytics/  settings/  staff/
  admin/marketplace/…          # super admin
  api/
    marketplace/qr/redeem/route.ts
    webhooks/paypal/route.ts
    webhooks/mcb/route.ts
features/                      # domain logic, framework-agnostic
  merchants/  catalog/  inventory/  orders/  payments/  qr/  reviews/
    <feature>/{schema.ts, queries.ts, actions.ts, components/}
lib/marketplace/               # supabase clients, money, rls helpers, guards
```

## Data model

See `supabase/migrations/20260730000001_marketplace_core.sql`. Highlights:

- **Money in integer minor units**, currency ISO-4217 (`MUR` default). PayPal
  captures **EUR** → store the captured currency/amount on the `payments` row.
- **Stock is a ledger** (`inventory_movements`); the variant's `stock_quantity`
  is a cached total kept in sync by trigger. Auditable, correct under concurrency.
- **RLS on every table**: storefront reads are public but scoped to *approved*
  merchants + *active* stores/products; writes are gated to store staff;
  `is_platform_admin()` bypasses; the **service role** (server) owns payments,
  QR redemption and ledger writes — clients never touch them directly.

## Key flows

### Checkout & payment
1. Customer cart (per store) → Server Action `place_order()` (migration 0002):
   validates stock, prices server-side (never trust the client), creates
   `orders` + `order_items`, reserves stock via ledger, sets `pending_payment`.
2. **PayPal** (existing infra) or **MCB Juice** (webhook coming) captures →
   webhook marks `payments.captured` + `orders.paid`, computes
   `commission_amount`, issues the QR token.
3. Commission model: platform takes `merchant.commission_rate`; with online
   capture we net it and pay the merchant out (payout dashboard, Phase 2).

### QR pickup (single-use, screenshot-proof)
1. On payment, the server signs a token `HMAC(order_id · nonce · exp)`, stores
   **only its SHA-256 hash** in `qr_pickup_tokens`, and returns the raw token to
   the customer's receipt/app as a QR.
2. Merchant scans → `POST /api/marketplace/qr/redeem` (service role): verify
   signature + expiry, then **atomic** `update … set redeemed_at = now()
   where token_hash = $1 and redeemed_at is null`. Zero rows updated = already
   used/expired → reject. Screenshot reuse is dead on first redemption.
3. Success → order `collected`, stock movement finalised, receipt sent, audit log.

## Security baseline
RLS-first (above) · Supabase Auth (email/OTP + optional MFA) · role-based access
via `merchant_staff.role` + `platform_admins` · all mutations through Server
Actions/Route Handlers with Zod validation · webhooks verify provider signatures
· rate-limit the QR-redeem + auth endpoints · audit_logs for sensitive actions.

## Roadmap

**Phase 1 — Merchant platform foundation (current)**
DB schema (done) → auth + merchant onboarding/KYC → store setup → product &
variant management + media upload → inventory ledger UI → orders list + QR
scanner. Admin: merchant approval + commission.

**Phase 2 — Customer storefront + growth**
Storefront (browse stores/products, search, cart) → `place_order()` + PayPal/MCB
checkout → QR receipt → reviews → coupons/flash sales → payout dashboard →
WhatsApp/email order notifications → richer admin analytics.

**Phase 3 — Intelligence & scale**
AI (recommendations, "what to restock" forecasting, AI product descriptions,
review moderation) → local card rails → optional delivery → multi-island tenancy.

## Explicitly deferred (and why)
Delivery fleet dashboard (model is QR pickup), microservices (a modular monolith
is correct at this scale), and the full 150-feature super-admin — each earns its
place with real usage, not up front.
