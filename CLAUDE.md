# Roule Rodrigues — project guide

Live tourism + scooter/car‑rental platform for Rodrigues Island. **This is a
production site** (roulerodrig.com) — treat `main` as live.

## Stack
- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4
- framer-motion · lucide-react · Supabase (Postgres + RLS) · Vercel hosting

## Deploy
- `git push origin main` → **Vercel auto-deploys**. There is no separate deploy step.
- Always run `npm run build` and verify before pushing (see Verify below).
- **Bump the service worker cache on every deploy**: in `public/sw.js` increment
  `const CACHE = "rr-cache-vNN"`. Skipping this leaves users on a stale cached build.

## Parallel sessions — use your own worktree
The owner often runs **several Claude sessions on this repo at once**. Sessions
that share this directory share one git index, so whoever commits first sweeps up
everyone else's staged and unstaged files and ships them under its own message.
This has already misattributed work in both directions.

**A ready worktree exists — work there, not here:**
`C:/Users/ninja/rr-worktrees/session-2`

- Add another: `git worktree add --detach C:/Users/ninja/rr-worktrees/session-N origin/main`
- **Keep worktrees outside OneDrive.** A checkout inside it syncs ~500MB of `node_modules`.
- New worktrees need `npm ci` and a copy of `.env.local` (untracked, so it does not come along).
- **Detached HEAD is deliberate** — git refuses to check out `main` in two worktrees.
  Commit normally, then push with `git push origin HEAD:main`.
- Catch up with `git fetch origin && git rebase origin/main` (not `reset --hard`,
  which discards your work).
- A rejected push is the *good* failure: visible, and fixed by a rebase. The bad
  failure is a silent sweep, which is what sharing one index produces.

**If you must share this directory:** never `git add -A`. Stage explicit paths,
read `git diff --cached --stat` *before* writing the message, and commit early and
small — the window between staging and committing is where the race happens.

## Content model (important)
- Site content lives in Supabase table `site_content` (`id='main'`, `data` JSONB),
  edited by the owner in `/admin`. Read via `getContent()` / `lib/site-data.ts`.
- **Editing `lib/defaults.ts` does NOT change the live site** — the `site_content`
  row overrides defaults. Defaults are only the fallback/first-run seed.
- **Do not patch content with raw SQL and expect it to stick**: the admin
  "Save Changes" button overwrites the whole `site_content.data` blob. Content
  changes belong in admin (or via the admin API), not ad‑hoc SQL.

