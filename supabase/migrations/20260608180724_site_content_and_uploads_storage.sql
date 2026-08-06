-- 1) Single-row site content store (replaces Vercel KV / content.json)
create table if not exists public.site_content (
  id text primary key default 'main',
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table public.site_content enable row level security;

create policy "sc_public_select" on public.site_content
  for select to public using (true);
create policy "sc_anon_insert" on public.site_content
  for insert to anon with check (true);
create policy "sc_public_update" on public.site_content
  for update to public using (true) with check (true);

-- 2) Public storage bucket for admin image uploads (replaces Vercel Blob)
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

-- Allow public read + anonymous upload to the 'uploads' bucket
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='uploads_public_read') then
    create policy "uploads_public_read" on storage.objects
      for select to public using (bucket_id = 'uploads');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='uploads_anon_insert') then
    create policy "uploads_anon_insert" on storage.objects
      for insert to anon with check (bucket_id = 'uploads');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='uploads_anon_update') then
    create policy "uploads_anon_update" on storage.objects
      for update to anon using (bucket_id = 'uploads') with check (bucket_id = 'uploads');
  end if;
end $$;