-- Waitlist signups
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  source text,            -- where they signed up from
  created_at timestamptz default now()
);

alter table public.waitlist enable row level security;

-- Same access model as the other tables (app-layer cookie auth protects admin)
create policy "waitlist_anon_insert" on public.waitlist
  for insert to anon with check (true);
create policy "waitlist_public_select" on public.waitlist
  for select to public using (true);
create policy "waitlist_public_delete" on public.waitlist
  for delete to public using (true);

create unique index if not exists waitlist_email_unique on public.waitlist (lower(email));

-- Track which reminders have already been sent so the daily cron is idempotent
alter table public.bookings add column if not exists pickup_reminded boolean default false;
alter table public.bookings add column if not exists return_reminded boolean default false;