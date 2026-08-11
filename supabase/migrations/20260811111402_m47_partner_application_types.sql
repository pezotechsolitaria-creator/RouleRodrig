-- ── M47 — the partner application form covers the admin-only listings ───────
--
-- Three things on this platform CANNOT be created by the person who wants them,
-- by deliberate design:
--
--   * taxi drivers      — only /api/admin/taxi inserts into taxi_drivers
--   * event organisers  — only admin_create_organizer() (M43) mints one
--   * delivery partners — M45 states it outright: "Approval is an admin act;
--                         submitting the form only produces `pending`"
--
-- Each of those is a correct rule: a taxi carries passengers, an organiser sells
-- tickets against the platform's merchant of record, and a delivery partner
-- handles other people's goods and cash. None should be self-serve.
--
-- But the rule was enforced by having NO FRONT DOOR AT ALL. A driver who wanted
-- to join had nowhere to ask, so the only route in was knowing the owner
-- personally. That is not vetting, it is obscurity — and it silently caps supply
-- on the three categories the marketplace most needs to grow.
--
-- This migration only widens the CHECK constraint so those applications can be
-- STORED. It deliberately does not create taxi_drivers, event_organizers or
-- delivery_drivers rows: an application is a request, and approval stays a
-- separate, human, admin act through the existing tools. Nothing here grants
-- anybody anything.
--
-- 'shop' is intentionally NOT added. The marketplace already has a real
-- self-serve path (/merchant/login → onboarding), and a second, slower door to
-- the same place would be a worse experience, not a better one.

do $$
begin
  -- Guarded rather than unconditional: this table predates the multi-category
  -- rework and an older database may still carry a constraint under a different
  -- shape. Dropping by name only when present keeps the migration re-runnable.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.owner_applications'::regclass
      and conname = 'owner_applications_listing_type_check'
  ) then
    alter table owner_applications drop constraint owner_applications_listing_type_check;
  end if;

  alter table owner_applications
    add constraint owner_applications_listing_type_check
    check (listing_type = any (array[
      'vehicle', 'restaurant', 'stay', 'activity', 'experience',
      -- M47 additions. Every one of these is admin-approval-only downstream.
      'taxi', 'event', 'delivery'
    ]));
end $$;

comment on column owner_applications.listing_type is
  'What the applicant wants listed. vehicle/restaurant/stay/activity/experience are reviewed then set up by the team; taxi/event/delivery (M47) additionally CANNOT be self-created anywhere in the product — a taxi_drivers row, an event_organizers row and a delivery_drivers row are each an admin act. An approved application is the trigger for that act, never a substitute for it.';

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v_missing text;
begin
  -- Every value the API will send must be accepted, or the form 500s on submit
  -- for exactly the categories this migration exists to enable.
  foreach v_missing in array array['vehicle','restaurant','stay','activity','experience','taxi','event','delivery']
  loop
    begin
      insert into owner_applications (owner_name, phone, listing_type, status)
      values ('__m47_probe__', '__m47_probe__', v_missing, 'pending');
    exception when check_violation then
      raise exception 'M47: listing_type % is rejected by the CHECK constraint', v_missing;
    end;
  end loop;

  -- The probes proved the constraint; they must not survive as real rows in the
  -- owner's application inbox.
  delete from owner_applications where owner_name = '__m47_probe__';
  if exists (select 1 from owner_applications where owner_name = '__m47_probe__') then
    raise exception 'M47: probe rows were not cleaned up';
  end if;

  -- A value outside the set must still be refused — widening the list must not
  -- have degraded into "anything goes".
  begin
    insert into owner_applications (owner_name, phone, listing_type, status)
    values ('__m47_probe__', '__m47_probe__', 'not_a_real_type', 'pending');
    delete from owner_applications where owner_name = '__m47_probe__';
    raise exception 'M47: the CHECK constraint no longer rejects unknown listing types';
  exception when check_violation then
    null; -- expected
  end;
end $$;
