-- M19b — surface amount_paid through the guest booking lookup.
--
-- M19 added bookings.amount_paid, but /manage-booking reads the booking through
-- lookup_booking() (SECURITY DEFINER, service-role only — the guest lookup must
-- not require a table grant), so the new column is invisible until the function
-- returns it. Without this, the fix exists in the database and changes nothing
-- a customer can see.
--
-- Reproduced in full rather than string-patched: this function is small, has a
-- single prior migration (M11's wildcard fix), and its exact body is preserved
-- below — the hex-only sanitisation of p_ref that closed the '%'-wildcard
-- authenticator bypass is unchanged, and is the reason it is quoted verbatim
-- rather than rewritten.

create or replace function public.lookup_booking(p_ref text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
           'amountPaid',  b.amount_paid,
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
           'amountPaid',  p.amount_paid,
           'depositPaid', p.deposit_paid_at is not null,
           'status',      p.status)
    into v_out
  from place_bookings p
  where lower(btrim(p.email)) = v_email
    and left(replace(p.id::text, '-', ''), 6) = v_ref
  limit 1;

  return v_out;
end;
$function$;

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'lookup_booking';

  if position('amountPaid' in v_src) = 0 then
    raise exception 'M19b: amountPaid missing from lookup_booking';
  end if;
  -- M11's hex sanitisation must survive this replacement — it is what closed
  -- the wildcard authenticator bypass.
  if position('[^0-9a-f]' in v_src) = 0 then
    raise exception 'M19b: M11 hex sanitisation missing from lookup_booking';
  end if;
  if has_function_privilege('anon', 'public.lookup_booking(text,text)', 'EXECUTE') then
    raise exception 'M19b: lookup_booking became executable by anon';
  end if;
end;
$$;
