-- THE scheduling engine. Every layer — checkout RPC, quote RPC, storefront,
-- merchant dashboard, admin dashboard, public API — answers "is this shop open"
-- by calling THIS function. There is deliberately no second implementation that
-- could drift; the TypeScript side formats and presents what this returns.
--
-- Time: Rodrigues is UTC+4 (Indian/Mauritius) and does not observe DST. This
-- server runs in UTC, so `now()` is up to a whole calendar day out of step with
-- the shop's wall clock — at 20:30 UTC it is already the next day in Rodrigues.
-- Every comparison below therefore goes through
--   now() at time zone 'Indian/Mauritius'
-- which yields the local wall-clock timestamp. Never compare against bare now().
--
-- DEFAULT POLICY — deliberate, and the most important decision in this file.
-- A store with NO schedule rows is treated as OPEN, and reports has_schedule
-- = false. M7 already learned this the hard way: stores.fulfillment defaulted to
-- delivery:false, nothing ever wrote it, and the entire delivery feature was
-- unreachable for every real merchant. A default must never silently switch the
-- product off. Callers that want to nag the merchant use has_schedule; callers
-- that gate orders use is_open.
--
-- weekday follows Postgres extract(dow): 0 = Sunday .. 6 = Saturday.
create or replace function store_schedule_status(p_store_id uuid)
returns table (
  has_schedule       boolean,
  is_open            boolean,
  delivery_available boolean,
  local_date         date,
  local_time         time,
  weekday            smallint,
  opens_at           time,
  closes_at          time,
  is_closed          boolean,
  delivery_opens_at  time,
  delivery_closes_at time,
  delivery_closed    boolean,
  is_override        boolean,
  next_open_at       timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_now      timestamp;   -- Rodrigues wall clock
  v_date     date;
  v_time     time;
  v_dow      smallint;
  v_row      store_hours%rowtype;
  v_any      boolean;
  v_open     boolean := false;
  v_deliv    boolean := false;
  v_dopen    time;
  v_dclose   time;
  v_next     timestamptz := null;
  v_probe    store_hours%rowtype;
  v_pd       date;
  v_pdow     smallint;
  i          integer;
begin
  v_now  := now() at time zone 'Indian/Mauritius';
  v_date := v_now::date;
  v_time := v_now::time;
  v_dow  := extract(dow from v_now)::smallint;

  select exists (select 1 from store_hours h where h.store_id = p_store_id) into v_any;

  -- A dated override beats the recurring weekly rule (holidays, one-offs).
  select * into v_row from store_hours h
   where h.store_id = p_store_id and h.date = v_date limit 1;

  if v_row.id is null then
    select * into v_row from store_hours h
     where h.store_id = p_store_id and h.weekday = v_dow limit 1;
  end if;

  if v_row.id is null then
    -- No rule for today. If the shop has no schedule at all, stay open (see
    -- DEFAULT POLICY above). If it has a schedule but nothing for today, that
    -- day is genuinely not a trading day.
    v_open  := not v_any;
    v_deliv := v_open;
  elsif v_row.is_closed then
    v_open := false; v_deliv := false;
  else
    v_open := v_time >= v_row.opens_at and v_time < v_row.closes_at;
    -- NULL delivery bounds mean "delivery follows the shop's hours".
    v_dopen  := coalesce(v_row.delivery_opens_at,  v_row.opens_at);
    v_dclose := coalesce(v_row.delivery_closes_at, v_row.closes_at);
    v_deliv  := v_open
                and not v_row.delivery_closed
                and v_time >= v_dopen and v_time < v_dclose;
  end if;

  -- Next opening instant, scanning today plus 14 days. Today counts only if the
  -- shop has not already opened, so "next" never points into the past.
  if not v_open and v_any then
    for i in 0..14 loop
      v_pd   := v_date + i;
      v_pdow := extract(dow from v_pd)::smallint;

      select * into v_probe from store_hours h
       where h.store_id = p_store_id and h.date = v_pd limit 1;
      if v_probe.id is null then
        select * into v_probe from store_hours h
         where h.store_id = p_store_id and h.weekday = v_pdow limit 1;
      end if;

      if v_probe.id is not null and not v_probe.is_closed and v_probe.opens_at is not null then
        if i > 0 or v_time < v_probe.opens_at then
          v_next := (v_pd + v_probe.opens_at) at time zone 'Indian/Mauritius';
          exit;
        end if;
      end if;
      v_probe := null;
    end loop;
  end if;

  return query select
    v_any, v_open, v_deliv, v_date, v_time, v_dow,
    v_row.opens_at, v_row.closes_at, coalesce(v_row.is_closed, false),
    v_row.delivery_opens_at, v_row.delivery_closes_at, coalesce(v_row.delivery_closed, false),
    (v_row.id is not null and v_row.date is not null),
    v_next;
end;
$$;

revoke execute on function store_schedule_status(uuid) from public, anon;

grant execute on function store_schedule_status(uuid) to authenticated, anon;
