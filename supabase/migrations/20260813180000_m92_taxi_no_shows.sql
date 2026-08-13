-- ── M92 — the passenger who never came ────────────────────────────────────
--
-- The owner: "taxi takes no money through the platform at all. If drivers are
-- getting stiffed on no-shows, say so and I'll design it... Do it."
--
-- They are, and the platform could not even see it. A driver accepts a ride,
-- drives to Port Mathurin, waits, and nobody comes. He has spent fuel and an
-- hour he could have sold to somebody else — and the ride simply sat in
-- 'arrived' until an admin cancelled it, which recorded the loss as though the
-- DRIVER had failed to finish the job.
--
-- THIS DOES NOT BUILD A MONEY RAIL. Taxi fares are settled in cash between
-- driver and passenger; ride_requests carries a quoted_price and no payments
-- row, deliberately. A no-show FEE would mean taking card details for a service
-- that has never taken a payment — a much bigger decision than was asked for.
-- What a platform can do without touching money is make the cost visible and
-- attach it to the person who caused it. That is reputation, and it is what
-- every ride platform ran on before it had payments.
--
-- WHY A DEDICATED TOKEN RPC rather than extending admin_set_ride_status(): the
-- report is the DRIVER's (they are the only witness) and drivers have no
-- account by decision, so they act through their link token exactly as
-- accept_ride_by_token does. It also leaves admin_set_ride_status untouched,
-- which keeps its CASE in agreement with lib/rides/model.ts and the test that
-- pins them together.
--
-- THREE LATENT FAULTS WERE FOUND BY RUNNING IT, none by applying it. The first
-- version named `taxi_drivers.link_token` (it is `driver_token`), called
-- log_ride_event with 3 arguments (it takes 7), and set a status the table's
-- CHECK constraint did not allow. All three sat inside a plpgsql body, so
-- `create or replace function` accepted every one. The two `language sql`
-- functions beside them resolved at creation and were fine — that distinction
-- is the whole lesson: SQL bodies are checked, plpgsql bodies are not.

alter table public.ride_requests
  add column if not exists no_show_at timestamptz;

comment on column public.ride_requests.no_show_at is
  'Set when the assigned driver reported that the passenger never appeared. Terminal, like cancelled.';

-- `status` is TEXT with a whitelist CHECK, not an enum.
alter table public.ride_requests drop constraint if exists ride_requests_status_check;
alter table public.ride_requests add constraint ride_requests_status_check
  check (status = any (array[
    'new','dispatching','assigned','driver_on_way','arrived','on_trip',
    'completed','cancelled','no_driver',
    -- Terminal, and deliberately NOT 'cancelled'. A cancellation is somebody
    -- changing their mind; a no-show is a driver who already spent the fuel.
    -- Collapsing them would erase the only signal this builds.
    'no_show'
  ]));

-- ── How often has this number done it? ────────────────────────────────────
--
-- Keyed on the PHONE, because that is the only identity a taxi passenger has —
-- most book as guests and never make an account. Windowed rather than lifetime:
-- somebody who missed a ride last winter is not a risk today, and a mark that
-- can never be cleared is a punishment nobody can appeal.
--
-- Matched on the LAST 8 DIGITS. Comparing all digits looked right and was not:
-- '+230 5123 4567' → 23051234567 while '05123 4567' → 051234567, so the same
-- passenger booking two ways would have read as a first offence every time —
-- exactly the case this exists to catch, failing silently and forever. Mauritius
-- and Rodrigues mobile numbers are 8 digits; the country code and leading zero
-- are decoration.
create or replace function public.taxi_no_show_count(p_phone text, p_days integer default 180)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int
    from ride_requests r
   where r.no_show_at is not null
     and r.no_show_at > now() - make_interval(days => greatest(1, coalesce(p_days, 180)))
     and coalesce(btrim(p_phone), '') <> ''
     and right(regexp_replace(coalesce(r.customer_phone, ''), '\D', '', 'g'), 8)
       = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
     and length(regexp_replace(p_phone, '\D', '', 'g')) >= 6;
$function$;

-- ── The driver reports it ─────────────────────────────────────────────────
create or replace function public.report_ride_no_show_by_token(p_token text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_driver uuid; v_ride ride_requests%rowtype;
begin
  select id into v_driver from taxi_drivers
   where driver_token = btrim(coalesce(p_token, '')) and btrim(coalesce(p_token, '')) <> '';
  if v_driver is null then
    raise exception using errcode='RR090', message='Not found.';
  end if;

  -- Their OWN current ride only. A token is a credential, so it must not be
  -- able to touch a job belonging to somebody else.
  select * into v_ride from ride_requests
   where driver_id = v_driver
     and status in ('assigned','driver_on_way','arrived')
   order by assigned_at desc nulls last
   limit 1;
  if v_ride.id is null then
    -- Same code as a bad token, on purpose: neither answer should tell a
    -- stranger holding a guessed token whether it is real.
    raise exception using errcode='RR090', message='You have no ride waiting to be reported.';
  end if;

  update ride_requests
     set status = 'no_show',
         no_show_at = now(),
         cancel_reason = coalesce(nullif(btrim(p_note), ''), 'Passenger did not show'),
         cancelled_by = 'driver',
         cancelled_at = now()
   where id = v_ride.id;

  perform log_ride_event(v_ride.id, 'driver', v_driver::text, 'no_show',
                         v_ride.status, 'no_show',
                         jsonb_build_object('note', p_note));

  return jsonb_build_object(
    'ok', true,
    'rideId', v_ride.id,
    -- So the driver is told "this has happened 3 times before" rather than
    -- getting a shrug for their trouble.
    'previousNoShows', taxi_no_show_count(v_ride.customer_phone));
end;
$function$;

-- ── What the owner needs to see ───────────────────────────────────────────
create or replace function public.recent_no_show_count(p_days integer default 30)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int from ride_requests
   where no_show_at is not null
     and no_show_at > now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
$function$;

revoke all on function public.taxi_no_show_count(text, integer) from public;
revoke all on function public.report_ride_no_show_by_token(text, text) from public;
revoke all on function public.recent_no_show_count(integer) from public;
grant execute on function public.taxi_no_show_count(text, integer) to service_role;
grant execute on function public.report_ride_no_show_by_token(text, text) to service_role;
grant execute on function public.recent_no_show_count(integer) to service_role;
