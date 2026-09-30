-- ═══════════════════════════════════════════════════════════════════════════
-- M223b · AN eSIM IS IDENTIFIED BY ITS PROFILE ID, NOT ITS ICCID
-- ═══════════════════════════════════════════════════════════════════════════
--
-- eSIM Access recycles ICCIDs and keys every later call — usage, cancel,
-- top-up — on `esimTranNo`. Without it stored, the admin desk could not
-- cancel an uninstalled profile (the only way to get its cost back) or read
-- a customer's remaining data.

alter table public.esim_orders add column if not exists provider_profile_id text;
alter table public.esim_orders add column if not exists apn text;

create index if not exists esim_orders_profile_idx on public.esim_orders (provider_profile_id)
  where provider_profile_id is not null;
