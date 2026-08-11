-- M47c — organizer_event_detail must return the package CONTENT it now owns.
--
-- M44 wrote this function before M47 existed, so it returned name, price and
-- counts only. The organiser's package editor would therefore open every
-- existing package with a blank subtitle, description, inclusions and image —
-- and saving would silently wipe the content that was already there, because
-- the form posts what it was given.
--
-- Caught because a string replace against the TypeScript type failed on line
-- endings and forced a re-read. The type would have compiled either way; only
-- the data was missing, which is the kind of gap a typechecker cannot see.

create or replace function public.organizer_event_detail(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare v_out jsonb;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select jsonb_build_object(
    'storeId', s.id, 'slug', s.slug, 'name', s.name,
    'phase', event_phase(s.id),
    'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'venueName', e.venue_name, 'venueAddress', e.venue_address,
    'timezone', e.timezone, 'cancelledAt', e.cancelled_at,
    'canVerifyPayments', can_verify_event_payments(s.id),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', v.id, 'name', v.name, 'price', v.price,
        'remaining', v.stock_quantity, 'isActive', v.is_active,
        'salesOpen', ticket_sales_open(v.id),
        'salesStart', tt.sales_start, 'salesEnd', tt.sales_end,
        'minPerOrder', tt.min_per_order, 'maxPerOrder', tt.max_per_order,
        -- M47 content. Without these the editor opens blank and a save wipes it.
        'subtitle', tt.subtitle,
        'description', tt.description,
        'inclusions', coalesce(to_jsonb(tt.inclusions), '[]'::jsonb),
        'imageUrl', tt.image_url,
        'displayOrder', tt.display_order,
        'sold', coalesce((select sum(oi.quantity)::int from orders o2
          join order_items oi on oi.order_id = o2.id
          where oi.variant_id = v.id
            and o2.status in ('paid','preparing','ready_for_pickup','collected')), 0),
        'awaiting', coalesce((select sum(oi.quantity)::int from orders o2
          join order_items oi on oi.order_id = o2.id
          where oi.variant_id = v.id
            and o2.status in ('pending_payment','awaiting_payment_confirmation')), 0))
        order by tt.display_order, v.name)
      from product_variants v
      join products p on p.id = v.product_id
      join ticket_types tt on tt.variant_id = v.id
      where p.store_id = s.id), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderNumber', o2.order_number, 'status', o2.status,
        'customerName', o2.customer_name, 'customerPhone', o2.customer_phone,
        'total', o2.total, 'placedAt', o2.placed_at, 'autoReleaseAt', o2.auto_release_at,
        'units', (select sum(oi.quantity)::int from order_items oi where oi.order_id = o2.id))
        order by o2.placed_at desc)
      from (select o3.* from orders o3 where o3.store_id = s.id
            order by o3.placed_at desc nulls last limit 50) o2), '[]'::jsonb)
  ) into v_out
  from stores s join events e on e.store_id = s.id
  where s.id = p_store_id;

  return v_out;
end;
$function$;

revoke all on function public.organizer_event_detail(uuid) from public, anon;
grant execute on function public.organizer_event_detail(uuid) to authenticated, service_role;

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='organizer_event_detail';
  if position('tt.subtitle' in v_src) = 0 or position('tt.inclusions' in v_src) = 0
     or position('tt.image_url' in v_src) = 0 then
    raise exception 'M47c: package content is still missing from the detail payload'; end if;
  if position('can_manage_event' in v_src) = 0 then
    raise exception 'M47c: the detail function lost its gate'; end if;
end;
$$;
