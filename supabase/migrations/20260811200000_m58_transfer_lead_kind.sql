-- M58 — Let a TRANSFER request be recorded.
--
-- ── WHY TAXI AND TRANSFER ARE NOT THE SAME THING ───────────────────────────
-- Both quick actions pointed at /taxi, which made the homepage look like it had
-- a duplicate tile. They are different INTENTS and they need different screens:
--
--   Taxi     — "I need a ride now."      → who is available, call them.
--   Transfer — "I land on Tuesday at 14:20 with three bags and a family of
--               five."                    → a planned journey, arranged ahead.
--
-- A directory of drivers cannot answer the second one, and a from/to/date form
-- is the wrong tool for the first.
--
-- ── WHY A LEAD AND NOT A NEW BOOKING TABLE ─────────────────────────────────
-- A transfer is arranged by a person here: there is no driver-assignment engine
-- for it, and inventing a "confirmed" state that nothing enforces would be the
-- fake functionality this work is meant to avoid. So the request is recorded as
-- a lead — exactly like the taxi and food-concierge flows the owner already
-- runs — and it lands in Admin → Leads with the journey details attached. When
-- there is a real dispatch system, this row is the demand evidence that says
-- whether it is worth building.
--
-- ── THE THREE-PLACE GOTCHA ─────────────────────────────────────────────────
-- `kind` is gated in THREE independent places and all three must agree or the
-- insert fails with a constraint violation at runtime:
--   1. the RLS WITH CHECK policy (lead_events_anon_insert)  ← here
--   2. a table CHECK constraint (lead_events_kind_check)    ← here, if present
--   3. the KINDS array in app/api/leads/route.ts            ← in the app
-- Only the first two exist in this database today; the CHECK is handled
-- defensively so this migration is correct either way.

-- The kind list is written out in full in BOTH places below rather than held in
-- a variable: CREATE POLICY and ALTER TABLE are DDL, and a plpgsql variable
-- cannot be interpolated into them. Keeping the two literals adjacent is the
-- next best guarantee that they stay identical.
do $blk$
begin
  -- 1. The RLS gate.
  drop policy if exists lead_events_anon_insert on lead_events;
  create policy lead_events_anon_insert on lead_events
    for insert to anon, authenticated
    with check (kind = any (array['stay_eat_do', 'taxi', 'food_concierge', 'tiroule_miss', 'transfer']));

  -- 2. The CHECK constraint, if this database has one. Recreated rather than
  --    assumed: the two gates drifting apart is precisely how this fails.
  if exists (
    select 1 from pg_constraint
     where conrelid = 'lead_events'::regclass and conname = 'lead_events_kind_check'
  ) then
    alter table lead_events drop constraint lead_events_kind_check;
  end if;

  alter table lead_events
    add constraint lead_events_kind_check
    check (kind = any (array['stay_eat_do', 'taxi', 'food_concierge', 'tiroule_miss', 'transfer']));
end $blk$;

comment on constraint lead_events_kind_check on lead_events is
  'Kept in lockstep with the lead_events_anon_insert RLS policy and the KINDS array in app/api/leads/route.ts. All three must list the same kinds or an insert fails at runtime (M58).';
