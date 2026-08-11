-- M60b — the only doors into a managed-ticketing agreement.
--
-- The table has no write policy, so these functions ARE the write surface. That
-- is what makes "platform-controlled columns" true rather than aspirational: an
-- organiser cannot set a fee because there is no function that lets them, not
-- because a column grant says so (column grants are a no-op under a table grant,
-- and RLS cannot restrict columns at all).
--
-- Two different gates, because there are two different principals:
--   * ORGANISER  → can_manage_event(store_id). Excludes door staff (M59).
--   * PLATFORM   → the M25 pattern. /admin reaches Postgres as service_role with
--                  auth.uid() NULL, so is_platform_admin() is unreachable from
--                  there; the gate has to be "if there IS a uid, it must be an
--                  admin's", which refuses a signed-in organiser and admits the
--                  cookie-session admin panel.

-- The basis a percentage fee is quoted against: confirmed ticket revenue.
-- READ ONLY, and deliberately not reused by anything in the revenue path — this
-- reads ticket money to DESCRIBE a fee, and must never be part of computing what
-- the organiser is owed.
create or replace function public.managed_ticketing_basis(p_store_id uuid)
returns int language sql stable security definer set search_path = public, pg_temp
as $function$
  select coalesce(sum(oi.line_total), 0)::int
    from orders o
    join order_items oi on oi.order_id = o.id
    join ticket_types tt on tt.variant_id = oi.variant_id
   where o.store_id = p_store_id
     and o.status in ('paid','preparing','ready_for_pickup','collected');
$function$;

-- Integer maths only, and the SAME rounding the marketplace commission uses:
-- floor((base * rateE5 + 50_000) / 100_000) is round-half-up at 1e-5 precision
-- and matches Postgres round(numeric) on every value either can produce.
create or replace function public.managed_ticketing_fee(
  p_fee_type managed_fee_type, p_amount int, p_rate_e5 int, p_basis int)
returns int language sql immutable
as $function$
  select case
    when p_fee_type = 'fixed'      then coalesce(p_amount, 0)
    when p_fee_type = 'percentage' then ((coalesce(p_basis,0)::bigint * coalesce(p_rate_e5,0) + 50000) / 100000)::int
    else 0 end;
$function$;

