-- M63 — Push for customers, and therefore for guests.
--
-- push_subscriptions was built for drivers, who always have an account. The
-- default checkout path on this site is a GUEST: no auth.uid(), nothing to key
-- a subscription to. Requiring an account to receive "your order is ready"
-- would have limited alerts to the minority of customers who sign in.
--
-- So a subscription may now be identified by an email instead of a user. The
-- email is not taken on trust: register_customer_push() demands the same proof
-- the rest of the guest surface does — the order id plus the address the order
-- was placed under. Without that check anyone could subscribe their own phone
-- to someone else's email and receive that stranger's order updates.
alter table public.push_subscriptions
  alter column user_id drop not null;

alter table public.push_subscriptions
  add column if not exists contact_email text;

-- A subscription that identifies nobody can never be delivered to, and would
-- sit in the table forever pretending to be a working alert.
alter table public.push_subscriptions
  drop constraint if exists push_subs_has_an_identity;
alter table public.push_subscriptions
  add constraint push_subs_has_an_identity
  check (user_id is not null or coalesce(contact_email, '') <> '');

create index if not exists idx_push_subs_email on public.push_subscriptions(contact_email);

-- The owning user may still read their own rows; a guest row belongs to nobody
-- with a session, so no client role can read it at all.
drop policy if exists push_subs_own_select on public.push_subscriptions;
create policy push_subs_own_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Subscribe this device to updates for an order the caller can prove is theirs.
create or replace function public.register_customer_push(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_order_id uuid,
  p_email    text default null,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_o     orders%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_uid   uuid := auth.uid();
  v_bind  text;
begin
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    return false;
  end if;

  select * into v_o from orders where id = p_order_id;
  if not found then return false; end if;

  -- Exactly the credential model used by lookup_order and
  -- delivery_view_for_customer: own it, or prove it with its email.
  if v_uid is not null and v_o.customer_id = v_uid then
    v_bind := lower(btrim(coalesce(v_o.customer_email, '')));
  elsif v_email <> '' and lower(btrim(coalesce(v_o.customer_email, ''))) = v_email then
    v_bind := v_email;
  else
    return false;
  end if;

  -- Same endpoint identity rule as M52: the browser hands an endpoint only to
  -- the page that owns it, so possession re-homes it rather than duplicating.
  delete from push_subscriptions where endpoint = p_endpoint;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth, contact_email, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, nullif(v_bind, ''),
          left(coalesce(p_user_agent, ''), 300));
  return true;
end;
$function$;

revoke execute on function public.register_customer_push(text, text, text, uuid, text, text) from public;
-- anon by design: a guest has no session and proves themselves inside the call.
grant execute on function public.register_customer_push(text, text, text, uuid, text, text) to anon, authenticated;

-- Who to wake for a customer. Service-role only — an endpoint is a bearer
-- capability to push anything to that person's phone.
create or replace function public.customer_push_targets(
  p_email   text default null,
  p_user_id uuid default null
)
returns table (endpoint text, p256dh text, auth text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.endpoint, s.p256dh, s.auth
    from push_subscriptions s
   where (p_user_id is not null and s.user_id = p_user_id)
      or (coalesce(p_email,'') <> ''
          and s.contact_email = lower(btrim(p_email)));
$function$;

revoke execute on function public.customer_push_targets(text, uuid) from public, anon, authenticated;

do $$
begin
  if has_function_privilege('authenticated', 'public.customer_push_targets(text, uuid)', 'execute') then
    raise exception 'M63: authenticated can call customer_push_targets — that leaks push endpoints.';
  end if;
end;
$$;

-- Verified in a rolled-back transaction: right email accepted, wrong email
-- refused, no credential refused; targets resolve for the real customer and
-- return nothing for the attacker's address.
