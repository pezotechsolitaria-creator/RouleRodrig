-- ── THE FLIGHT NUMBER REACHES THE PERSON MEETING THE PLANE (M120) ───────────
--
-- M119 made the flight/ferry number required at booking. It then stopped at the
-- database: the OFFER screen showed it, but once a driver accepted, their job
-- card did not — so the number was collected, stored, and never seen by the one
-- person who needed it, standing at Plaine Corail.
--
-- Rebuilt from pg_get_functiondef against production, not from the previous
-- repo file, because the live signature is the one that matters and a stale
-- definition here would have replaced newer work. Only the offer and job
-- objects change; everything else is what was already running.
create or replace function public.taxi_driver_home(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_t taxi_drivers%rowtype; v_offer jsonb; v_job jsonb; v_r ride_requests%rowtype;
        v_key text;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('ok', false); end if;
  select * into v_t from taxi_drivers where driver_token = p_token;
  if not found then return jsonb_build_object('ok', false); end if;

  select jsonb_build_object('token', o.token, 'pickup', r.pickup_label,
                            'dropoff', r.dropoff_label, 'price', r.quoted_price,
                            'passengers', r.passengers, 'expiresAt', o.expires_at,
                            -- A driver decides whether to take an airport run
                            -- partly on WHICH flight it is, so it belongs here
                            -- as well as on the accepted job.
                            'service', r.service, 'flightRef', r.flight_ref)
    into v_offer
    from ride_offers o join ride_requests r on r.id = o.request_id
   where o.driver_id = v_t.id and o.status = 'offered' and o.expires_at > now()
   order by o.offered_at desc limit 1;

  select * into v_r from ride_requests r
   where r.driver_id = v_t.id
     and r.status in ('assigned','driver_on_way','arrived','on_trip')
   order by r.assigned_at desc limit 1;

  if found then
    perform ensure_trip_tracking('ride', v_r.id);
    select channel_key into v_key from trip_tracking
     where trip_kind = 'ride' and trip_id = v_r.id and ended_at is null;

    v_job := jsonb_build_object(
      'pickup', v_r.pickup_label, 'dropoff', v_r.dropoff_label,
      'customerName', v_r.customer_name, 'customerPhone', v_r.customer_phone,
      'status', v_r.status, 'price', v_r.quoted_price,
      'kind', 'ride', 'id', v_r.id, 'channelKey', v_key,
      'pickupLat', v_r.pickup_lat, 'pickupLng', v_r.pickup_lng,
      'dropoffLat', v_r.dropoff_lat, 'dropoffLng', v_r.dropoff_lng,
      -- M120. What the driver needs to meet an arrival: which flight or boat,
      -- whether they were asked to wait inside with a sign, and when.
      'service', v_r.service, 'flightRef', v_r.flight_ref,
      'meetGreet', v_r.meet_greet, 'scheduledAt', v_r.scheduled_at);
  end if;

  return jsonb_build_object('ok', true, 'name', v_t.name,
    -- M113. Their own id, to key fleet presence on.
    'driverId', v_t.id,
    'availability', v_t.availability, 'vehicle', v_t.vehicle,
    'vehicleType', v_t.vehicle_type,
    'whatsappReady', (v_t.whatsapp_api_key is not null and length(v_t.whatsapp_api_key) > 0),
    'ridesCompleted', v_t.rides_completed,
    'offer', v_offer, 'job', v_job);
end;
$function$;
