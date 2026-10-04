# Reservation engine — roulerodrig.com

Requests to book experiences (Île aux Cocos, boat trips, fishing, massage,
hikes). Built 4 Oct 2026. Stays, tables and vehicles still use their old flows;
they move onto the same tables later.

## The idea in one paragraph

A guest **asks** ("Request to book" — never "Book now"). Roulé **confirms**,
which holds the date but takes no money. Only then does the guest see how to
pay. "I've paid" is a **report**; only Roulé (or a verified PayPal capture)
records money. A confirmed hold that isn't paid in time ends by itself and
releases the date. The guest follows all of it on one page,
`/booking/<token>`, without an account.

## Two axes, never mixed

| Where the booking stands (`reservation_status`) | Where the money stands (`payment_status`) |
|---|---|
| requested → under_review → confirmed → ready → in_progress → completed | unpaid → payment_pending → paid |
| needs_information, declined, expired, cancelled | partially_paid, pay_in_person, failed, refunded, waived, not_required |

Every move is checked twice: in the database (`rsv_can`, `rsv_pay_can` in M240b)
and in `lib/reservations/status.ts`. `sql-parity.test.ts` fails if the two maps
ever differ.

## Pieces

| Piece | File |
|---|---|
| Tables, methods, policies | `supabase/migrations/…_m240_reservation_engine_tables.sql` |
| Every state change, capacity lock, expiry, guest doors | `…_m240b_reservation_engine_functions.sql` |
| Day-before reminders | `…_m240c_reservation_reminders.sql` |
| "I've paid" holds the date 24 h while Roulé checks | `…_m241_reported_payment_holds.sql` |
| Statuses, transitions, expiry rule | `lib/reservations/status.ts` |
| Policies, prices, "Rs 1,999" | `lib/reservations/policy.ts` |
| What a listing means (price, seats vs trips) | `lib/reservations/listing.ts` |
| Reference `RR-XXXXX`, token hashing | `lib/reservations/reference.ts` |
| Create, guest view, admin actions | `lib/reservations/server.ts` |
| Words (en / fr / Kreol) | `lib/reservations/copy.ts` |
| Emails + owner alerts, expiry, reminders (minute job) | `lib/reservations/deliver.ts` |
| Request form | `components/PlaceBookingModal.tsx` (activities only) |
| Guest page | `app/booking/[token]/page.tsx`, `components/reservations/ReservationHub.tsx` |
| Reservation Center | `app/admin/reservations/`, `app/api/admin/reservations/route.ts` |

## Rules worth knowing

- **Prices come from the listing**, computed on the server. The browser never
  sends an amount. Children pay the listing's child price (blank = adult
  price); babies are free unless the listing gives a price. Both are set in
  the admin listing editor.
- **Seats or trips.** A listing whose people-per-trip (`maxGuests`) is larger
  than its capacity counts *trips*: the Sunrise hike is one trip a day for up
  to 8. Otherwise capacity counts *seats*: Île aux Cocos has 36.
- **Requests never hold capacity.** Confirm does, under a lock, so two
  confirms for the last seat cannot both succeed.
- **The token is never stored** — only its SHA-256. It is derived from the
  request's idempotency key, so emails can rebuild the link. The reference
  alone opens nothing. The guest page never shows a phone number or email.
- **A double tap is one booking**: the form sends one Idempotency-Key per
  opened form.
- **Payment methods and policies** are edited in the Reservation Center →
  Payment settings, no deploy needed. Card stays off until a card processor
  exists. A request keeps the policy it was sent under.
- **Jobs** run from `/api/cron/notifications` every minute (the external
  pinger): expire lapsed holds, queue reminders (from 08:00 the day before),
  send queued emails and the owner's WhatsApp alerts.

## Not done yet

- Stays and vehicles on the engine (the tables already take them).
- Guest emails only go to guests who gave an email (the form asks for one).
- The Reservation Center was checked by type-checking and tests; its actions
  were exercised through the same database functions it calls, not by
  clicking it (no service key on the local machine).
