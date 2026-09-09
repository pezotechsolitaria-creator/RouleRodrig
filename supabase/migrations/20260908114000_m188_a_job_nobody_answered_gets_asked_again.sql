-- ── A JOB IS ANNOUNCED ONCE, TO THE WRONG PEOPLE ───────────────────────────
--
-- Two problems, and the second makes the first worse, so they are fixed
-- together rather than one amplifying the other.
--
-- ── 1. THE PUSH GOES TO DRIVERS WHO CANNOT TAKE THE WORK ──────────────────
-- driver_open_requests() has filtered the board by role since m165:
--
--     case when r.kind = 'errand' then v_d.can_run_errands
--          else v_d.can_deliver end
--
-- request_push_targets() and request_whatsapp_targets() never learned. And
-- `can_run_errands` DEFAULTS TO FALSE, so it is off for every new driver: an
-- errand was pushed to people who tapped the notification, landed on
-- /driver?request=…, and found the board did not contain it. Being sent to an
-- empty screen is how a driver learns to ignore the notifications.
--
-- Measured: with can_run_errands true the errand had 1 push target; with it
-- false, 0. Before this migration it was 1 either way.
--
-- ── 2. IT IS ANNOUNCED ONCE, AND ONLY TO WHOEVER WAS ON DUTY THEN ─────────
-- Both target lists filter `availability <> 'offline'`, and the announcement
-- fires exactly once, from the POST that creates the request. A driver who was
-- off duty at that instant is never told, on either channel, ever. They find
-- the job only by opening the app — which is the behaviour of somebody already
-- engaged, not of somebody being brought back.
--
-- The design anticipated the fix and never got it: the push carries
-- `tag: delivery-request-<id>` with the comment "so a re-notify replaces the
-- old card rather than stacking a second one for the same job".

alter table delivery_requests
  add column if not exists renotified_at timestamptz;

comment on column delivery_requests.renotified_at is
  'When the board was asked a second time about this unanswered request. Set once, by claim_stale_unanswered_requests(); its presence is what stops a third.';

create or replace function public.request_push_targets(p_request_id uuid)
 returns table(endpoint text, p256dh text, auth text, driver_name text)
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select s.endpoint, s.p256dh, s.auth, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_handle(d.vehicle_type, r.size_class, r.cargo_kind)
     -- The same test driver_open_requests() applies. Without it the tap lands
     -- on a board that does not contain the job.
     and (case when r.kind = 'errand' then d.can_run_errands else d.can_deliver end)
    join push_subscriptions s on s.user_id = d.user_id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     and (r.window_start is null or r.window_start <= now() + interval '48 hours')
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$function$;

create or replace function public.request_whatsapp_targets(p_request_id uuid)
 returns table(phone text, api_key text, driver_name text)
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select c.whatsapp_phone, c.whatsapp_api_key, d.full_name
    from delivery_requests r
    join delivery_drivers d
      on d.status = 'approved'
     and d.availability <> 'offline'
     and vehicle_can_handle(d.vehicle_type, r.size_class, r.cargo_kind)
     and (case when r.kind = 'errand' then d.can_run_errands else d.can_deliver end)
    join driver_contact_channels c on c.driver_id = d.id
   where r.id = p_request_id
     and r.status = 'open'
     and (r.expires_at is null or r.expires_at > now())
     and (r.window_start is null or r.window_start <= now() + interval '48 hours')
     and coalesce(c.whatsapp_api_key, '') <> ''
     and coalesce(c.whatsapp_phone, '') <> ''
     and not exists (
       select 1 from delivery_quotes q
        where q.request_id = r.id and q.driver_id = d.id and q.status = 'offered');
$function$;
