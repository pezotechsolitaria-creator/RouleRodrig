-- Splits the scheduling engine into a PURE core plus a thin "now" wrapper.
--
-- store_schedule_at(store, local_timestamp) contains all the logic and takes the
-- moment to evaluate as an argument. store_schedule_status(store) simply calls
-- it with the current Rodrigues wall clock. Two reasons this matters:
--
--   1. Testability. Opening/closing boundaries, midnight rollover and the
--      UTC->local day shift cannot be verified by waiting for the clock. With an
--      injectable instant every edge case is a deterministic assertion.
--   2. There is still exactly ONE implementation. The wrapper adds no rules of
--      its own, so nothing can drift between "now" and "at time T".
--
-- KNOWN LIMITATION, deliberate: closes_at > opens_at is enforced by CHECK, so a
-- window cannot cross midnight (e.g. 18:00-02:00). Rodrigues retail does not
-- need it and supporting it would make every comparison two-branched. If a
-- late-night venue ever needs it, model it as two rows and revisit the CHECK.
create or replace function store_schedule_at(p_store_id uuid, p_local timestamp)
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
  v_date  date    := p_local::date;
  v_time  time    := p_local::time;
  v_dow   smallint:= extract(dow from p_local)::smallint;
  v_row   store_hours%rowtype;
  v_any   boolean;
  v_open  boolean := false;
  v_deliv boolean := false;
  v_dopen time; v_dclose time;
  v_next  timestamptz := null;
  v_probe store_hours%rowtype;
  v_pd    date; v_pdow smallint;
  i       integer;
begin
  select exists (select 1 from store_hours h where h.store_id = p_store_id) into v_any;

  -- A dated override beats the recurring weekly rule (holidays, one-offs).
  select * into v_row from store_hours h
   where h.store_id = p_store_id and h.date = v_date limit 1;
  if v_row.id is null then
    select * into v_row from store_hours h
     where h.store_id = p_store_id and h.weekday = v_dow limit 1;
  end if;

  if v_row.id is null then
    -- No schedule at all => open (never let an unset default disable the shop).
    -- Has a schedule but no rule today => genuinely not a trading day.
    v_open  := not v_any;
    v_deliv := v_open;
  elsif v_row.is_closed then
    v_open := false; v_deliv := false;
  else
    -- Half-open interval: opening instant counts as open, closing instant does not.
    v_open   := v_time >= v_row.opens_at and v_time < v_row.closes_at;
    v_dopen  := coalesce(v_row.delivery_opens_at,  v_row.opens_at);
    v_dclose := coalesce(v_row.delivery_closes_at, v_row.closes_at);
    v_deliv  := v_open and not v_row.delivery_closed
                and v_time >= v_dopen and v_time < v_dclose;
  end if;

  if not v_open and v_any then
    for i in 0..14 loop
      v_pd := v_date + i; v_pdow := extract(dow from v_pd)::smallint;
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

-- Thin wrapper: the ONLY place the current time enters the system.
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
language sql stable security definer set search_path = public as $$
  select * from store_schedule_at(p_store_id, (now() at time zone 'Indian/Mauritius')::timestamp);
$$;

revoke execute on function store_schedule_at(uuid, timestamp) from public, anon, authenticated;

revoke execute on function store_schedule_status(uuid) from public;

grant  execute on function store_schedule_status(uuid) to anon, authenticated;