-- ── Organiser: ask for the service ──────────────────────────────────────────
create or replace function public.organizer_request_managed_ticketing(
  p_store_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_id uuid;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if exists (select 1 from managed_ticketing_agreements
              where store_id = p_store_id and status in ('requested','approved','active')) then
    raise exception using errcode='RR004', message='There is already an open managed-ticketing request for this event.';
  end if;

  -- status/fee are NOT parameters. A request starts with no fee, by construction.
  insert into managed_ticketing_agreements (store_id, status, requested_by, organiser_note)
  values (p_store_id, 'requested', auth.uid(), nullif(btrim(coalesce(p_note,'')), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'requested');
end;
$function$;

-- ── Organiser: accept the quoted fee ────────────────────────────────────────
create or replace function public.organizer_accept_managed_ticketing(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_row record;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select * into v_row from managed_ticketing_agreements
   where store_id = p_store_id and status in ('requested','approved')
   for update;
  if v_row.id is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if v_row.status <> 'approved' or v_row.fee_type is null then
    raise exception using errcode='RR004',
      message='There is no agreed fee to accept yet. Roulé Rodrigues will quote one first.';
  end if;

  update managed_ticketing_agreements
     set status = 'active', accepted_at = now(), accepted_by = auth.uid(), activated_at = now()
   where id = v_row.id;

  return jsonb_build_object('id', v_row.id, 'status', 'active');
end;
$function$;

-- ── Organiser: withdraw, but only before it is running ──────────────────────
create or replace function public.organizer_cancel_managed_ticketing(
  p_store_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_row record;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select * into v_row from managed_ticketing_agreements
   where store_id = p_store_id and status in ('requested','approved','active')
   for update;
  if v_row.id is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  -- An ACTIVE agreement is work already being done and possibly already
  -- invoiced. Ending it is a commercial conversation, not a button.
  if v_row.status = 'active' then
    raise exception using errcode='RR004',
      message='This service is already running. Contact Roulé Rodrigues to end it.';
  end if;

  update managed_ticketing_agreements
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancelled_reason = coalesce(nullif(btrim(coalesce(p_reason,'')),''), 'Withdrawn by the organiser')
   where id = v_row.id;

  return jsonb_build_object('id', v_row.id, 'status', 'cancelled');
end;
$function$;

-- ── Organiser: see the fee, clearly apart from ticket money ─────────────────
create or replace function public.organizer_managed_ticketing(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare v_row record; v_basis int; v_fee int;
begin
  if not can_manage_event(p_store_id) then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  select * into v_row from managed_ticketing_agreements
   where store_id = p_store_id
   order by case status when 'active' then 0 when 'approved' then 1 when 'requested' then 2 else 3 end,
            created_at desc
   limit 1;

  -- The absence of a row IS 'not_requested'. Synthesised here so the API speaks
  -- the full vocabulary without the table carrying a second way to mean nothing.
  if v_row.id is null then
    return jsonb_build_object('status', 'not_requested');
  end if;

  v_basis := managed_ticketing_basis(p_store_id);
  v_fee   := managed_ticketing_fee(v_row.fee_type, v_row.fee_amount_cents, v_row.fee_rate_e5, v_basis);

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'feeType', v_row.fee_type,
    'feeAmountCents', v_row.fee_amount_cents,
    'feeRateE5', v_row.fee_rate_e5,
    'feeCurrency', v_row.fee_currency,
    'serviceIncludes', v_row.service_includes,
    'organiserNote', v_row.organiser_note,
    'requestedAt', v_row.requested_at,
    'approvedAt', v_row.approved_at,
    'acceptedAt', v_row.accepted_at,
    'completedAt', v_row.completed_at,
    'cancelledAt', v_row.cancelled_at,
    'cancelledReason', v_row.cancelled_reason,
    'paymentStatus', v_row.payment_status,
    'paymentNote', v_row.payment_note,
    -- What a percentage fee WOULD come to at today's revenue. An estimate, and
    -- named one, because it moves until it is invoiced.
    'estimatedFeeCents', case when v_row.fee_type is null then null else v_fee end,
    'estimateBasisCents', case when v_row.fee_type = 'percentage' then v_basis else null end,
    -- Frozen at invoicing; from then on this is the number that is owed and it
    -- does not move when tickets are refunded.
    'invoicedFeeCents', v_row.invoiced_fee_cents,
    'invoicedBasisCents', v_row.invoiced_basis_cents,
    'invoicedAt', v_row.invoiced_at,
    -- Stated in the payload so the UI never has to compute or caveat it itself.
    'ticketRevenueCents', v_basis,
    'separationNote', 'This fee is owed by you to Roulé Rodrigues. It is not deducted from ticket sales and does not change what buyers pay.');
end;
$function$;

revoke all on function public.organizer_request_managed_ticketing(uuid, text) from public, anon;
revoke all on function public.organizer_accept_managed_ticketing(uuid) from public, anon;
revoke all on function public.organizer_cancel_managed_ticketing(uuid, text) from public, anon;
revoke all on function public.organizer_managed_ticketing(uuid) from public, anon;
revoke all on function public.managed_ticketing_basis(uuid) from public, anon;
grant execute on function public.organizer_request_managed_ticketing(uuid, text) to authenticated, service_role;
grant execute on function public.organizer_accept_managed_ticketing(uuid) to authenticated, service_role;
grant execute on function public.organizer_cancel_managed_ticketing(uuid, text) to authenticated, service_role;
grant execute on function public.organizer_managed_ticketing(uuid) to authenticated, service_role;
grant execute on function public.managed_ticketing_basis(uuid) to authenticated, service_role;

do $$
declare v_src text;
begin
  -- No organiser-facing function may accept a fee or a status from its caller.
  foreach v_src in array array['organizer_request_managed_ticketing','organizer_accept_managed_ticketing','organizer_cancel_managed_ticketing']
  loop
    if (select position('p_fee' in pg_get_functiondef(p.oid)) from pg_proc p
          join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname=v_src) > 0 then
      raise exception 'M60b: % takes a fee parameter — an organiser could set their own fee.', v_src;
    end if;
    if (select position('p_status' in pg_get_functiondef(p.oid)) from pg_proc p
          join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname=v_src) > 0 then
      raise exception 'M60b: % takes a status parameter — an organiser could approve themselves.', v_src;
    end if;
  end loop;
end;
$$;
