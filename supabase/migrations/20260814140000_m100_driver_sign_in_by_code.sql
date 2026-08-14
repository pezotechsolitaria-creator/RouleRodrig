-- M100 — a driver who closed the tab could not get back in.
--
-- /d/<64-hex-token> is the driver's job board and that link is the whole
-- credential, so losing the WhatsApp message meant losing access until the
-- owner resent it.
--
-- A code ALONE would have been a password that never expires and gets read
-- aloud across a counter, so this mirrors what /track already does for guests:
-- two factors, one of which cannot be forgotten — the phone number the driver
-- knows by heart, plus a 6-character code the owner gives out.
--
-- The code is the first 6 characters of the existing token rather than a new
-- column: nothing to generate, nothing to keep in sync, and no way to hold a
-- code pointing at a rotated token. Six hex characters do not meaningfully
-- weaken a 64-character token; the phone match and the route's rate limit are
-- what carry the security.
create or replace function public.driver_link_by_code(p_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_code  text;
  v_phone text;
  v_token text;
begin
  v_code := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if length(v_code) < 6 or length(v_phone) < 6 then
    return jsonb_build_object('ok', false);
  end if;
  v_code := left(v_code, 6);

  select d.driver_token into v_token
  from public.taxi_drivers d
  where left(d.driver_token, 6) = v_code
    and right(regexp_replace(coalesce(d.phone, ''), '[^0-9]', '', 'g'), 8)
      = right(v_phone, 8)
  limit 1;

  if v_token is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke all on function public.driver_link_by_code(text, text) from public;
revoke all on function public.driver_link_by_code(text, text) from anon, authenticated;
grant execute on function public.driver_link_by_code(text, text) to service_role;

comment on function public.driver_link_by_code(text, text) is
  'M100: resolves a driver page link from a 6-char code PLUS the matching phone number. Service role only; the API route rate-limits it.';
