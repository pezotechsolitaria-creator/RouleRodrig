-- ============================================================================
-- Identity & onboarding (R1 fix) — runs AFTER 20260730000001_marketplace_core.
-- ----------------------------------------------------------------------------
-- Adds the missing user-identity layer the core assumed but never modelled:
--   • profiles: one row per auth user (customers + merchant staff).
--   • auto-create a profile when a user signs up.
--   • when a user creates a merchant, they become its 'owner' staff.
--   • a merchant INSERT policy so a signed-in user can actually apply to join.
-- Depends on core objects: set_updated_at(), is_platform_admin(), merchants,
-- merchant_staff.
-- ============================================================================

-- One row per auth user — display info shared by customers and merchant staff.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  locale      text not null default 'en',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger t_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row the moment a user signs up (standard Supabase
-- pattern). SECURITY DEFINER so it can write public.profiles from the auth
-- trigger context; ON CONFLICT keeps it idempotent.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',
                           new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- When a merchant is created, its creator (owner_id) becomes 'owner' staff.
-- SECURITY DEFINER so it bypasses merchant_staff RLS at creation time.
create or replace function provision_merchant_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.merchant_staff (merchant_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (merchant_id, user_id) do update set role = 'owner';
  return new;
end $$;
create trigger t_merchant_provision_owner
  after insert on merchants
  for each row execute function provision_merchant_owner();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table profiles enable row level security;

-- A user sees/edits only their own profile; platform admins can read all.
create policy profiles_read_self  on profiles for select
  using (id = auth.uid() or is_platform_admin());
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- Inserts happen via the security-definer signup trigger — no client insert.

-- Onboarding: a signed-in user may create ONE-or-more merchants they own (they
-- always start 'pending' and go through admin approval). The core migration
-- only had read/update policies on merchants — this closes the gap so a user
-- can actually apply to join the marketplace.
create policy merchants_insert on merchants for insert
  with check (owner_id = auth.uid());
