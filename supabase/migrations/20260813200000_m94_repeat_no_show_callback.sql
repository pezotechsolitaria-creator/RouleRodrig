-- ── M94 — a third driver does not get sent to an empty pickup point ───────
--
-- M92 records no-shows and tells the driver who they are dealing with. It does
-- not ACT. So the same number could book again tomorrow, another driver spends
-- another hour and another tank of fuel, and the platform watches it happen
-- with the evidence already in the table.
--
-- NOT A BAN, deliberately. A silent permanent block is a punishment nobody can
-- appeal, applied by software, to a phone number that might have been mistyped
-- or reassigned. This stops the ride AUTO-DISPATCHING and puts it in front of a
-- human: somebody rings to confirm the passenger is really there, then releases
-- it. Two minutes of a person's time against an hour of a driver's. The refund
-- policy page now promises exactly this, so it has to be real.
--
-- HOW IT SKIPS DISPATCH WITHOUT TOUCHING DISPATCH. auto_dispatch_rides()
-- selects `where status in ('new','dispatching')` — read and verified, not
-- assumed — so a ride created in any other state is never picked up. Setting
-- 'no_driver' at insert diverts it with no change to a 68-line function that
-- would otherwise have had to be retyped (M88's lesson, again). 'no_driver'
-- already means "needs a human" throughout the admin UI.
--
-- Verified all three ways: two prior no-shows across two phone formats → held
-- with requires_callback; exactly ONE prior no-show → dispatches normally
-- (once is a mistake); a clean number → completely unaffected.
alter table public.ride_requests
  add column if not exists requires_callback boolean not null default false;

comment on column public.ride_requests.requires_callback is
  'Set at booking when this phone has repeat no-shows. The ride does not auto-dispatch; somebody rings to confirm first.';

-- Beside the other dispatch tuning, so the owner can move it without a deploy.
-- 2 by default: once is a mistake, twice is a pattern. 0 switches it off.
alter table public.dispatch_settings
  add column if not exists no_show_callback_threshold integer not null default 2;

create or replace function public.flag_repeat_no_show()
returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_threshold integer; v_prior integer;
begin
  -- Only at booking time, and only for a ride that would otherwise go straight
  -- out to drivers.
  if new.status is distinct from 'new' then
    return new;
  end if;

  select coalesce(no_show_callback_threshold, 2) into v_threshold
    from dispatch_settings where id = 'main';
  v_threshold := coalesce(v_threshold, 2);
  if v_threshold <= 0 then
    return new;
  end if;

  v_prior := taxi_no_show_count(new.customer_phone);
  if v_prior >= v_threshold then
    new.requires_callback := true;
    new.status := 'no_driver';
  end if;
  return new;
end;
$function$;

drop trigger if exists t_rides_flag_repeat_no_show on public.ride_requests;
create trigger t_rides_flag_repeat_no_show
  before insert on public.ride_requests
  for each row execute function public.flag_repeat_no_show();

-- For the Command Center: rides parked waiting for somebody to pick up a phone.
-- ACTION severity, not info — a real person booked a real ride and is being
-- deliberately ignored until someone calls.
create or replace function public.rides_awaiting_callback_count()
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select count(*)::int from ride_requests
   where requires_callback and status in ('new','no_driver','dispatching');
$function$;

revoke all on function public.rides_awaiting_callback_count() from public;
grant execute on function public.rides_awaiting_callback_count() to service_role;
