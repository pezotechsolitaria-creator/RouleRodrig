-- ── SIGNED IN MEANT YOU COULD NOT BOOK ─────────────────────────────────────
--
-- Reported from a phone, mid-booking, as a red line above the button:
--   "new row violates row-level security policy for table bookings"
--
-- /api/bookings inserts with the SSR client on purpose — it carries the
-- visitor's session, and the row is deliberately written under RLS rather than
-- around it. But the only INSERT policy on this table named the `anon` role:
--
--   bookings_anon_insert | INSERT | {anon} | (status = 'pending')
--
-- A signed-out visitor is `anon` and passes. A SIGNED-IN customer is
-- `authenticated`, matched no policy at all, and was refused — so the one
-- person most likely to book, the one who had bothered to make an account,
-- was the only one who could not. Anonymous booking kept working, which is
-- exactly why this survived: every test and every probe was anonymous, this
-- one included, until the owner hit it on his own phone while logged in.
--
-- The fix is the same narrow permission granted to the other role. The
-- condition is unchanged and is still the real guard: a row may only be
-- created as 'pending', so nobody can insert a booking that is already
-- confirmed. app/api/bookings/route.ts hardcodes status: "pending", so this
-- gives a signed-in customer nothing an anonymous one did not already have.
--
-- Proven both ways as the authenticated role before shipping:
--   pending   → inserted
--   confirmed → refused
create policy bookings_authenticated_insert
  on public.bookings
  for insert
  to authenticated
  with check (status = 'pending');
