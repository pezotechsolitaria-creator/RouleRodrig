-- ── M240c: THE MORNING-BEFORE REMINDER ───────────────────────────────────────
--
-- "Tomorrow, 09:00. Île aux Cocos. Meeting: Pointe du Diable. RR-8F42K."
-- Queued once per reservation (reminder_sent_at), from 08:00 Rodrigues time
-- on the day before, for holds that are actually going ahead: confirmed or
-- ready, and paid / paying in person / nothing to pay. Run by the minute job
-- (/api/cron/notifications) — the three Vercel cron slots are all taken.

create or replace function public.reservation_due_reminders(p_limit int default 50)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
  v_n int := 0;
  v_local timestamp := now() at time zone 'Indian/Mauritius';
begin
  if extract(hour from v_local) < 8 then
    return jsonb_build_object('sent', 0, 'waiting_for', '08:00');
  end if;
  for r in
    select * from reservations
     where slot_date = v_local::date + 1
       and reminder_sent_at is null
       and reservation_status in ('confirmed', 'ready')
       and payment_status in ('paid', 'pay_in_person', 'not_required', 'waived', 'partially_paid')
     order by slot_date
     limit greatest(p_limit, 0)
     for update skip locked
  loop
    update reservations set reminder_sent_at = now(), updated_at = now() where id = r.id;
    perform rsv_event(r.id, 'system', 'reminder', 'reminder_sent');
    perform rsv_notify_guest(r, 'reminder');
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('sent', v_n);
end $$;

revoke all on function public.reservation_due_reminders(int) from public, anon, authenticated;
