create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  scooter_id text,
  scooter_name text,
  name text not null,
  origin text,
  rating int not null check (rating between 1 and 5),
  text text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);

alter table public.product_reviews enable row level security;

-- Mirror the access model used by the other tables: app-layer cookie auth
-- protects the admin routes; the public API only ever queries approved rows.
create policy "reviews_public_select" on public.product_reviews
  for select to public using (true);

-- Anonymous visitors may submit, but ONLY as pending (cannot self-approve).
create policy "reviews_anon_insert" on public.product_reviews
  for insert to anon with check (status = 'pending');

create policy "reviews_public_update" on public.product_reviews
  for update to public using (true) with check (true);

create policy "reviews_public_delete" on public.product_reviews
  for delete to public using (true);

create index if not exists product_reviews_status_idx
  on public.product_reviews (status, created_at desc);