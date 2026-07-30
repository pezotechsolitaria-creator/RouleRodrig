-- ============================================================================
-- 0003 — Producer-friendly additions + media storage + safe hardening
-- ----------------------------------------------------------------------------
-- Fully ADDITIVE. Existing migrations (0001, 0002) are immutable and untouched.
-- Everything here is idempotent (if-not-exists / on-conflict / guarded) so it is
-- safe to re-run and safe to apply after the already-validated core.
--
--   A. product_variants.unit + sold_by  — so "Red Snapper, Rs/kg" and
--      "Honey 250 g / 500 g / 1 kg" display and price correctly.
--   B. Seed producer categories (fish, honey, piment, handicraft …).
--   C. Non-invasive hardening verified on the validation branch (search_path
--      pin on the 4 plpgsql trigger fns; move citext out of public).
--   D. Supabase Storage bucket + RLS for merchant media (logos, covers, product
--      photos). Files are stored under "<store_id>/…"; a merchant can write only
--      inside their own store's folder; product images are publicly readable.
--
-- DEFERRED on purpose (documented, NOT done here): moving the SECURITY DEFINER
-- RLS helpers into a non-API-exposed `private` schema. It is low-risk (the fns
-- only return caller-self info or publicly-derivable status) and the refactor is
-- invasive (recreate fns + rewrite every policy), which conflicts with
-- "additive only". Revisit as a dedicated, separately-validated migration.
-- ============================================================================

-- ── A. Producer product attributes ──────────────────────────────────────────
alter table product_variants
  add column if not exists unit    text,                       -- kg | g | piece | pack | bottle | litre | bunch
  add column if not exists sold_by text not null default 'unit'
    check (sold_by in ('unit','weight'));

-- ── B. Seed producer-friendly platform categories (idempotent by slug) ───────
insert into categories (name, slug, icon, position) values
  ('Fish & Seafood',      'fish-seafood',    'fish',     10),
  ('Fruit & Vegetables',  'fruit-veg',       'carrot',   20),
  ('Honey',               'honey',           'honey',    30),
  ('Spices & Piment',     'spices-piment',   'flame',    40),
  ('Homemade & Snacks',   'homemade-snacks', 'utensils', 50),
  ('Handicraft & Art',    'handicraft',      'palette',  60),
  ('Souvenirs',           'souvenirs',       'gift',     70),
  ('Farm Produce',        'farm-produce',    'wheat',    80)
on conflict (slug) do nothing;

-- ── C. Non-invasive hardening (verified on the validation branch) ────────────
alter function set_updated_at()          set search_path = public;
alter function apply_inventory_movement() set search_path = public;
alter function sync_product_min_price()   set search_path = public;
alter function sync_store_rating()        set search_path = public;

-- Move citext out of the public schema (Supabase linter), guarded so re-running
-- is a no-op once it has already been relocated.
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext' and n.nspname = 'public'
  ) then
    alter extension citext set schema extensions;
  end if;
end $$;

-- ── D. Merchant media storage bucket + RLS ───────────────────────────────────
-- One public bucket. App uploads to path "<store_id>/<kind>/<file>", so the
-- first path segment identifies the owning store.
insert into storage.buckets (id, name, public)
values ('merchant-media', 'merchant-media', true)
on conflict (id) do nothing;

-- Public read (product images / logos are public).
drop policy if exists "merchant_media_public_read" on storage.objects;
create policy "merchant_media_public_read"
  on storage.objects for select
  using (bucket_id = 'merchant-media');

-- Store staff may write/update/delete ONLY inside their own store's folder.
-- The regex guards the ::uuid cast so a malformed path is simply denied.
drop policy if exists "merchant_media_staff_insert" on storage.objects;
create policy "merchant_media_staff_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'merchant-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and is_store_staff((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "merchant_media_staff_update" on storage.objects;
create policy "merchant_media_staff_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'merchant-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and is_store_staff((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "merchant_media_staff_delete" on storage.objects;
create policy "merchant_media_staff_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'merchant-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and is_store_staff((split_part(name, '/', 1))::uuid)
  );

-- ============================================================================
-- End 0003. Next (customer phase): 0004 — carts, wishlists, place_order() RPC
-- with atomic stock reservation, notifications.
-- ============================================================================
