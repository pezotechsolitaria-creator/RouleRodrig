-- ── The half a policy is useless without ───────────────────────────────────
--
-- Caught while wiring the diary's settings panel, not by it failing: both of
-- these tables have a correct write policy and NO WRITE GRANT, which is exactly
-- the shape of the delivery_drivers bug — a self-read policy that had never once
-- run, leaving the /account delivery door missing for months. A policy without
-- a grant is dead code, and the symptom is `permission denied`, not a quiet
-- refusal, so it would have reached the owner as "That did not go through."
--
-- trade_providers already carries `trade_providers_write` (is_store_staff or
-- admin, on both using and with check), so the grant adds no reach: it lets the
-- policy be consulted at all. The `with check` half is what makes a whole-table
-- grant safe — a provider cannot move their row to a store they do not staff.
grant insert, update on trade_providers to authenticated;

-- ── How long each service takes ────────────────────────────────────────────
-- service_durations shipped with a read policy only, because m178 wrote the
-- durations from a probe running as postgres. A provider setting "Full valet =
-- 3 hours" from their own screen needs to write it.
--
-- KEYED ONLY BY variant_id, so the policy has to walk back to the store itself.
-- Without that join any signed-in person could set the length of any service on
-- the island, and a competitor quietly making a rival's wash three hours long
-- would empty their diary with nothing on screen to explain it.
drop policy if exists service_durations_write on service_durations;
create policy service_durations_write on service_durations
  for all
  using (
    exists (
      select 1 from product_variants pv
        join products p on p.id = pv.product_id
       where pv.id = service_durations.variant_id
         and (is_store_staff(p.store_id) or is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from product_variants pv
        join products p on p.id = pv.product_id
       where pv.id = service_durations.variant_id
         and (is_store_staff(p.store_id) or is_platform_admin())
    )
  );

grant insert, update, delete on service_durations to authenticated;
