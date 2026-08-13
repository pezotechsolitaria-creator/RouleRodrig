-- M91b — the guest's own page has to be able to show the deadline.
--
-- /manage-booking is now the surface where a customer pays, once the owner has
-- confirmed availability. lookup_booking returned neither the payment window
-- nor the reason a booking was declined — so the page could show a pay button
-- with no deadline beside it, which is precisely the silent-expiry mistake the
-- marketplace already made once and is still on the defect list for.
--
-- Only the vehicle branch gains fields; the place branch is byte-identical to
-- M11's, deliberately, so this migration cannot change how a place booking is
-- resolved while claiming to be about payment windows.
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
  v_ref   := regexp_replace(lower(coalesce(p_ref, '')), '[^0-9a-f]', '', 'g');
  v_email := lower(btrim(coalesce(p_email, '')));

  if length(v_ref) < 6 or v_email = '' then
    return null;
  end if;
  v_ref := left(v_ref, 6);

  select jsonb_build_object(
           'kind',            'vehicle',
           'id',              b.id,
           'item',            b.scooter,
           'start',           b.start_date,
           'end',             b.end_date,
           'days',            b.days,
           'total',           b.total_amount,
           'deposit',         b.deposit_amount,
           'amountPaid',      b.amount_paid,
           'depositPaid',     b.deposit_paid_at is not null,
           'status',          b.status,
           'paymentDueBy',    b.payment_due_by,
           'unavailableNote', b.unavailable_note)
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
