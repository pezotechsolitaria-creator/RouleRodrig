-- M64 — Push for bookings, not only orders.
--
-- Vehicle hires and place bookings are transactions too, and until now the
-- customer was told NOTHING after the confirmation email — not when the owner
-- confirmed the booking, not when it was cancelled. The admin PATCH changed a
-- status and no one downstream heard.
--
-- Credential model copied deliberately from lookup_booking (M11), including its
-- hardest-won lesson: the email is compared with exact case-insensitive
-- equality, NEVER with like/ilike, and the reference is reduced to hex so it
-- can never carry a pattern wildcard. The old lookup passed email straight into
-- .ilike(), where '%' matched every row and the sole authenticator on an
-- anonymous endpoint could be skipped with a guessed reference.
--
-- M64b FOLDED IN: the first version reduced to hex BEFORE lowercasing. A
-- reference is shown as RR-ABF003, and [^0-9a-f] is a lowercase class, so A, B
-- and F were stripped and the six-character check rejected every real customer.
-- All four security cases passed while the function was useless — it only
-- showed up in a probe built from a REAL reference. Lowercase first, then
-- reduce. A hand-made lowercase fixture would have hidden this.
create or replace function public.register_booking_push(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_ref      text,
  p_email    text,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- lower() FIRST, then hex-only — so '%', '_', '*' and backslash are gone by
  -- construction without also discarding the uppercase A-F the customer typed.
  v_ref   text := regexp_replace(
                    regexp_replace(lower(coalesce(p_ref, '')), '^rr-', ''),
                    '[^0-9a-f]', '', 'g');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_found boolean := false;
begin
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    return false;
  end if;
  -- All six characters, as the lookup requires: 16.7M possibilities rather
  -- than 65k, and it costs the customer nothing to copy the whole code.
  if length(v_ref) < 6 or v_email = '' then return false; end if;

  select true into v_found
    from bookings b
   where lower(replace(b.id::text, '-', '')) like v_ref || '%'
     and lower(btrim(coalesce(b.email, ''))) = v_email
   limit 1;

  if not coalesce(v_found, false) then
    select true into v_found
      from place_bookings pb
     where lower(replace(pb.id::text, '-', '')) like v_ref || '%'
       and lower(btrim(coalesce(pb.email, ''))) = v_email
     limit 1;
  end if;

  if not coalesce(v_found, false) then return false; end if;

  -- Same endpoint identity rule as M52/M63: possession re-homes, never
  -- duplicates. Bound to the email, which is what customer_push_targets reads.
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, contact_email, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, v_email, left(coalesce(p_user_agent,''), 300));
  return true;
end;
$function$;

revoke execute on function public.register_booking_push(text, text, text, text, text, text) from public;
grant execute on function public.register_booking_push(text, text, text, text, text, text) to anon, authenticated;

-- Verified in a rolled-back transaction against a real booking reference:
-- correct ref+email accepted; lowercase ref with an uppercase email accepted;
-- wrong email, '%' as the email, and a 3-character reference all refused.
