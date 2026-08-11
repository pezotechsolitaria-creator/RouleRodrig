-- M60c — the platform side of a managed-ticketing agreement.
--
-- THE ADMIN GATE IS NOT is_platform_admin() ALONE. /admin authenticates with a
-- signed cookie and reaches Postgres through the service role, where auth.uid()
-- is NULL — so is_platform_admin() is false there and a naive gate would lock
-- the admin panel out of its own feature (this exact mistake shipped in M23 and
-- was fixed in M25). The working shape is: if there IS a signed-in user, they
-- must be an admin. A signed-in organiser is refused; the cookie-session panel
-- is admitted.
--
-- No pricing is defined here. fee_type, amount, rate and the service
-- description are all arguments, all supplied by the business at the moment
-- they decide — this migration ships no default fee of any kind.

create or replace function public.admin_set_managed_ticketing_fee(
  p_agreement_id uuid,
  p_fee_type     text,
  p_amount_cents int default null,
  p_rate_e5      int default null,
  p_includes     text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_row record; v_type managed_fee_type;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  if p_fee_type not in ('fixed','percentage') then
    raise exception using errcode='RR005', message='Fee type must be fixed or percentage.';
  end if;
  v_type := p_fee_type::managed_fee_type;

  if v_type = 'fixed' then
    if p_amount_cents is null or p_amount_cents < 0 then
      raise exception using errcode='RR005', message='A fixed fee needs an amount of at least zero.';
    end if;
  else
    if p_rate_e5 is null or p_rate_e5 < 0 or p_rate_e5 > 50000 then
      raise exception using errcode='RR005', message='A percentage fee must be between 0 and 50%.';
    end if;
  end if;

  select * into v_row from managed_ticketing_agreements where id = p_agreement_id for update;
  if v_row.id is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  -- Re-quoting a running agreement would silently change what somebody already
  -- agreed to. Ending it and starting a new one is the honest path.
  if v_row.status not in ('requested','approved') then
    raise exception using errcode='RR004',
      message=format('Cannot re-quote an agreement that is "%s".', v_row.status);
  end if;

  update managed_ticketing_agreements
     set fee_type = v_type,
         fee_amount_cents = case when v_type = 'fixed' then p_amount_cents else null end,
         fee_rate_e5      = case when v_type = 'percentage' then p_rate_e5 else null end,
         service_includes = nullif(btrim(coalesce(p_includes,'')), ''),
         fee_set_by = auth.uid(), fee_set_at = now(),
         status = 'approved',
         approved_at = coalesce(approved_at, now()),
         approved_by = coalesce(approved_by, auth.uid()),
         -- A re-quote before acceptance withdraws the previous acceptance, so
         -- nobody is bound to a number they never saw.
         accepted_at = null, accepted_by = null
   where id = p_agreement_id;

  return jsonb_build_object('id', p_agreement_id, 'status', 'approved', 'feeType', v_type);
end;
$function$;

create or replace function public.admin_update_managed_ticketing_status(
  p_agreement_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_row record; v_new managed_ticketing_status;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if p_status not in ('approved','active','completed','cancelled') then
    raise exception using errcode='RR005', message='Unknown status.';
  end if;
  v_new := p_status::managed_ticketing_status;

  select * into v_row from managed_ticketing_agreements where id = p_agreement_id for update;
  if v_row.id is null then raise exception using errcode='RR003', message='Not found.'; end if;
  if v_row.status in ('completed','cancelled') then
    raise exception using errcode='RR004', message='This agreement is already closed.';
  end if;
  if v_new = 'cancelled' and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception using errcode='RR005', message='Give a reason when cancelling.';
  end if;
  -- The active_has_fee constraint would refuse this anyway; saying so plainly
  -- beats surfacing a constraint name to an operator.
  if v_new in ('active','completed') and (v_row.fee_type is null or v_row.accepted_at is null) then
    raise exception using errcode='RR004',
      message='The organiser has not accepted a fee yet, so this cannot be made active.';
  end if;

  update managed_ticketing_agreements
     set status = v_new,
         activated_at = case when v_new = 'active' then coalesce(activated_at, now()) else activated_at end,
         completed_at = case when v_new = 'completed' then now() else completed_at end,
         cancelled_at = case when v_new = 'cancelled' then now() else cancelled_at end,
         cancelled_by = case when v_new = 'cancelled' then auth.uid() else cancelled_by end,
         cancelled_reason = case when v_new = 'cancelled' then btrim(p_reason) else cancelled_reason end
   where id = p_agreement_id;

  return jsonb_build_object('id', p_agreement_id, 'status', v_new);
end;
$function$;

create or replace function public.admin_set_managed_ticketing_payment(
  p_agreement_id uuid, p_payment_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_row record; v_new managed_payment_status; v_basis int; v_fee int;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;
  if p_payment_status not in ('unpaid','invoiced','paid','waived') then
    raise exception using errcode='RR005', message='Unknown payment status.';
  end if;
  v_new := p_payment_status::managed_payment_status;

  select * into v_row from managed_ticketing_agreements where id = p_agreement_id for update;
  if v_row.id is null then raise exception using errcode='RR003', message='Not found.'; end if;
  if v_row.fee_type is null then
    raise exception using errcode='RR004', message='There is no fee to invoice yet.';
  end if;

  -- FREEZING. A percentage fee tracks ticket revenue until the moment it is
  -- invoiced, and then stops for good. Without this the invoice would quietly
  -- disagree with itself every time a ticket was refunded — and a refund
  -- changing an already-issued invoice is precisely the fee/revenue contamination
  -- this whole design exists to prevent.
  if v_new = 'invoiced' and v_row.invoiced_at is null then
    v_basis := managed_ticketing_basis(v_row.store_id);
    v_fee   := managed_ticketing_fee(v_row.fee_type, v_row.fee_amount_cents, v_row.fee_rate_e5, v_basis);
    update managed_ticketing_agreements
       set payment_status = v_new, payment_status_at = now(),
           payment_note = nullif(btrim(coalesce(p_note,'')), ''),
           invoiced_basis_cents = v_basis, invoiced_fee_cents = v_fee, invoiced_at = now()
     where id = p_agreement_id;
  else
    update managed_ticketing_agreements
       set payment_status = v_new, payment_status_at = now(),
           payment_note = nullif(btrim(coalesce(p_note,'')), '')
     where id = p_agreement_id;
  end if;

  select * into v_row from managed_ticketing_agreements where id = p_agreement_id;
  return jsonb_build_object('id', p_agreement_id, 'paymentStatus', v_row.payment_status,
                            'invoicedFeeCents', v_row.invoiced_fee_cents);
end;
$function$;

create or replace function public.admin_managed_ticketing_list()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', g.id, 'storeId', g.store_id,
             'eventName', s.name, 'eventSlug', s.slug, 'startsAt', e.starts_at,
             'status', g.status,
             'feeType', g.fee_type, 'feeAmountCents', g.fee_amount_cents,
             'feeRateE5', g.fee_rate_e5, 'serviceIncludes', g.service_includes,
             'organiserNote', g.organiser_note,
             'requestedAt', g.requested_at, 'acceptedAt', g.accepted_at,
             'paymentStatus', g.payment_status,
             'invoicedFeeCents', g.invoiced_fee_cents,
             'invoicedBasisCents', g.invoiced_basis_cents,
             -- Live basis so an operator can see what a percentage quote is
             -- worth before they invoice it.
             'ticketRevenueCents', managed_ticketing_basis(g.store_id))
           order by g.requested_at desc)
    from managed_ticketing_agreements g
    join stores s on s.id = g.store_id
    left join events e on e.store_id = g.store_id), '[]'::jsonb);
