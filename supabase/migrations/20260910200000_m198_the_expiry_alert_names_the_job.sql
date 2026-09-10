-- ── M198: "WORTH ASKING WHY" — OF WHOM? ────────────────────────────────────
--
-- The nightly sweep told the owner this, and only this:
--
--     1 delivery request expired with prices waiting
--     1 closed, 1 prices withdrawn.
--     Somebody was quoted and never booked. Worth asking why.
--
-- Three numbers and a suggestion the message itself makes impossible to
-- follow. It cannot name the customer, so the owner cannot ask. It cannot name
-- the item, the route, the price they were offered or how long they waited, so
-- the owner cannot even tell whether it mattered.
--
-- The facts were all there when the sweep ran. It just did not return them.
--
-- The owner's words: "i want u to give more details about that ... rework
-- entirely on the messages of callmebot so it gives the max info possible".
--
-- ── WHY THE ORDER IN HERE MATTERS ─────────────────────────────────────────
-- The quotes are read BEFORE they are expired. Two statements down they all
-- become status 'expired', and a best price collected after that point is
-- always null — which is how a message about prices ends up unable to name one.
--
-- Signature is unchanged: sweep_delivery_requests() -> jsonb. `create or
-- replace` on an identical signature cannot create a second overload, so
-- PostgREST has nothing new to be confused by (the PGRST203 trap).
--
-- Money stays in MINOR UNITS. delivery_quotes.fee is cents; this platform has
-- shipped a rupees-for-cents bug twice, so nothing here divides by 100 — the
-- caller formats with the shared formatter.

create or replace function public.sweep_delivery_requests()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_expired        uuid[];
  v_with_quotes    integer := 0;
  v_quotes_expired integer := 0;
  v_jobs           jsonb   := '[]'::jsonb;
begin
  with aged as (
    update delivery_requests
       set status = 'expired', updated_at = now()
     where status = 'open'
       and expires_at is not null
       and expires_at <= now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_expired from aged;

  if array_length(v_expired, 1) is null then
    return jsonb_build_object(
      'requestsExpired', 0, 'quotesExpired', 0, 'expiredWithQuotes', 0,
      'jobs', '[]'::jsonb);
  end if;

  -- How many died with prices sitting on them. Not a housekeeping number: that
  -- is a customer who WAS quoted and never booked, which is the marketplace
  -- failing at the last step rather than the first. Counted before the update
  -- below changes the rows out from under it.
  select count(distinct request_id) into v_with_quotes
    from delivery_quotes
   where request_id = any(v_expired) and status = 'offered';

  -- ── THE FACTS THE ALERT COULD NEVER SAY ─────────────────────────────────
  -- Only the ones that had prices: a request nobody answered is a supply
  -- problem the board already shows, and naming those too would bury the one
  -- case that needs a human. Capped at 20 so a bad night cannot return an
  -- unbounded payload; the caller says how many it could not list.
  select coalesce(jsonb_agg(x.j order by x.created_at), '[]'::jsonb)
    into v_jobs
    from (
      select r.created_at,
             jsonb_build_object(
               'id',           r.id,
               'what',         r.what,
               'kind',         r.kind,
               'pickup',       r.pickup_text,
               'dropoff',      r.dropoff_text,
               'contactName',  r.contact_name,
               'contactPhone', r.contact_phone,
               'guestEmail',   r.guest_email,
               'isGuest',      (r.customer_id is null),
               'quotes',       (select count(*) from delivery_quotes q
                                 where q.request_id = r.id and q.status = 'offered'),
               -- Minor units. The cheapest price they were offered and did
               -- not take, which is the number that says whether the price
               -- was the reason.
               'bestFeeCents', (select min(q.fee) from delivery_quotes q
                                 where q.request_id = r.id and q.status = 'offered'),
               'waitedHours',  round(extract(epoch from (now() - r.created_at)) / 3600)
             ) as j
        from delivery_requests r
       where r.id = any(v_expired)
         and exists (select 1 from delivery_quotes q
                      where q.request_id = r.id and q.status = 'offered')
       order by r.created_at
       limit 20
    ) x;

  -- 'expired', not 'declined'. A declined quote lost to another driver; these
  -- ran out of time, and a driver reading their own history should be able to
  -- tell those two apart.
  with gone as (
    update delivery_quotes set status = 'expired'
     where request_id = any(v_expired) and status = 'offered'
    returning 1
  )
  select count(*) into v_quotes_expired from gone;

  return jsonb_build_object(
    'requestsExpired', array_length(v_expired, 1),
    'quotesExpired', v_quotes_expired,
    'expiredWithQuotes', v_with_quotes,
    'jobs', v_jobs);
end;
$fn$;

revoke all on function public.sweep_delivery_requests() from public, anon, authenticated;

-- ── Proof ──────────────────────────────────────────────────────────────────
do $assert$
declare
  v_out jsonb;
begin
  if has_function_privilege('anon', 'public.sweep_delivery_requests()', 'execute')
     or has_function_privilege('authenticated', 'public.sweep_delivery_requests()', 'execute') then
    raise exception 'M198: the sweep is reachable by a client role';
  end if;

  v_out := sweep_delivery_requests();

  -- Nothing to expire is the normal case; the new key must still be present and
  -- an array, or the caller reads undefined and silently renders nothing.
  if jsonb_typeof(v_out->'jobs') <> 'array' then
    raise exception 'M198: jobs is not an array: %', v_out;
  end if;
  if (v_out->>'requestsExpired')::int <> 0 then
    raise exception 'M198: the sweep expired something unexpected: %', v_out;
  end if;

  -- Exactly one function of this name, or PostgREST starts refusing the
  -- endpoint with PGRST203 and every sweep stops silently.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'sweep_delivery_requests') <> 1 then
    raise exception 'M198: sweep_delivery_requests is overloaded';
  end if;
end
$assert$;
