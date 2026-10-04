-- M241 · A reported payment holds the date while Roulé checks the account.
--
-- Found by driving the guest page: a guest pays by MCB Juice at hour 10 of a
-- 12-hour hold and taps "I've paid". The report is only a report (it never
-- sets paid), so at hour 12 the sweep expired the booking, released the seats
-- and emailed "the hold ended because payment wasn't received" — to a guest
-- who had paid, because the owner had not opened his banking app yet.
--
-- So a report extends the hold by 24 hours from the moment it was made — a
-- full waking cycle for the owner, who is alerted at once (bell, WhatsApp,
-- email). It is bounded on purpose: a false "I've paid" must not hold a boat
-- for ever. Mirrored in lib/reservations/status.ts (REPORT_GRACE_HOURS,
-- isDueToExpire); sql-parity.test.ts keeps the two numbers equal.

create or replace function public.rsv_is_due(p_r public.reservations)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $$
  select p_r.reservation_status = 'confirmed'
     and p_r.payment_status in ('unpaid', 'payment_pending', 'failed')
     and p_r.payment_deadline_at is not null
     and greatest(p_r.payment_deadline_at,
                  coalesce(p_r.payment_reported_at + interval '24 hours', p_r.payment_deadline_at)) <= now();
$$;

create or replace function public.reservation_expire_due(p_limit int default 100)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
  v_refs text[] := '{}';
begin
  for r in
    select * from reservations
     where reservation_status = 'confirmed'
       and payment_status in ('unpaid', 'payment_pending', 'failed')
       and payment_deadline_at is not null
       and greatest(payment_deadline_at,
                    coalesce(payment_reported_at + interval '24 hours', payment_deadline_at)) <= now()
     order by payment_deadline_at
     limit greatest(p_limit, 0)
     for update skip locked
  loop
    perform rsv_expire_one(r);
    v_refs := v_refs || r.booking_reference;
  end loop;
  return jsonb_build_object('expired', cardinality(v_refs), 'refs', to_jsonb(v_refs));
end $$;

revoke all on function public.rsv_is_due(public.reservations) from public, anon, authenticated;
revoke all on function public.reservation_expire_due(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
