-- ── M199 · A DEADLINE STORED IN THE DATABASE IS COMPARED IN THE DATABASE ────
--
-- app/api/cron/reminders/route.ts fetched the reservations to cancel with:
--
--     .eq("status", "approved")
--     .lt("payment_due_by", new Date().toISOString())
--
-- payment_due_by is a database column. new Date() is the clock of whichever
-- serverless container happened to run the cron. Those are two different
-- clocks, and nothing keeps them together.
--
-- This is not hypothetical. On 2026-09-10 this project's own dev machine read
-- 23:30 UTC while the database read 17:27 UTC the following day — eighteen
-- hours apart. A container that far ahead cancels approved reservations that
-- still have hours to run, emails the customer that their payment window
-- passed, and hands the vehicle back to the pool. A container running slow
-- leaves dead reservations holding scooters nobody can book.
--
-- Both halves are silent. Neither raises an error, and the cancellation email
-- is indistinguishable from a legitimate one.
--
-- So the comparison moves to where the column lives. The cron passes no
-- timestamps at all — it cannot, because it has no timestamp worth trusting.

create or replace function public.expired_hold_ids()
returns table (id uuid)
language sql
security definer
set search_path = public
stable
as $$
  -- now() is the database's clock, the same clock that wrote payment_due_by.
  -- deposit_paid_at is re-checked here as well as in the caller: a payment
  -- landing in the same second as the sweep must never lose the vehicle.
  select b.id
  from public.bookings b
  where b.status = 'approved'
    and b.payment_due_by is not null
    and b.payment_due_by < now()
    and b.deposit_paid_at is null
$$;

-- The cron worker runs as the service role. Nothing else may enumerate which
-- reservations are about to be cancelled.
revoke all on function public.expired_hold_ids() from public;
revoke all on function public.expired_hold_ids() from anon;
revoke all on function public.expired_hold_ids() from authenticated;
grant execute on function public.expired_hold_ids() to service_role;

comment on function public.expired_hold_ids() is
  'Reservations whose payment window has genuinely passed, judged by the '
  'database clock. Callers must not filter on payment_due_by themselves: the '
  'Node clock and the database clock have been observed 18 hours apart.';
