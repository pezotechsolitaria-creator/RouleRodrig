-- ── What makes a place popular, and the fact that we did not know ─────────
--
-- The brief asks for a ranking that blends page views, bookings, ratings and
-- recency. Every one of those was checked before writing this:
--
--   place_bookings   0 rows
--   reviews          1 row
--   page views       no table at all
--   the 42 map places live in a CMS blob and join to NOTHING transactional
--
-- A score over those inputs today ranks all 42 places at zero and then prints
-- "Popular" on whichever happens to sort first. That is not a ranking, it is a
-- claim to a tourist that we cannot support — worse than the stat card showing
-- a zero this codebase already warns about, because a visitor plans a day
-- around it.
--
-- So this migration does the part that has to come first: START COUNTING.
--
-- ── ONE ROW PER PLACE PER KIND PER DAY ─────────────────────────────────────
-- Not one row per view. 42 places × 4 kinds × 365 days is 61k rows a YEAR at
-- the absolute ceiling, and it still answers "this week" exactly rather than
-- through a decaying counter nobody can audit. Storage on this project is the
-- constraint (site_content alone was 35 GB/mo of egress), so a raw event log
-- was never an option.
create table if not exists place_events (
  -- MapLocation.id from the CMS blob. Deliberately text and deliberately NOT a
  -- foreign key: the places are content, they are renamed and re-ordered by the
  -- owner, and a counter that blocked him from deleting a place would be a
  -- worse feature than a counter with an orphan row in it.
  place_id text not null,
  kind     text not null check (kind in ('view', 'directions', 'save', 'share')),
  day      date not null,
  n        integer not null default 0 check (n >= 0),
  primary key (place_id, kind, day)
);

comment on table place_events is
  'Daily counters behind the map''s Popular layer. One row per place per kind per day, never one per view. place_id is a CMS id and has no foreign key on purpose — content is renamed and deleted freely, and an orphan counter is cheaper than a blocked delete.';

create index if not exists place_events_recent_idx on place_events (day desc, place_id);

alter table place_events enable row level security;
-- RPC-only both ways: reads go through place_popularity() so the shape is one
-- decision, and writes go through bump_place_event() so a client cannot post
-- an arbitrary number.
revoke all on table place_events from anon, authenticated;

-- ── Counting one ───────────────────────────────────────────────────────────
create or replace function public.bump_place_event(
  p_place_id text,
  p_kind text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(btrim(p_place_id), '') = '' or length(p_place_id) > 120 then
    return;                                   -- junk in, nothing out
  end if;
  if p_kind not in ('view', 'directions', 'save', 'share') then
    return;
  end if;

  insert into place_events (place_id, kind, day, n)
  values (btrim(p_place_id), p_kind, (now() at time zone 'Indian/Mauritius')::date, 1)
  on conflict (place_id, kind, day) do update set n = place_events.n + 1;
end $function$;

-- Anonymous by design: the people this counts are tourists reading a guide,
-- and requiring an account would count only the handful who have one. The
-- route in front of it rate-limits by IP; nothing here is money, and the worst
-- a determined faker achieves is promoting a beach.
revoke all on function public.bump_place_event(text, text) from public;
grant execute on function public.bump_place_event(text, text) to anon, authenticated;

-- ── Reading them back ──────────────────────────────────────────────────────
-- Aggregate only. No visitor identity is stored anywhere in this feature, so
-- there is nothing here to leak by making it public.
create or replace function public.place_popularity(
  p_days integer default 7
) returns table (
  place_id text,
  views_window bigint,
  views_all bigint,
  directions_window bigint,
  saves_all bigint,
  last_seen date
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with w as (select greatest(1, least(coalesce(p_days, 7), 365)) as d)
  select e.place_id,
         coalesce(sum(e.n) filter (
           where e.kind = 'view'
             and e.day >= (now() at time zone 'Indian/Mauritius')::date - (select d from w)
         ), 0),
         coalesce(sum(e.n) filter (where e.kind = 'view'), 0),
         coalesce(sum(e.n) filter (
           where e.kind = 'directions'
             and e.day >= (now() at time zone 'Indian/Mauritius')::date - (select d from w)
         ), 0),
         coalesce(sum(e.n) filter (where e.kind = 'save'), 0),
         max(e.day)
    from place_events e
   group by e.place_id;
$function$;

revoke all on function public.place_popularity(integer) from public;
grant execute on function public.place_popularity(integer) to anon, authenticated;

-- ── Housekeeping ───────────────────────────────────────────────────────────
-- Called from the daily cron. Two years is long enough to answer "was this
-- place popular last season", and short enough that the table never becomes
-- something anyone has to think about.
create or replace function public.prune_place_events()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_gone integer;
begin
  delete from place_events
   where day < (now() at time zone 'Indian/Mauritius')::date - 730;
  get diagnostics v_gone = row_count;
  return v_gone;
end $function$;

revoke all on function public.prune_place_events() from public, anon, authenticated;
