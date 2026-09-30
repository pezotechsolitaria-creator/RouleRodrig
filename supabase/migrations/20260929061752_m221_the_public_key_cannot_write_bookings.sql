-- ── M221 · THE PUBLIC KEY CANNOT WRITE BOOKINGS ─────────────────────────────
--
-- Found while building M220 (29 Sept 2026). anon and authenticated held
-- table-wide INSERT, UPDATE and DELETE on bookings and place_bookings. UPDATE
-- and DELETE were harmless only because no RLS policy allowed them; INSERT had
-- a policy whose only condition was status = 'pending'. So anyone with the
-- publishable key could POST a row straight to /rest/v1/bookings with:
--   · deposit_paid_at set — lib/holds.ts treats that as a PAID hold, so one
--     request could block a vehicle for any dates, for free;
--   · a doctored total_amount / deposit_amount;
--   · since M220, pay_in_person = true — a "confirmed-looking" booking.
--
-- Nothing legitimate needs those grants any more:
--   · app/api/bookings/route.ts now inserts through the service role (the
--     same commit as this file) — every figure it writes is computed there;
--   · app/api/place-bookings/route.ts already did;
--   · every UPDATE/DELETE runs in admin, cron and PayPal routes on the service
--     role, and the customer's own actions go through SECURITY DEFINER RPCs
--     (lookup_booking, guest_report_booking_payment), which grants do not gate.
--
-- APPLY ONLY AFTER the route change is live: the old route inserts as anon.
-- Applied 29 Sept 2026, once 83ba127f was serving production; rehearsed first
-- in a rolled-back block (service_role inserted both kinds, anon was refused).

begin;

revoke insert, update, delete on table public.bookings from anon, authenticated;
revoke insert, update, delete on table public.place_bookings from anon, authenticated;

drop policy if exists bookings_anon_insert on public.bookings;
drop policy if exists bookings_authenticated_insert on public.bookings;
drop policy if exists place_bookings_anon_insert on public.place_bookings;

do $assert$
begin
  if has_table_privilege('anon', 'public.bookings', 'insert')
     or has_table_privilege('authenticated', 'public.bookings', 'insert')
     or has_table_privilege('anon', 'public.place_bookings', 'insert')
     or has_table_privilege('authenticated', 'public.place_bookings', 'insert') then
    raise exception 'M221: a client role can still insert bookings';
  end if;
  if not has_table_privilege('service_role', 'public.bookings', 'insert')
     or not has_table_privilege('service_role', 'public.place_bookings', 'insert') then
    raise exception 'M221: the server lost its own insert';
  end if;
  -- RLS stays on: with no policies, a client role that ever regains a grant
  -- still reads and writes nothing.
  if not (select relrowsecurity from pg_class where oid = 'public.bookings'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.place_bookings'::regclass) then
    raise exception 'M221: row level security is off';
  end if;
end
$assert$;

commit;
