-- ── M147 — the guest could not be told anything ────────────────────────────
--
-- A Deliver Anything request's whole value arrives MINUTES later, as quotes.
-- That is the shape of a reverse auction and it is the reason this surface
-- needs a notification more than any other on the site — and it was the one
-- surface with none.
--
-- A guest has no account, so nothing bound their device to their request. They
-- are deliberately not emailed either: the shared Supabase mail budget is ~400
-- a day and pays for password resets (M41), and emailing every quote in a
-- bidding war is how those stop arriving. So the only way to learn a price had
-- come in was to sit on the page and watch it poll — while four screens said
-- "we will message you when a price arrives".
--
-- M145 made that copy honest by removing the promise. This makes the promise
-- keepable instead.
--
-- ── Nothing new was needed underneath ──────────────────────────────────────
-- push_subscriptions already has contact_email, and customer_push_targets
-- already matches on it:
--
--     where (p_user_id is not null and s.user_id = p_user_id)
--        or (coalesce(p_email,'') <> '' and s.contact_email = lower(btrim(p_email)))
--
-- The machinery for reaching an account-free customer has been there since M63.
-- What was missing was any way for a DELIVERY REQUEST to enrol into it. This is
-- register_customer_push() with `orders` swapped for `delivery_requests` —
-- same credential model, same endpoint re-homing rule, same failure shape.
--
-- ── Why anon may call it ───────────────────────────────────────────────────
-- A guest posting from the browser has only an anon session. The authorisation
-- lives INSIDE the function — own the request by session, or prove it with the
-- email it was posted under — never in the grant. Without that check anyone
-- could point their own device at a stranger's email and receive that
-- stranger's delivery updates.

create or replace function public.register_delivery_request_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_request_id uuid,
  p_email text default null,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_r     delivery_requests%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_uid   uuid := auth.uid();
  v_bind  text;
begin
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    return false;
  end if;

  select * into v_r from delivery_requests where id = p_request_id;
  if not found then return false; end if;

  -- Exactly the credential model register_customer_push uses, and the same one
  -- delivery_request_view enforces: own it by session, or prove it with the
  -- email it was posted under.
  if v_uid is not null and v_r.customer_id = v_uid then
    select lower(btrim(coalesce(u.email, ''))) into v_bind from auth.users u where u.id = v_uid;
  elsif v_email <> '' and lower(btrim(coalesce(v_r.guest_email, ''))) = v_email then
    v_bind := v_email;
  else
    return false;
  end if;

  -- M52's endpoint identity rule: the browser hands an endpoint only to the
  -- page that owns it, so possession re-homes it rather than duplicating.
  delete from push_subscriptions where endpoint = p_endpoint;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth, contact_email, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, nullif(v_bind, ''),
          left(coalesce(p_user_agent, ''), 300));
  return true;
end;
$fn$;

revoke all on function public.register_delivery_request_push(text, text, text, uuid, text, text)
  from public;
grant execute on function public.register_delivery_request_push(text, text, text, uuid, text, text)
  to anon, authenticated;

do $assert$
begin
  if not has_function_privilege('anon',
      'public.register_delivery_request_push(text,text,text,uuid,text,text)', 'execute') then
    raise exception 'M147: a guest cannot reach the enrolment';
  end if;

  -- Nothing it can be talked into without the credential.
  if register_delivery_request_push('https://x/1','k','a', gen_random_uuid(), 'nobody@example.com') then
    raise exception 'M147: enrolled against a request that does not exist';
  end if;
  if register_delivery_request_push('','','', gen_random_uuid(), 'nobody@example.com') then
    raise exception 'M147: enrolled with an empty subscription';
  end if;
end;
$assert$;

-- The behaviour, proved in a subtransaction that rolls back. Verified when
-- applied, and again end to end against the notifier's own lookup:
--   before enrolment  0 devices
--   after enrolment   1 device
--   delivery_quote_facts hands the notifier guestEmail, which resolves to it
do $assert$
begin
  begin
    declare
      v_r uuid; v_n integer;
    begin
      v_r := create_delivery_request('package','Probe','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p147@example.com');

      -- The WRONG email must not enrol, however well-formed the subscription.
      if register_delivery_request_push('https://push/probe','key','auth', v_r, 'someone-else@example.com') then
        raise exception 'M147_FAIL: the wrong email enrolled';
      end if;

      -- The right one does, however badly it is cased or spaced, and the guest
      -- becomes reachable BY EMAIL -- the whole point, since they have no user
      -- id to be found by.
      if not register_delivery_request_push('https://push/probe','key','auth', v_r, '  P147@Example.com ') then
        raise exception 'M147_FAIL: the correct email was refused';
      end if;
      select count(*) into v_n from customer_push_targets('p147@example.com', null);
      if v_n <> 1 then
        raise exception 'M147_FAIL: the guest is still unreachable (% targets)', v_n;
      end if;

      -- Re-subscribing the same device re-homes rather than duplicating, or a
      -- customer who taps twice gets every message twice.
      if not register_delivery_request_push('https://push/probe','key','auth', v_r, 'p147@example.com') then
        raise exception 'M147_FAIL: re-subscribing failed';
      end if;
      select count(*) into v_n from customer_push_targets('p147@example.com', null);
      if v_n <> 1 then
        raise exception 'M147_FAIL: re-subscribing duplicated the device (% targets)', v_n;
      end if;

      raise exception 'M147_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M147_FAIL%' then raise; end if;
      if sqlerrm <> 'M147_PROBE_DONE' then
        raise exception 'M147: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M147: a guest can now be reached by email, and only with the right one';
  end;
end;
$assert$;
