-- ══════════════════════════════════════════════════════════════════════════
-- M130 — a dead push endpoint can finally die
-- ══════════════════════════════════════════════════════════════════════════
--
-- Two halves of one guard, and neither half worked.
--
-- ── 1 · fail_count IS NEVER INCREMENTED ───────────────────────────────────
-- Four deployed functions gate on it:
--
--     taxi_push_targets      ... and s.fail_count < 5
--     taxi_push_readiness    ... and s.fail_count < 5
--     merchant_push_targets  ... and fail_count < 5
--     organizer_push_targets ... and fail_count < 5
--
-- and two functions reset it — register_merchant_push and register_taxi_push
-- both `set fail_count = 0` on re-subscribe, on the sound reasoning that a
-- device which comes back is not a failing device.
--
-- Nothing anywhere raises it. Verified by scanning every plpgsql and sql body in
-- the schema for `fail_count = fail_count + …`: zero matches. So the column is
-- pinned at 0 for ever and `fail_count < 5` has never excluded a single row. An
-- endpoint that fails every time — a push service returning 500s, a gateway
-- rejecting the VAPID key — is retried on every offer until the end of time.
--
-- ── 2 · THE PRUNE FIRES AT THE WRONG TABLE ────────────────────────────────
-- lib/push/send.ts treats 404/410 as "the browser threw this away, delete it",
-- which is right. But it deletes from ONE table:
--
--     await admin.from("push_subscriptions").delete().in("endpoint", dead);
--
-- and taxi drivers do not live there. Their rows are in
-- taxi_push_subscriptions, so a dead TAXI endpoint is immortal: it is pruned
-- from a table it was never in, keeps matching taxi_push_targets, and is
-- re-attempted for every ride offer for ever.
--
-- ── THE SHAPE OF THE FIX ──────────────────────────────────────────────────
-- A push endpoint is a globally unique URL issued by the browser's push
-- service. It cannot be in both tables and it cannot mean two devices. So one
-- call can safely reach both tables by endpoint alone, and the TypeScript never
-- has to know which kind of target a row came from — which is exactly the
-- knowledge it did not have, and the reason it pruned the wrong one.

-- ── the endpoint is gone for good ─────────────────────────────────────────
create or replace function public.record_push_gone(p_endpoints text[])
returns integer
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_a integer := 0; v_b integer := 0;
begin
  if p_endpoints is null or cardinality(p_endpoints) = 0 then return 0; end if;
  with a as (delete from push_subscriptions where endpoint = any (p_endpoints) returning 1)
  select count(*) into v_a from a;
  with b as (delete from taxi_push_subscriptions where endpoint = any (p_endpoints) returning 1)
  select count(*) into v_b from b;
  return v_a + v_b;
end;
$function$;

-- ── the endpoint failed, but may recover ──────────────────────────────────
create or replace function public.record_push_failures(p_endpoints text[])
returns integer
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_a integer := 0; v_b integer := 0;
begin
  if p_endpoints is null or cardinality(p_endpoints) = 0 then return 0; end if;
  with a as (update push_subscriptions set fail_count = fail_count + 1
              where endpoint = any (p_endpoints) returning 1)
  select count(*) into v_a from a;
  with b as (update taxi_push_subscriptions set fail_count = fail_count + 1
              where endpoint = any (p_endpoints) returning 1)
  select count(*) into v_b from b;
  return v_a + v_b;
end;
$function$;

comment on function public.record_push_gone(text[]) is
  'Deletes push subscriptions by endpoint from BOTH push_subscriptions and taxi_push_subscriptions. A push endpoint is a globally unique URL, so one call is safe for either kind — which is the point: the caller pruned only the merchant table and taxi endpoints were immortal.';
comment on function public.record_push_failures(text[]) is
  'Raises fail_count on both subscription tables. Nothing raised it before, so the fail_count < 5 guard in taxi_push_targets, taxi_push_readiness, merchant_push_targets and organizer_push_targets had never excluded a row.';

