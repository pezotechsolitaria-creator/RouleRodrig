-- ── M98 — a day hire has nowhere to be going ──────────────────────────────
--
-- "Private hire — a driver for the day, or a set route." That is the product,
-- and until now you could not book it. Every service was forced through the
-- same "where to?" gate, in the form (canContinue2 = pickup && dropoff) and
-- again here ("Where from and where to, please"). A customer wanting a driver
-- for six hours had to invent a destination to get past step 2, and the ride
-- then went out to a driver describing a trip nobody was taking.
--
-- Everything ELSE about private hire was already right, which is what made the
-- gap easy to miss: quote_ride() returns quote_on_request for it — "We will
-- confirm the price with you — no charge until you agree" — and
-- create_ride_request already tolerates an unpriceable ride ("a ride we cannot
-- price is still a ride worth taking"). Only the destination was mandatory.
--
-- SO THE RULE IS NARROWED, NOT REMOVED. A taxi with no destination is a typo
-- and is still refused. `private` is the single exception, because it is the
-- single service whose own description says there may not be one.
--
-- dropoff_label becomes NULL rather than '' so "no destination" is a fact the
-- admin desk and the driver's message can both read, instead of an empty string
-- each has to guess about. Both now say "day hire — no fixed destination".
--
-- Verified by calling it: private with no destination books and returns no
-- price (confirmed later); a TAXI with no destination is still refused; a
-- normal taxi still books and still prices at Rs 314.80.
alter table public.ride_requests alter column dropoff_label drop not null;

create or replace function public.create_ride_request(
  p_service text, p_when_kind text, p_scheduled_at timestamp with time zone,
  p_pickup_label text, p_pickup_lat double precision, p_pickup_lng double precision,
  p_dropoff_label text, p_dropoff_lat double precision, p_dropoff_lng double precision,
  p_passengers integer, p_luggage integer, p_notes text, p_flight_ref text,
  p_meet_greet boolean, p_customer_name text, p_customer_phone text, p_customer_email text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_quote jsonb; v_id uuid; v_price integer;
begin
  if coalesce(btrim(p_customer_name), '') = '' or coalesce(btrim(p_customer_phone), '') = '' then
    raise exception using errcode='RR095', message='We need a name and a phone number to send a driver.';
  end if;
  if coalesce(btrim(p_pickup_label), '') = '' then
    raise exception using errcode='RR095', message='Where should the driver meet you?';
  end if;
  -- Private hire is the one service that may have no destination.
  if p_service <> 'private' and coalesce(btrim(p_dropoff_label), '') = '' then
    raise exception using errcode='RR095', message='Where from and where to, please.';
  end if;
  if p_when_kind = 'scheduled' and p_scheduled_at is null then
    raise exception using errcode='RR095', message='Pick a date and time for a later ride.';
  end if;
  if p_when_kind = 'scheduled' and p_scheduled_at < now() - interval '5 minutes' then
    raise exception using errcode='RR095', message='That time has already passed.';
  end if;

  -- THE PRICE IS RE-COMPUTED HERE (RR012): what is charged must be derived
  -- server-side from what was actually requested.
  v_quote := quote_ride(p_service, p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
                        p_passengers, p_luggage,
                        case when p_when_kind = 'scheduled' then p_scheduled_at else now() end);
  v_price := case when (v_quote->>'ok')::boolean then (v_quote->>'price')::integer else null end;

  insert into ride_requests (
    service, when_kind, scheduled_at,
    pickup_label, pickup_lat, pickup_lng,
    dropoff_label, dropoff_lat, dropoff_lng,
    passengers, luggage, notes, flight_ref, meet_greet,
    customer_name, customer_phone, customer_email, quoted_price, status
  ) values (
    p_service,
    case when p_when_kind = 'scheduled' then 'scheduled' else 'now' end,
    case when p_when_kind = 'scheduled' then p_scheduled_at else null end,
    btrim(p_pickup_label), p_pickup_lat, p_pickup_lng,
    nullif(btrim(coalesce(p_dropoff_label, '')), ''), p_dropoff_lat, p_dropoff_lng,
    greatest(coalesce(p_passengers, 1), 1), greatest(coalesce(p_luggage, 0), 0),
    nullif(btrim(coalesce(p_notes, '')), ''),
    nullif(btrim(coalesce(p_flight_ref, '')), ''), coalesce(p_meet_greet, false),
    btrim(p_customer_name), btrim(p_customer_phone),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    v_price,
    'new'
  ) returning id into v_id;

  perform log_ride_event(v_id, 'customer', null, 'ride.requested', null, 'new',
    jsonb_build_object('quoted', v_price, 'quoteOk', (v_quote->>'ok')::boolean));

  return jsonb_build_object('ok', true,
    'reference', 'RR-' || upper(substring(replace(v_id::text, '-', ''), 1, 6)),
    'price', v_price, 'currency', 'MUR');
end;
$function$;
