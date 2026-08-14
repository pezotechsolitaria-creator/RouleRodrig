-- ── M103b · Least privilege for vehicle_can_carry ───────────────────────────
--
-- M103 granted EXECUTE to `authenticated` so a driver screen could ask the
-- database whether their vehicle takes large jobs. The screen was then built
-- against lib/delivery/vehicle.ts instead — a pure mirror with its own tests —
-- so nothing in the app ever calls this over REST.
--
-- That leaves unused privilege on a SECURITY DEFINER function which reads
-- delivery_settings, a table signed-in users have no other route to. Supabase's
-- security advisor flagged it by name, and it was right to.
--
-- Dispatch is unaffected: dispatch_candidates is itself SECURITY DEFINER, so
-- the call inside it runs as the function owner rather than as the signed-in
-- caller. Verified after applying — a large job still reaches only the van, a
-- standard job still reaches the whole fleet.
revoke execute on function public.vehicle_can_carry(text, text) from authenticated;

comment on function public.vehicle_can_carry(text, text) is
  'Can this vehicle take this job? Called only from inside dispatch (service_role). Screens use lib/delivery/vehicle.ts, a tested mirror — keep the two in step (M103, tightened M103b).';
