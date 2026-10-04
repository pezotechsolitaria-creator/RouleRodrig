-- Applied 2 Oct 2026 11:09 (recorded in the DB as m230_the_public_key_reads_no_bank_account_and_calls_no_server_function).
-- Numbered M231 in the repo: the food session applied its own M230 (close_four_public_doors,
-- 4 of the same functions) at 11:07 the same day. This one is a superset: the revokes are
-- idempotent, and it also closes the delivery_settings bank columns and 12 more functions.
-- Rehearsed first in a rolled-back block; verified after: bank columns 401, cash_limit_cents 200.

-- ── M231 · THE PUBLIC KEY READS NO BANK ACCOUNT AND CALLS NO SERVER FUNCTION ──
--
-- Found by the architecture review of 30 Sep 2026 (security reader), and the
-- first half confirmed LIVE before this was written:
--
-- 1. delivery_settings. M45 gave it `using (true)` and revoked only writes, so
--    anon kept table SELECT. M190 then added the platform's bank account
--    (bank_account_name, bank_name, bank_account_number, bank_note) with the
--    comment "Not a public read: delivery_request_view already proves
--    ownership". HEAD /rest/v1/delivery_settings?select=<col> with the
--    publishable key answered 200 on all four. The account is exactly the
--    reference an impersonation scammer needs — the M84 lesson for merchants.
--    /deliver reads cash_limit_cents with the visitor's client; nothing public
--    reads more. So: table SELECT revoked, every NON-bank column granted back,
--    by name, from the live column list (new columns stay private by default).
--
-- 2. Functions re-exposed by drop-and-recreate. Supabase grants anon and
--    authenticated EXECUTE on every new function, and `revoke … from public`
--    does not remove those explicit grants (M108/M186 comments). Three were
--    locked down once and silently reopened when recreated:
--      claim_notification_jobs  (M166) returns the CallMeBot api_key and phone
--                                numbers, and marks queued jobs 'sending';
--      dispatch_candidates      (M149b) returns on-duty drivers' names and km to
--                                any caller-supplied point;
--      create_delivery_request  (M174) lets a guest skip the route's rate limit.
--    Others were revoked from PUBLIC only. Every app caller of all of these
--    uses the service role — except create_delivery_request, which signed-in
--    customers call with their own session, so authenticated keeps it.
--
-- Every signature is resolved from pg_proc by NAME at apply time, so an
-- overload nobody listed cannot keep the old grant, and the assert block fails
-- the migration if any of them is still callable by a client role.

do $grants$
declare
  v_cols text;
begin
  revoke select on table public.delivery_settings from anon, authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'delivery_settings'
     and column_name not like 'bank\_%';
  execute format('grant select (%s) on table public.delivery_settings to anon, authenticated', v_cols);
end
$grants$;

do $revoke$
declare
  r record;
begin
  -- Service role only.
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'claim_notification_jobs', 'dispatch_candidates', 'chase_stale_refunds',
         'guest_refunds', 'guest_refund_action', 'log_ride_event',
         'report_ride_no_show_by_token', 'order_net_paid',
         'empty_live_kitchen_count', 'ignored_refund_count', 'orderable_dish_count',
         'outstanding_refund_count', 'payment_blocked_store_count',
         'payment_blocked_stores', 'recent_no_show_count', 'rides_awaiting_callback_count'
       )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;

  -- Signed-in customers keep it (they post with their own session); guests go
  -- through /api/delivery-requests on the service role, behind its rate limit.
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_delivery_request'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end
$revoke$;

do $assert$
declare
  r record;
begin
  if has_column_privilege('anon', 'public.delivery_settings', 'bank_account_number', 'select')
     or has_column_privilege('authenticated', 'public.delivery_settings', 'bank_account_number', 'select')
     or has_column_privilege('anon', 'public.delivery_settings', 'bank_account_name', 'select') then
    raise exception 'M231: a client role can still read the platform bank account';
  end if;
  if not has_column_privilege('anon', 'public.delivery_settings', 'cash_limit_cents', 'select') then
    raise exception 'M231: /deliver lost its cash limit';
  end if;
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'claim_notification_jobs', 'dispatch_candidates', 'chase_stale_refunds',
         'guest_refunds', 'guest_refund_action', 'log_ride_event',
         'report_ride_no_show_by_token', 'order_net_paid', 'create_delivery_request'
       )
  loop
    if has_function_privilege('anon', r.sig, 'execute') then
      raise exception 'M231: anon can still execute %', r.sig;
    end if;
    if r.proname <> 'create_delivery_request' and has_function_privilege('authenticated', r.sig, 'execute') then
      raise exception 'M231: authenticated can still execute %', r.sig;
    end if;
  end loop;
end
$assert$;
