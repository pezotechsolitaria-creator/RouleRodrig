-- ── "IS ANYTHING ACTUALLY HAPPENING?" ───────────────────────────────────────
--
-- The tracking screen already reassures a waiting customer, and it does it well:
-- the wording widens by round — "Checking drivers near you…", "Still looking
-- nearby…", "Checking more drivers across the island…" — so a long wait reads as
-- patience rather than failure.
--
-- What it cannot say is whether anything real is going on. Those four sentences
-- are identical whether four drivers are holding a live offer or the dispatcher
-- fell over ten minutes ago. To the person watching, a reassuring sentence that
-- never changes is indistinguishable from a spinner, and a spinner is what makes
-- somebody phone the office — which is the exact intervention this whole screen
-- exists to remove.
--
-- So: a count of the drivers who have actually been asked.
--
-- ── WHY THIS IS NOT THE THING THE SCREEN REFUSES TO SAY ─────────────────────
-- TrackRide is explicit that the customer must never read "dispatching" or
-- "radius stage 3" — words about our plumbing. A driver count is not one of
-- those. "We asked four drivers" is a fact about THEIR request; "radius stage 3"
-- is a fact about our algorithm. lib/rides/drivers-asked.test.ts asserts the new
-- sentence carries none of the banned vocabulary, in all three languages.
--
-- ── WHY IT COUNTS EVERY OFFER, NOT THE LIVE ONES ────────────────────────────
-- Counting `status = 'offered'` would be the obvious query and it would be
-- cruel: offers expire on a timer, so the number would climb to four and then
-- fall back to zero between rounds. A customer watching "4 drivers asked" become
-- "1 driver asked" reads it as drivers abandoning them one by one.
--
-- Every offer ever made for this request is therefore counted, whatever became
-- of it. That number only ever goes up, which is the only honest shape for
-- "how much effort has gone into this so far".
--
-- ride_offers has RLS on with no policy and no grant — deliberately, because one
-- leaked publishable key would otherwise expose every live token on the island.
-- This function is SECURITY DEFINER and is the only way the count reaches
-- anybody, and it returns a COUNT and never a token, a driver id or a name.
--
-- Same signature as before: replacing in place rather than adding a defaulted
-- parameter, because a second overload is what makes PostgREST refuse the
-- endpoint outright with PGRST203.

-- BASE BODY TAKEN FROM pg_get_functiondef(), NOT from the repo .sql. They had
-- already drifted: the deployed comment above ensure_trip_tracking is four lines
-- where supabase/migrations/20260819030000 has two. Rebuilding this from the
-- repo file would have silently reverted that, which is the exact trap CLAUDE.md
-- documents. Everything below is the deployed body plus the count.

create or replace function public.lookup_ride(p_ref text, p_phone text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_r ride_requests%rowtype;
  v_hex text; v_digits text; v_key text;
  v_rating numeric; v_rating_n integer; v_done integer;
  v_asked integer;
begin
  v_hex := lower(regexp_replace(coalesce(p_ref, ''), '^RR-?', '', 'i'));
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_hex) < 4 or length(v_digits) < 5 then
    return jsonb_build_object('ok', false);
  end if;

  select * into v_r from ride_requests r
   where lower(substring(replace(r.id::text, '-', ''), 1, length(v_hex))) = v_hex
     and right(regexp_replace(r.customer_phone, '\D', '', 'g'), 7) = right(v_digits, 7)
   order by r.created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false); end if;

  -- Only a ride that is actually happening, and only once somebody is driving
  -- it. START the watch rather than assuming somebody else already has — see
  -- the note above. Idempotent, so the customer's polling costs one index
  -- lookup once the row exists.
  if v_r.driver_id is not null
     and v_r.status in ('assigned','driver_on_way','arrived','on_trip') then
    perform ensure_trip_tracking('ride', v_r.id);
    select channel_key into v_key from trip_tracking
     where trip_kind = 'ride' and trip_id = v_r.id and ended_at is null;
  end if;

  if v_r.driver_id is not null then
    select round(avg(rating)::numeric, 1), count(*)
      into v_rating, v_rating_n
      from taxi_driver_reviews
     where driver_id = v_r.driver_id and status = 'approved';
    select rides_completed into v_done from taxi_drivers where id = v_r.driver_id;
  end if;

  -- Distinct drivers, not offer rows. A driver re-offered on a later round has
  -- not become two drivers, and telling the customer otherwise would inflate the
  -- one number on the screen that is supposed to be concrete.
  select count(distinct driver_id) into v_asked
    from ride_offers where request_id = v_r.id;

  return jsonb_build_object('ok', true,
    'status', v_r.status, 'service', v_r.service,
    'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label,
    'whenKind', v_r.when_kind, 'scheduledAt', v_r.scheduled_at,
    'price', v_r.quoted_price, 'currency', v_r.currency,
    'passengers', v_r.passengers, 'rounds', v_r.offer_rounds,
    'driversAsked', coalesce(v_asked, 0),
    'driver', case when v_r.driver_id is null then null else (
      select jsonb_build_object('name', t.name, 'phone', coalesce(t.whatsapp, t.phone),
                                'vehicle', t.vehicle, 'photo', t.photo,
                                'rating', case when coalesce(v_rating_n,0) > 0 then v_rating else null end,
                                'ratingCount', coalesce(v_rating_n, 0),
                                'ridesCompleted', coalesce(v_done, 0))
        from taxi_drivers t where t.id = v_r.driver_id) end,
    'tripId', v_r.id,
    'tripKind', 'ride',
    'channelKey', v_key,
    'customerName', v_r.customer_name,
    'pickupLat', v_r.pickup_lat, 'pickupLng', v_r.pickup_lng,
    'dropoffLat', v_r.dropoff_lat, 'dropoffLng', v_r.dropoff_lng);
end;
$function$;

-- NOT STABLE: this writes on first call (ensure_trip_tracking inserts). Marked
-- STABLE, the planner may run it in a read-only snapshot and the insert fails at
-- runtime — the trap documented in dispatch_geography.sql.
revoke all on function public.lookup_ride(text, text) from public, anon, authenticated;
grant execute on function public.lookup_ride(text, text) to service_role;

-- One definition, or PostgREST refuses the endpoint with PGRST203 and the
-- tracking screen goes dark for everybody.
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lookup_ride';
  if v_n <> 1 then raise exception 'lookup_ride has % overloads', v_n; end if;
end $$;