-- Supabase default grants REACH ANON: a bare `revoke from public` is not a
-- boundary. Name the roles, then assert.
revoke all on function public.record_push_gone(text[])     from public, anon, authenticated;
revoke all on function public.record_push_failures(text[]) from public, anon, authenticated;
grant execute on function public.record_push_gone(text[])     to service_role;
grant execute on function public.record_push_failures(text[]) to service_role;

-- ── VERIFICATION ──────────────────────────────────────────────────────────
do $$
declare
  v_d uuid; v_n integer; v_fc integer; v_tables text;
begin
  if has_function_privilege('anon', 'public.record_push_gone(text[])', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.record_push_gone(text[])', 'EXECUTE')
  or has_function_privilege('anon', 'public.record_push_failures(text[])', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.record_push_failures(text[])', 'EXECUTE') then
    raise exception 'M130: a push bookkeeping function is EXECUTE-able by a client role';
  end if;

  -- Every table carrying a fail_count must be covered by BOTH functions, or the
  -- next one added silently inherits the immortal-endpoint bug.
  select string_agg(table_name, ', ' order by table_name) into v_tables
    from information_schema.columns
   where table_schema='public' and column_name='fail_count';
  if v_tables <> 'push_subscriptions, taxi_push_subscriptions' then
    raise exception 'M130: the set of fail_count tables changed to [%] — teach record_push_gone/record_push_failures about it', v_tables;
  end if;

  -- Empty and null are no-ops, not errors: deliver() calls these with whatever
  -- the send produced, which is usually nothing.
  if public.record_push_gone(null) <> 0 or public.record_push_gone('{}') <> 0
  or public.record_push_failures(null) <> 0 or public.record_push_failures('{}') <> 0 then
    raise exception 'M130: an empty batch was not a no-op';
  end if;

  insert into public.taxi_drivers (name, phone, vehicle, active, availability)
  values ('M130 probe', '+2305550130', 'probe', false, 'off') returning id into v_d;

  insert into public.taxi_push_subscriptions (driver_id, endpoint, p256dh, auth)
  values (v_d, 'https://example.invalid/m130', 'p', 'a');

  -- THE FIX, HALF ONE: fail_count can now rise at all.
  v_n := public.record_push_failures(array['https://example.invalid/m130']);
  if v_n <> 1 then raise exception 'M130: record_push_failures touched % rows, expected 1', v_n; end if;
  select fail_count into v_fc from public.taxi_push_subscriptions
   where endpoint = 'https://example.invalid/m130';
  if v_fc <> 1 then raise exception 'M130: fail_count is % after one failure', v_fc; end if;

  -- THE FIX, HALF TWO: a TAXI endpoint can be pruned. Before this the caller
  -- deleted from push_subscriptions, where this row has never existed.
  if exists (select 1 from public.push_subscriptions where endpoint = 'https://example.invalid/m130') then
    raise exception 'M130: the probe landed in the wrong table';
  end if;
  v_n := public.record_push_gone(array['https://example.invalid/m130']);
  if v_n <> 1 then raise exception 'M130: record_push_gone removed % rows, expected 1', v_n; end if;
  if exists (select 1 from public.taxi_push_subscriptions where endpoint = 'https://example.invalid/m130') then
    raise exception 'M130: a dead taxi endpoint survived the prune';
  end if;

  -- An endpoint in neither table is not an error.
  if public.record_push_gone(array['https://example.invalid/never']) <> 0 then
    raise exception 'M130: pruning an unknown endpoint reported a deletion';
  end if;

  delete from public.taxi_drivers where id = v_d;
  if exists (select 1 from public.taxi_drivers where id = v_d) then
    raise exception 'M130: the probe was left behind';
  end if;

  raise notice 'M130 verified: fail_count can rise, and a taxi endpoint can be pruned.';
end $$;
