-- M59c — close the leak M59 opened, found by testing rather than by reading.
--
-- M59 narrowed can_manage_event() to role='organizer', which correctly refused
-- door staff everywhere that predicate is used. organizer_my_events() does NOT
-- use it: it queries event_organizer_assignments directly, filtering only on
-- `o.user_id = auth.uid() and o.status = 'active'`. A door staffer therefore got
-- a full row back — including gross_confirmed, the event's confirmed ticket
-- revenue — simply by calling the organiser endpoint the dashboard uses.
--
-- Verified live before this fix: a door_staff user received 1 row with
-- gross_confirmed present. It read 0 only because the fixture has no confirmed
-- sales; on a real event it would have been the real number.
--
-- THE GENERAL LESSON, which is why this migration also touches
-- guest_report_payment: after adding a role, the dangerous functions are not the
-- ones that call the permission predicate — those were fixed automatically —
-- but the ones that reimplement the membership test inline. Those were
-- enumerated (5 found: 3 admin-only and correct, 2 fixed here) rather than
-- guessed at.

-- ── The leak ────────────────────────────────────────────────────────────────
-- Reproduced whole with ONE added condition, so no earlier amendment is lost.
create or replace function public.organizer_my_events()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.starts_at)
    from (
      select
        s.id as store_id, s.slug, s.name,
        e.starts_at, e.ends_at, e.venue_name, e.cancelled_at,
        event_phase(s.id) as phase,
        s.status::text as store_status,
        coalesce(inv.remaining, 0) as remaining,
        coalesce(units.awaiting, 0) as awaiting,
        coalesce(units.confirmed, 0) as confirmed,
        coalesce(inv.remaining, 0) + coalesce(units.awaiting, 0)
          + coalesce(units.confirmed, 0) as capacity,
        coalesce(tk.issued, 0) as issued,
        coalesce(tk.redeemed, 0) as redeemed,
        coalesce(money.gross, 0) as gross_confirmed,
        a.can_verify_payments
      from event_organizer_assignments a
      join stores s on s.id = a.store_id
      join events e on e.store_id = s.id
      join event_organizers o on o.id = a.organizer_id
      left join lateral (
        select sum(v.stock_quantity)::int as remaining
        from product_variants v
        join products p on p.id = v.product_id
        join ticket_types tt on tt.variant_id = v.id
        where p.store_id = s.id and v.is_active
      ) inv on true
      left join lateral (
        select
          sum(oi.quantity) filter (
            where ord.status in ('pending_payment','awaiting_payment_confirmation'))::int as awaiting,
          sum(oi.quantity) filter (
            where ord.status in ('paid','preparing','ready_for_pickup','collected'))::int as confirmed
        from orders ord
        join order_items oi on oi.order_id = ord.id
        join ticket_types tt on tt.variant_id = oi.variant_id
        where ord.store_id = s.id
      ) units on true
      left join lateral (
        select count(*)::int as issued,
               count(*) filter (where t.state = 'used')::int as redeemed
        from tickets t where t.store_id = s.id and t.state <> 'void'
      ) tk on true
      left join lateral (
        select sum(oi.line_total)::int as gross
        from orders ord
        join order_items oi on oi.order_id = ord.id
        join ticket_types tt on tt.variant_id = oi.variant_id
        where ord.store_id = s.id
          and ord.status in ('paid','preparing','ready_for_pickup','collected')
      ) money on true
      -- THE FIX. This row carries revenue, so it belongs to organisers only.
      -- Door staff have scanner_my_events(), which carries none.
      where o.user_id = auth.uid() and o.status = 'active' and a.role = 'organizer'
    ) x), '[]'::jsonb);
end;
$function$;

-- ── Defence in depth ────────────────────────────────────────────────────────
-- guest_report_payment notifies assignees with can_verify_payments, which door
-- staff never have — so this is already safe. Made explicit anyway: the flag and
-- the role are two independent reasons, and a future migration that grants the
-- flag by mistake should still not page a gate scanner about somebody's money.
do $$
declare
  v_def text; v_anchor constant text := '       and o.status = ''active''
       and a.can_verify_payments;';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='guest_report_payment';
  if v_def is null then raise exception 'M59c: guest_report_payment not found.'; end if;

  if position('a.role = ''organizer''' in v_def) > 0 then
    raise notice 'M59c: guest_report_payment already role-aware.';
  elsif position(v_anchor in v_def) = 0 then
    raise exception 'M59c: notify anchor not found in guest_report_payment; refusing to patch blindly.';
  else
    execute replace(v_def, v_anchor,
      '       and o.status = ''active''
       and a.role = ''organizer''
       and a.can_verify_payments;');
  end if;
end;
$$;

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='organizer_my_events';
  if position('a.role = ''organizer''' in v_src) = 0 then
    raise exception 'M59c: organizer_my_events still leaks revenue to door staff.'; end if;
  if position('gross_confirmed' in v_src) = 0 then
    raise exception 'M59c: organizer_my_events lost gross_confirmed — organisers would lose their revenue figure.'; end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='guest_report_payment';
  if position('a.role = ''organizer''' in v_src) = 0 then
    raise exception 'M59c: guest_report_payment did not gain the role filter.'; end if;
  if position('payment_receipt_path' in v_src) = 0 then
    raise exception 'M59c: the patch dropped M49b proof handling.'; end if;
end;
$$;
