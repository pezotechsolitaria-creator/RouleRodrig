-- ── M218 · A BOOKING IS PRICED FOR ITS DAY ────────────────────────────────
--
-- Found by driving the checkout at 00:20 on Thursday 24 Sept 2026, the night
-- M216 went live. Everything read correctly — "Chez Banane is closed right
-- now, you can still order for a later time", a Friday slot chosen — and the
-- summary said, in red, "This shop is closed right now." with a Retry button.
--
-- quote_order() — the price the checkout shows, and the only one it will place
-- an order against — asks store_schedule_status(), which answers for
-- rr_fulfil_at(): the instant an order is being fulfilled FOR (M161). Only
-- create_food_order() ever set that instant. So the ORDER was judged at its
-- Friday slot and would have been accepted, while the QUOTE was judged at
-- midnight on Wednesday and refused (RR010). Without a price the button never
-- lights: a pre-order kitchen could be booked only while it was open — which
-- is exactly when its customers are least likely to be planning tomorrow.
--
-- quote_food_order() is to quote_order() what create_food_order() is to
-- create_order(): validate the requested window with food_pickup_window()
-- (the same sentences, RR030), stamp it for this transaction, and call the
-- untouched function. quote_order itself is not rewritten — it is shared by
-- shop and event checkout, which reach it exactly as before.
--
-- VOLATILE because set_config() is; it reads and prices, and writes nothing.

begin;

create or replace function public.quote_food_order(
  p_store_id uuid,
  p_items jsonb,
  p_fulfillment text,
  p_zone_id uuid,
  p_pickup_date date,
  p_pickup_time time
) returns table(subtotal integer, tax integer, delivery_fee integer, total integer, currency text)
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_win tstzrange;
begin
  -- Refuses (RR030) a window the kitchen would not offer; NULL date/time is
  -- ASAP, which it also refuses for a kitchen that needs notice (M216).
  v_win := food_pickup_window(p_store_id, p_pickup_date, p_pickup_time, now());

  -- Transaction-local, exactly as create_food_order sets it.
  if v_win is not null then
    perform set_config('rr.fulfil_at', lower(v_win)::text, true);
  end if;

  return query select q.subtotal, q.tax, q.delivery_fee, q.total, q.currency
                 from quote_order(p_store_id, p_items, p_fulfillment, p_zone_id) q;

  perform set_config('rr.fulfil_at', '', true);
end
$fn$;

revoke all on function public.quote_food_order(uuid, jsonb, text, uuid, date, time) from public;
-- Pricing is public, as quote_order is (M20d): guests check out without a session.
grant execute on function public.quote_food_order(uuid, jsonb, text, uuid, date, time) to anon, authenticated;

notify pgrst, 'reload schema';

do $assert$
declare
  v_cb  constant uuid := 'd522e765-78c3-43da-ab4e-db2b7977acaa';
  v_var constant uuid := '25f84a73-675e-4f35-9d49-aa24543598c2';
  v_items jsonb := jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1));
  v_slot record;
  v_q record;
  v_direct record;
begin
  -- The first slot Chez Banane offers from now.
  select * into v_slot from food_pickup_slots(v_cb, null, now())
   where slot_time is not null order by starts_at limit 1;
  if v_slot.slot_date is null then
    raise notice 'M218: no bookable slot right now — pricing proof skipped';
    return;
  end if;

  -- Priced for its day, whatever the hour this runs.
  select * into v_q from quote_food_order(v_cb, v_items, 'pickup', null, v_slot.slot_date, v_slot.slot_time);
  if v_q.total is null or v_q.total <= 0 then
    raise exception 'M218: a bookable slot could not be priced';
  end if;

  -- Same figures quote_order gives when the kitchen is open: the wrapper only
  -- moves the instant, never the maths.
  perform set_config('rr.fulfil_at', (v_slot.starts_at)::text, true);
  select * into v_direct from quote_order(v_cb, v_items, 'pickup', null);
  perform set_config('rr.fulfil_at', '', true);
  if (v_q.subtotal, v_q.tax, v_q.delivery_fee, v_q.total) is distinct from
     (v_direct.subtotal, v_direct.tax, v_direct.delivery_fee, v_direct.total) then
    raise exception 'M218: the wrapper changed the price';
  end if;

  -- ASAP is still refused for a notice kitchen.
  begin
    perform * from quote_food_order(v_cb, v_items, 'pickup', null, null, null);
    raise exception 'M218: ASAP was priced for a kitchen that needs notice';
  exception when sqlstate 'RR030' then null;
  end;

  if not has_function_privilege('anon', 'public.quote_food_order(uuid, jsonb, text, uuid, date, time)', 'execute') then
    raise exception 'M218: guests cannot be priced';
  end if;
  if (select count(*) from pg_proc where proname = 'quote_order') <> 1 then
    raise exception 'M218: quote_order gained an overload';
  end if;
end
$assert$;

commit;
