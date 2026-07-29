# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

<!-- Mobile-first, installable PWA (service worker + web manifest), built on
Next.js 16. Not a native app; the primary scene is a traveler on their phone. -->

## Users

**Primary — travelers to Rodrigues Island, across the whole trip.** One person
followed through two moments:

1. **Planning, before arrival.** Researching Rodrigues from home, comparing
   scooters/cars/stays/tours, and pre-booking. Trust, organic discovery, and
   rich local guides matter here.
2. **On-island, phone in hand.** Already in Rodrigues, booking last-minute,
   navigating to beaches/viewpoints, asking questions, finding food. Speed and
   an app-like feel matter here.

The product must serve both moments well; it is not a plan-only site nor an
on-island-only tool.

**Secondary — local business owners** (scooter/car owners, guesthouses, tour
operators, restaurants) who list on the platform. A partner/listing flow exists
(`/partner`, `/list-your-scooter`), but growing supply is not the current
primary objective.

## Product Purpose

Roule Rodrigues is the booking platform **and** trip companion for Rodrigues
Island. It lets a visitor rent a scooter or car directly from local owners,
book places to stay and things to do, explore the island (interactive map of
beaches/viewpoints/landmarks, scenic rides and hikes, curated experiences),
plan a trip, get help in their language from Ti Roulé (AI guide) or a real human
on WhatsApp, and reach a WhatsApp food concierge that books their table.

**Success today = more rental bookings.** Scooter and car rentals are the core
revenue. The broad "island OS" surface exists to earn discovery and trust that
funnel a visitor toward a paid booking — the plan/explore/guide features must
lead somewhere, never dead-end.

## Positioning

Not one wedge but a combination anchored in genuine local presence, which is
what a neighboring product (Booking, GetYourGuide, a generic local agency)
cannot truthfully copy at once:

- **Direct from local owners** — no booking fees, no middleman; you book with
  the people who actually own the scooter, room or tour.
- **All-in-one island OS** — rent + stay + explore + plan + AI/human help + food
  concierge in a single app for a Rodrigues trip.
- **Deep local curation** — every listing, guide, beach, viewpoint and route is
  real and Rodrigues-specific, written by locals, fully trilingual (incl.
  Creole) — not recycled OTA inventory.
- **Ti Roulé + human support** — an always-on AI island guide in English,
  French and Creole, backed by real people on WhatsApp.

A competitor can imitate any single one; the moat is holding all four together
from an authentic local base.

## Operating Context

- **The scene is a phone, often on patchy island connectivity.** Installable
  PWA with offline-tolerant caching; must feel instant on repeat loads.
- **Two booking flows:** vehicles (`bookings`) and places / Stay·Eat·Do
  (`place_bookings`). Deposits are computed server-side (scooter 25%, car 50%,
  place = owner-set flat) and paid via **PayPal in EUR**; the balance is settled
  on the island. First-to-pay wins a vehicle; the loser is notified.
- **The owner runs everything from `/admin`.** Site content lives in Supabase
  (`site_content` JSONB) and is edited by the owner, not hardcoded — fleet,
  stays, tours, map locations, routes, events, home cards/tiles, photos, and
  copy are all content-driven.
- **WhatsApp is the human channel** for support and the food/table concierge.
- **Bookings need no account**; a booking reference `RR-XXXXXX` (first 6 hex of
  the UUID) identifies a booking in emails, `/admin`, and `/manage-booking`.

## Capabilities and Constraints

- **Capabilities:** scooter & car rental with live availability and date-based
  booking; stays, tours & activities booking; WhatsApp food concierge;
  interactive island map (beaches, viewpoints, landmarks); scenic rides & hikes;
  trip planner; Ti Roulé AI guide (EN/FR/Creole); local guides & travel blog;
  events; emergency/useful numbers; owner admin dashboard; PayPal deposits;
  no-account booking management.
- **Trilingual is a hard requirement.** Every user-facing surface works fully in
  English, French, and Creole (`loc()` + `*Fr`/`*Cr` content fields).
- **Real content only — never fabricate.** No invented ratings, prices, reviews,
  testimonials, or places; reviews and prices come from real data or are absent.
- **Content-driven.** Editing code defaults does not change the live site; the
  Supabase content row overrides them. Product changes that touch content belong
  in admin.
- **SEO is a real acquisition channel** (drives the "planning before arrival"
  moment): every page sets metadata, emits JSON-LD, and uses ISR. Guide/blog
  pages are the SEO surface and their internal links matter.
- **Live production site** — `main` is live; changes deploy to real users on
  push.

## Brand Commitments

- **Name:** Roule Rodrigues (domain roulerodrig.com).
- **Ti Roulé** — the named island-guide mascot/persona; a binding identity
  asset, animated but not redesigned.
- **Trilingual EN / FR / Creole** as an identity commitment, not just a feature —
  Creole in particular signals authentic local roots.
- **Premium, app-like, mobile-first feel** is a binding product-level constraint
  (a real visual identity — dark UI with a yellow accent — is already
  established in the codebase and `CLAUDE.md`; the visual system itself is
  documented separately, not here).
- **Voice:** local, warm, direct, trustworthy — a knowledgeable local host, not
  a corporate OTA.

## Evidence on Hand

- Real fleet, stays, tours, map locations, routes, guides, blog posts and events
  in Supabase `site_content`, editable in `/admin`.
- Real WhatsApp support numbers and a working food/table concierge.
- Live PayPal deposit flow (credentials in Vercel; local returns 503 by design).
- Reviews/ratings surface **only** from real data — none are fabricated, and
  future work must not invent them.

## Product Principles

1. **Serve the whole trip, but every screen earns a booking.** Plan/explore/
   guide features build trust and funnel toward a paid rental; they must never
   be dead ends.
2. **Direct, local, real.** No middleman, no booking fees, no invented content —
   authenticity is the moat.
3. **One island, three languages.** Everything works fully in EN/FR/Creole;
   Creole is a first-class citizen, not an afterthought.
4. **Owner-editable, always current.** The platform runs from `/admin`; keep it
   fully content-driven so nothing goes stale.
5. **App-like on a phone, or it fails.** The primary scene is a traveler on
   their phone — fast, installable, native-feeling; a brochure site is failure.

## Accessibility & Inclusion

- Real `<Link>`/`<button>` semantics, `aria-label`s, and visible focus.
- Motion respects `prefers-reduced-motion`.
- Trilingual delivery (incl. Creole) is a core inclusion commitment so locals
  and non-English visitors are first-class users.
