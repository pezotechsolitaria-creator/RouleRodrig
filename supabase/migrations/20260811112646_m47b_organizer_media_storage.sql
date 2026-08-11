-- M47b — let an event organiser upload a package image.
--
-- Found by reading the live storage policy rather than assuming it would work.
-- merchant-media's insert policy is:
--
--   name ~ '^[0-9a-fA-F-]{36}/'  AND  is_store_staff(split_part(name,'/',1)::uuid)
--
-- BOTH halves refuse an organiser:
--
--   * is_store_staff() joins through merchant_staff, and an organiser is
--     deliberately NOT in that table (M43) — because M40 gave every event store
--     the SAME system-owned merchant, so one merchant_staff row there would
--     grant them every event on the platform plus a merchant dashboard.
--   * the first path segment must be the store UUID, so an `events/<id>/…`
--     prefix fails the pattern too.
--
-- Without this the upload would have been rejected by RLS at runtime, with a
-- storage error that says nothing useful about why.
--
-- The parallel policy uses can_manage_event() — event-scoped, reads organiser
-- status live — with the SAME first-segment-is-the-store rule, so one organiser
-- still cannot write into another event's folder. The existing staff policies
-- are untouched: this ADDS a second door for a different principal rather than
-- widening the first.

drop policy if exists merchant_media_organizer_insert on storage.objects;
create policy merchant_media_organizer_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'merchant-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and can_manage_event((split_part(name, '/', 1))::uuid)
  );

drop policy if exists merchant_media_organizer_update on storage.objects;
create policy merchant_media_organizer_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'merchant-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and can_manage_event((split_part(name, '/', 1))::uuid)
  );

drop policy if exists merchant_media_organizer_delete on storage.objects;
create policy merchant_media_organizer_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'merchant-media'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and can_manage_event((split_part(name, '/', 1))::uuid)
  );

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='merchant_media_organizer_insert') then
    raise exception 'M47b: organiser upload policy missing'; end if;
  -- The marketplace path must be untouched.
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='merchant_media_staff_insert') then
    raise exception 'M47b: the merchant staff upload policy was removed'; end if;
end;
$$;
