-- M58b — let the organiser set the venue size, and see where they stand.
--
-- M58 added events.capacity and enforced it, but nothing could write it and
-- nothing reported it: a rule that only the database knows about is one the
-- organiser discovers when a buyer is refused. This adds the writer, gated by
-- the same can_manage_event() predicate as everything else on that dashboard,
-- and returns both the ceiling and the current total so the number on screen is
-- derived rather than remembered.
--
-- Lowering capacity below what is already sold is REFUSED rather than silently
-- accepted, for the same reason M47 refuses shrinking a package below its sold
-- count: the seats are already promised, and a ceiling under the floor would
-- turn every subsequent checkout into an unexplained refusal.

create or replace function public.organizer_set_capacity(
  p_store_id uuid,
  p_capacity int
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_taken int;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if p_capacity is not null and p_capacity <= 0 then
    raise exception using errcode='RR005', message='Capacity has to be at least 1, or empty for no limit.';
  end if;

  -- Same lock the enforcement takes, so a checkout cannot slip between the
  -- count and the write and leave the ceiling under the floor.
  perform pg_advisory_xact_lock(hashtext('event_capacity:' || p_store_id::text));

  select coalesce(sum(oi.quantity), 0)::int into v_taken
    from order_items oi join orders o on o.id = oi.order_id
   where o.store_id = p_store_id and o.status not in ('cancelled','refunded');

  if p_capacity is not null and p_capacity < v_taken then
    raise exception using errcode='RR005',
      message=format('You have already sold or reserved %s places. Capacity cannot go below that.', v_taken);
  end if;

  update events set capacity = p_capacity where store_id = p_store_id;

  return jsonb_build_object('capacity', p_capacity, 'taken', v_taken);
end;
$function$;

revoke all on function public.organizer_set_capacity(uuid, int) from public, anon;
grant execute on function public.organizer_set_capacity(uuid, int) to authenticated, service_role;

-- Surface it on the dashboard payload. Patched programmatically so the rest of
-- this 6KB function — M47c content, M49d payment review — cannot be dropped by
-- retyping it, with the anchors asserted before and after.
do $$
declare
  v_def text; v_anchor constant text := '''canVerifyPayments'', can_verify_event_payments(s.id),';
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='organizer_event_detail';
  if v_def is null then raise exception 'M58b: organizer_event_detail() not found.'; end if;

  if position('''capacity''' in v_def) > 0 then
    raise notice 'M58b: capacity already present — nothing to do.';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'M58b: anchor not found; refusing to patch blindly.';
  end if;

  v_new := replace(v_def, v_anchor, v_anchor || chr(10)
    || '    -- M58. The venue ceiling and what is already against it, both'  || chr(10)
    || '    -- derived — an organiser should never be asked to remember either.' || chr(10)
    || '    ''capacity'', e.capacity,' || chr(10)
    || '    ''placesTaken'', coalesce((select sum(oi.quantity)::int' || chr(10)
    || '       from order_items oi join orders o2 on o2.id = oi.order_id' || chr(10)
    || '      where o2.store_id = s.id and o2.status not in (''cancelled'',''refunded'')), 0),');

  execute v_new;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='organizer_event_detail';
  if position('''capacity''' in v_def) = 0 then
    raise exception 'M58b: capacity did not land in the payload.'; end if;
  if position('tt.inclusions' in v_def) = 0 then
    raise exception 'M58b: the patch dropped M47c package content.'; end if;
  if position('receiptPath' in v_def) = 0 then
    raise exception 'M58b: the patch dropped M49d payment review.'; end if;
  if position('can_manage_event' in v_def) = 0 then
    raise exception 'M58b: the patch dropped the gate.'; end if;
end;
$$;