## Conventions
- **Mobile-first, app-like, premium.** Dark UI: `bg-dark`, accent `yellow`
  (#F5C842); fonts `font-syne` (display), `font-dm` (body), `font-bebas` (labels).
- **Trilingual (en / fr / cr).** Client: `useLanguage()` + `loc(lang, base, fr, cr)`
  from `lib/localize.ts`. Content fields carry optional `*Fr` / `*Cr` siblings.
- **SEO matters** (this drives real traffic): every page sets `metadata`, emits
  JSON-LD via `<JsonLd>` / `lib/schema.ts`, and uses ISR (`export const revalidate`).
  Guide/blog pages are the SEO surface — don't strip their internal links lightly.
- **Accessibility**: real `<Link>`/`<button>`, `aria-label`s, visible focus.
- Reusable components in `components/`; keep new code in the style of its neighbours.

## Booking system
- Two flows: **vehicles** (`bookings` table, `/api/bookings`) and **places /
  Stay·Eat·Do** (`place_bookings`, `/api/place-bookings`).
- Deposits computed **server-side** (scooter 25%, car 50%, place = owner flat).
  PayPal charges **EUR**. Holds logic in `lib/holds.ts`.
- **RLS**: anon can INSERT but not SELECT → generate `crypto.randomUUID()`
  server-side and insert plainly (never `.insert().select()`).
- **Booking reference** = `"RR-" + id.replace(/-/g,"").slice(0,6).toUpperCase()`
  (first 6 hex of the UUID). Same format in emails, admin, and `/manage-booking`.

## Deliver Anything — a quote marketplace, not a shop

`/deliver` is the ONLY delivery product with real customers ahead of it: the
marketplace (`/shop`) has zero live stores, so store-order dispatch is currently
theoretical. Treat `/deliver` as the delivery section.

It is a **reverse auction**, and that is the thing to hold on to. Every other
order on this site is committed when it is placed. Here the customer describes a
job, drivers name their own prices, and **nobody is dispatched until the customer
picks one**. Any copy that lets someone believe a driver is already coming is a
bug, not a wording preference — `lib/delivery/request-status.ts` pins that
sentence with a test.

**The shape**

    customer posts        create_delivery_request()      -> delivery_requests
    drivers are told      notifyDriversOfNewRequest()
    a driver quotes       offer_delivery_quote()         -> delivery_quotes
    customer is told      notifyCustomerOfQuote()
    customer accepts      customer_accept_delivery_quote()  (signed in)
                          guest_accept_delivery_quote()     (service role only)
                                                         -> deliveries
    driver is told        notifyQuoteAccepted()
    from here it is an ordinary delivery: advance_delivery(), PIN at the door.

**Check this first if a submission fails.** `PhoneInput` hands back
`formatInternational()` — `"+230 5712 3456"`, WITH SPACES. `/api/delivery-requests`
and `delivery_requests.contact_phone` both enforce strict E.164, so the form
400d on its last tap for everybody until M145. Most other endpoints (checkout
included) never regex the phone, which is why only this surface broke. Parse
with `toE164()` from `lib/phone.ts` before any strict-E.164 field.

**The two bugs that keep recurring**

- **A direct job has no `store_id` and no `order_id`.** Anything reading
  `deliveries` must LEFT JOIN `stores`/`orders` and fall back to
  `delivery_requests`. Found in SIX places so far: `driver_dashboard` twice
  (`active` in M136, `offers` in M140), `admin_delivery_board` (M138),
  `admin_operations_feed`, `admin_live_map` and `ensure_trip_tracking` (M142).
  Check this FIRST in anything new that touches `deliveries`.
- **Hand-copied `delivery_status` strings.** `LEG_COPY` had `failed` (the label
  is `failed_delivery`) and the admin people panel had `en_route` (not a label
  at all — PostgREST 400d the query and the panel silently showed nothing).
  `ACTIVE_LEGS` / `TERMINAL_LEGS` / `BROKEN_LEGS` / `PRE_PICKUP_LEGS` in
  `lib/delivery/request-status.ts` exist so the TypeScript side stops guessing,
  and a test walks the real enum.

**Rules that are easy to break**

- **A direct job has no `store_id` and no `order_id`.** Anything reading
  `deliveries` must LEFT JOIN `stores`/`orders` and fall back to
  `delivery_requests`. Inner joins made an accepted job invisible to the driver
  who won it for as long as this feature existed (M136).
- **`accept_delivery_quote()` does not check who is calling.** It is an engine,
  granted to nobody. Always go through a wrapper that proves ownership. Do not
  add an email argument to it — a different signature makes an OVERLOAD, not a
  replacement.
- **A guest's credential is the pair (request id, email)**, checked in the RPC,
  reached only with the service-role key — the same shape as
  `/api/orders/lookup`. Never put the email in a URL; the read is a POST for
  exactly that reason.
- **The fee and the shopping cap are two different numbers.** On a
  `shop_and_deliver` job the customer repays what was actually spent AND pays
  the fee. Merging them leaves a driver out of pocket at the till;
  `payAtDoor()` exists so no screen can show one without the other.
- **Driver phone numbers are withheld until a quote is accepted.** Before that
  the customer is comparing prices, and a board of phone numbers moves the whole
  job off the platform.
- **Money is minor units on the wire, decimal strings on screen.** Parse with
  `toCents()`, never `parseFloat`.
- **`accept_delivery_quote()` must stay in step with `accept_delivery()`.** They
  are two doors into the same state. The quote door was missing the due-at
  clocks (so no escalation could ever fire), the `max_active_deliveries` check
  and `sync_driver_availability()` — all three fixed in M140. If you change one,
  read the other.
- **`expires_at` is enforced in the RPC, not only by the sweep.** M139 added the
  guard because `status` stays `open` until `sweep_delivery_requests()` runs,
  and a cron that has not fired is not a security boundary.
- **A customer can cancel only before pickup** (M143). After that the driver is
  holding the goods and the database refuses. `driver_cancellations` is NOT
  incremented for a customer cancellation — it feeds the driver's standing.
- **The reference is `RR-` + the first six hex of the request id** (M144), built
  identically in SQL and in `requestRef()`. Paired with the email it is the
  guest's way back in; alone it is worth nothing.
- **A quote's id survives a re-price.** `offer_delivery_quote` UPDATES in place,
  so the id on a customer's confirm sheet can carry a price they never saw.
  `accept_delivery_quote` takes `p_expected_fee` and refuses a mismatch (M145),
  and the notification dedupe key includes the fee or a price cut is swallowed.
- **Never promise a message.** Nothing in this flow enrols a customer in any
  channel — a guest has no push subscription and is deliberately not emailed.
  A test walks every state and fails on "we will message you" or on any
  statistic about our own speed. If enrolment is ever built, change that test
  first.
- **Contrast is measured, not eyeballed.** `text-white/45` over `#0a0a0a` is
  4.48:1 and fails AA; the table is in `lib/delivery/tokens.ts`. Nothing below
  `white/55` may carry words.

## Database migrations
Applied with the Supabase MCP `apply_migration`, which is **transactional** — a
failed assertion rolls the whole thing back, so assert loudly.

- **`pg_get_functiondef()` is the truth, never the repo `.sql`.** Deployed bodies
  have drifted. Building a `create or replace` from a stale file silently reverts
  whatever else drifted in it.
- **Preserve the signature byte-for-byte.** A differing argument list creates a
  competing **overload**, not a replacement — and the old one keeps being called.
  Assert the overload count is 1.
- **A plpgsql body is not checked until it is CALLED.** A migration can "succeed"
  and ship a function that fails on its first real use. Call every function you
  changed in a `DO` block at the end.
- **Supabase default grants reach `anon`.** `revoke … from public` alone is not a
  boundary: name `anon, authenticated` too, then **assert** with
  `has_function_privilege`. Many functions in this schema are anon-callable.
- **A probe that calls a fan-out function touches every row that function can
  reach**, not just the rows the probe made. A ride probe once charged the real
  driver's `rides_offered` (M133). Make the probe *unreachable* instead — e.g. a
  ride for 60 passengers, which no driver qualifies for (M132/M135).
- **Clean up probe rows and assert they are gone.**
- Write the repo file for every applied migration. It is a RECORD of what was
  applied, not a mirror of what is deployed — but a migration with no file is the
  drift above, one release later.

## Verify before you push
1. `npm run build` — this generates ALL Tailwind CSS. (Turbopack **dev** lags on
   newly-added arbitrary classes like `h-[190px]` until a full restart + SW clear;
   the production build does not.)
2. Preview via the in-app Browser tools (`preview_start` → `Roule Rodrigues — Next.js dev`).
   Screenshots often time out — **verify with `javascript_tool` measuring
   `getBoundingClientRect()`** and reading the DOM instead.
3. PayPal creds are only in Vercel, so local create-order returns 503 (expected).

## Working style
- Act as a **co-founder**: ship verified, concrete changes; break big asks down;
  keep it clean (not TOO much); never invent facts.
- **End every response with a "Possible Improvements" section** — reserved for
  actions only the owner can take (their accounts, money, content, decisions).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
