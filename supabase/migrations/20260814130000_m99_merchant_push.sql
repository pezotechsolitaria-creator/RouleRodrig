-- ── M99 — the shop owner's phone ──────────────────────────────────────────
--
-- Push already existed for four audiences: the customer (their own order), the
-- platform owner (/admin/operations), delivery drivers and taxi drivers. The
-- MERCHANT — the person who has to cook the food or pack the box — had none.
-- An order landed, a notifications row was written, an email may have gone out,
-- and the shop found out whenever somebody next opened the dashboard.
--
-- That is the wrong way round. The owner is woken for every order on the
-- island; the one shop that actually has to act on it was not. And email is the
-- wrong thing to lean on here: the free tier is ~400 messages a day shared with
-- Supabase auth mail, so a busy kitchen emailing every order takes password
-- resets down with it (M41). Push costs nothing and arrives in seconds.
--
-- TWO FUNCTIONS, MIRRORING THE EXISTING SHAPE EXACTLY — a register_* the device
-- calls and a *_push_targets the server reads, same as customer/admin/driver.
-- Nothing new is invented; a merchant is simply an audience nobody had wired.
--
-- Verified as real callers: a merchant registers (true) and a customer who is
-- not staff of any store is refused (false); targets return 1 device for THEIR
-- store and 0 for another merchant's store.

-- Keyed to auth.uid(), so the subscription follows the PERSON and one row
-- serves every shop they work for. Which store is resolved at SEND time, so a
-- merchant who later opens a second shop is already subscribed for it.
create or replace function public.register_merchant_push(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if not exists (select 1 from merchant_staff ms where ms.user_id = v_uid) then
    return false;
  end if;
  if coalesce(btrim(p_endpoint), '') = '' then return false; end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (v_uid, btrim(p_endpoint), p_p256dh, p_auth, nullif(btrim(coalesce(p_user_agent,'')), ''), now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = coalesce(excluded.user_agent, push_subscriptions.user_agent),
        last_seen_at = now(),
        -- A device that comes back is not a failing device.
        fail_count = 0;
  return true;
end;
$function$;

-- Every device belonging to the staff of one store.
create or replace function public.merchant_push_targets(p_store_id uuid)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path to 'public'
as $function$
  select ps.endpoint, ps.p256dh, ps.auth
    from stores s
    join merchant_staff ms on ms.merchant_id = s.merchant_id
    join push_subscriptions ps on ps.user_id = ms.user_id
   where s.id = p_store_id
     -- deliver() prunes dead endpoints; this stops them being picked up again
     -- in the meantime.
     and coalesce(ps.fail_count, 0) < 5;
$function$;

revoke all on function public.register_merchant_push(text, text, text, text) from public;
revoke all on function public.merchant_push_targets(uuid) from public;
grant execute on function public.register_merchant_push(text, text, text, text) to authenticated;
-- Targets are read by the SERVER when sending, never by a browser: the endpoint
-- and keys are exactly what let you push to somebody else's phone.
grant execute on function public.merchant_push_targets(uuid) to service_role;