end;
$function$;

revoke all on function public.admin_set_managed_ticketing_fee(uuid, text, int, int, text) from public, anon, authenticated;
revoke all on function public.admin_update_managed_ticketing_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_managed_ticketing_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_managed_ticketing_list() from public, anon, authenticated;
grant execute on function public.admin_set_managed_ticketing_fee(uuid, text, int, int, text) to service_role;
grant execute on function public.admin_update_managed_ticketing_status(uuid, text, text) to service_role;
grant execute on function public.admin_set_managed_ticketing_payment(uuid, text, text) to service_role;
grant execute on function public.admin_managed_ticketing_list() to service_role;

do $$
declare v_src text; v_name text;
begin
  foreach v_name in array array['admin_set_managed_ticketing_fee','admin_update_managed_ticketing_status',
                                'admin_set_managed_ticketing_payment','admin_managed_ticketing_list']
  loop
    select pg_get_functiondef(p.oid) into v_src from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name;
    if position('auth.uid() is not null and not is_platform_admin()' in v_src) = 0 then
      raise exception '%: missing the M25 admin gate — either unreachable from /admin or open to organisers.', v_name;
    end if;
    -- authenticated must not hold EXECUTE, or a signed-in organiser could call
    -- it directly and be refused only by the in-function gate.
    if has_function_privilege('authenticated', (select p.oid from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name), 'EXECUTE') then
      raise exception '%: authenticated can execute an admin function.', v_name;
    end if;
  end loop;
end;
$$;
