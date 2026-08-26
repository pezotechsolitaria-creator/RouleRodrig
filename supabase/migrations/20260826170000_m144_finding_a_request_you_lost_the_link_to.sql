-- ── M144 — a guest who lost the link had lost the request ──────────────────
--
-- A Deliver Anything request is identified by a uuid. A guest has no account,
-- and gets no email — that was a deliberate decision (the shared Supabase mail
-- budget is ~400/day and is spent on password resets, M41), but it left the
-- localStorage entry as the ONLY thread back to their request.
--
-- Cut that thread — a different phone, cleared storage, a tab closed on the bus,
-- a link forwarded to somebody and never kept — and the request became
-- unreachable for ever. Silently, while drivers went on quoting on it and the
-- customer had no way to see, accept or withdraw anything.
--
-- ── The reference ──────────────────────────────────────────────────────────
-- The first six hex of the id, shown as RR-3F9A2B. Not new: it is exactly what
-- driver_dashboard() and admin_delivery_board() already print for a direct job
-- (`'RR-' || upper(left(request_id::text, 6))`), so the code the customer reads
-- out is the code the driver and the owner are looking at. lib/delivery/
-- request-status.ts builds the same string in TypeScript, with a test pinning
-- the two together.
--
-- ── The credential is the PAIR ─────────────────────────────────────────────
-- Six hex characters is 16.7M, which is short enough to be ground out, so the
-- reference alone is worth nothing: the email must match too. That is the same
-- shape /api/orders/lookup has always used, and this function is likewise
-- granted to NOBODY — the route holds the service-role key and its 8/min limit
-- is the real brute-force ceiling.
--
-- Returns null identically for "no such reference" and "wrong email", so it
-- cannot be used to confirm that a reference exists.
--
-- Signed-in customers are matched on their auth email as well as the guest
-- column, so somebody who posted as a guest and later made an account with the
-- same address still finds their own request.

create or replace function public.lookup_delivery_request(p_ref text, p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_ref   text := upper(btrim(coalesce(p_ref, '')));
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_ids   uuid[];
begin
  if v_email is null then return null; end if;

  -- People write it down badly: with or without the prefix, with a space
  -- instead of a hyphen, in lower case. Everything that is not hex goes.
  v_ref := regexp_replace(v_ref, '^RR[- ]?', '');
  v_ref := regexp_replace(v_ref, '[^0-9A-F]', '', 'g');
  if length(v_ref) <> 6 then return null; end if;

  select array_agg(r.id) into v_ids
    from delivery_requests r
   where upper(left(r.id::text, 6)) = v_ref
     and (r.guest_email = v_email
       or exists (select 1 from auth.users u
                   where u.id = r.customer_id and lower(u.email) = v_email));

  -- Two matches means the prefix collided. Answering with either would be a
  -- coin flip on somebody's delivery, so it answers with neither.
  if coalesce(cardinality(v_ids), 0) <> 1 then return null; end if;
  return v_ids[1];
end;
$fn$;

revoke all on function public.lookup_delivery_request(text, text) from public, anon, authenticated;

do $assert$
begin
  if has_function_privilege('anon', 'public.lookup_delivery_request(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.lookup_delivery_request(text, text)', 'execute') then
    raise exception 'M144: the lookup is reachable by a client role';
  end if;
  if lookup_delivery_request('RR-ABCDEF', 'nobody@example.com') is not null then
    raise exception 'M144: found a request that does not exist';
  end if;
  if lookup_delivery_request('RR-ABCDEF', null) is not null then
    raise exception 'M144: answered with no email';
  end if;
  if lookup_delivery_request('nonsense', 'nobody@example.com') is not null then
    raise exception 'M144: answered for a malformed reference';
  end if;
end;
$assert$;

-- Every shape somebody might type it, and the one thing that must never work.
do $assert$
begin
  begin
    declare
      v_r uuid; v_ref text;
    begin
      v_r := create_delivery_request('package','Probe box','A','B','Probe','+23057000000',
               'standard',null,null,null,null,null,null,null,'p144@example.com');
      v_ref := upper(left(v_r::text, 6));

      if lookup_delivery_request('RR-' || v_ref, 'p144@example.com') is distinct from v_r then
        raise exception 'M144_FAIL: RR-prefixed reference did not resolve';
      end if;
      if lookup_delivery_request(lower(v_ref), '  P144@Example.com ') is distinct from v_r then
        raise exception 'M144_FAIL: a lowercase ref with a messy email did not resolve';
      end if;
      if lookup_delivery_request('rr ' || lower(v_ref), 'p144@example.com') is distinct from v_r then
        raise exception 'M144_FAIL: a spaced prefix did not resolve';
      end if;

      -- The reference ALONE is not a credential.
      if lookup_delivery_request('RR-' || v_ref, 'someone-else@example.com') is not null then
        raise exception 'M144_FAIL: the wrong email still resolved';
      end if;

      raise exception 'M144_PROBE_DONE';
    end;
  exception
    when others then
      if sqlerrm like 'M144_FAIL%' then raise; end if;
      if sqlerrm <> 'M144_PROBE_DONE' then
        raise exception 'M144: probe failed unexpectedly: %', sqlerrm;
      end if;
      raise notice 'M144: reference+email resolves, reference alone does not';
  end;
end;
$assert$;
