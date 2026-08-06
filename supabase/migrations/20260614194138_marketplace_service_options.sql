alter table public.marketplace_listings add column if not exists delivery boolean default false;
alter table public.marketplace_listings add column if not exists pickup boolean default false;
alter table public.marketplace_listings add column if not exists dine_in boolean default false;