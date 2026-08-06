-- M11 — Guest booking lookup: remove the wildcard authentication bypass.
--
-- THE BUG
-- /api/bookings/lookup passed the caller's email straight into PostgREST's
-- .ilike("email", email). ILIKE treats '%' and '_' as wildcards, so a caller
-- sending email='%' matched EVERY row. The email is the only authenticator on
-- this anonymous endpoint; the reference is a mere 4+ hex characters. Proven
-- against live data: ref='abf0' + email='%' returned a real confirmed booking
-- (vehicle, dates, total, status). The same request with a real-but-wrong email
-- returned nothing. The authenticator contributed nothing at all.
--
-- Escaping '%' would NOT have been a complete fix: PostgREST additionally
-- translates '*' into '%' for like/ilike filters, so an escape-based patch
-- leaves a second, less obvious vector open. The durable fix is to stop letting
-- caller-supplied text reach a pattern-matching operator at all.
--
-- THE FIX
--   * email  → exact, case-insensitive equality. No LIKE, no patterns.
--   * ref    → stripped to hex only, so no metacharacter can survive by
--              construction, then compared with left()= rather than LIKE.
--   * the full 6-character reference is now required (it is always exactly 6:
--     "RR-" + first 6 hex of the UUID). Accepting 4 made the guessable space
--     65,536; requiring 6 makes it 16,777,216 — a 256x reduction in exposure
--     for no real usability cost, since the customer copies the whole code.
--   * only the safe summary columns can leave this function, so a future edit
--     to the calling route cannot re-widen the payload to email/name/phone.
--
-- Not granted to anon/authenticated on purpose: the route calls it with the
-- service role, which keeps the app's rate limiter as the only door. Exposing
-- it via PostgREST directly would hand an attacker an unthrottled oracle.

create or replace function public.lookup_booking(p_ref text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref   text;
  v_email text;
  v_out   jsonb;
begin
  -- A booking reference is hex. Discarding everything else removes '%', '_',
  -- '*' and backslash before any comparison happens.
  v_ref   := regexp_replace(lower(coalesce(p_ref, '')), '[^0-9a-f]', '', 'g');
  v_email := lower(btrim(coalesce(p_email, '')));

  if length(v_ref) < 6 or v_email = '' then
    return null;
  end if;
  v_ref := left(v_ref, 6);

  select jsonb_build_object(
           'kind',        'vehicle',
           'id',          b.id,
           'item',        b.scooter,
           'start',       b.start_date,
           'end',         b.end_date,
           'days',        b.days,
           'total',       b.total_amount,
           'deposit',     b.deposit_amount,
           'depositPaid', b.deposit_paid_at is not null,
           'status',      b.status)
    into v_out
  from bookings b
  where lower(btrim(b.email)) = v_email
    and left(replace(b.id::text, '-', ''), 6) = v_ref
  limit 1;

  if v_out is not null then
    return v_out;
  end if;

  select jsonb_build_object(
           'kind',        'place',
           'id',          p.id,
           'item',        p.place_name,
           'start',       p.start_date,
           'end',         p.end_date,
           'days',        null,
           'total',       null,
           'deposit',     p.deposit_amount,
           'depositPaid', p.deposit_paid_at is not null,
           'status',      p.status)
    into v_out
  from place_bookings p
  where lower(btrim(p.email)) = v_email
    and left(replace(p.id::text, '-', ''), 6) = v_ref
  limit 1;

  return v_out;
end;
$$;

-- `create or replace` preserves an existing ACL, and a fresh `create` grants
-- EXECUTE to PUBLIC. State the grants explicitly either way.
revoke all on function public.lookup_booking(text, text) from public, anon, authenticated;
grant execute on function public.lookup_booking(text, text) to service_role;

comment on function public.lookup_booking(text, text) is
  'Guest booking lookup. Exact case-insensitive email match + hex-sanitised 6-char reference. Never uses pattern matching on caller input (see M11). Service-role only so the app rate limiter stays the sole entry point.';
