-- The BRN certificate needs a home that is NOT the public bucket (P1 #3).
--
-- /api/admin/upload writes to `uploads`, which is public: anything that goes
-- through it gets a permanent, guessable, unauthenticated URL. A certificate of
-- incorporation carries signatures, a company stamp and the registry's seal,
-- and it is uploaded for the owner's own reference and to prove identity if
-- asked — not to be published. Putting it in `uploads` would publish it.
--
-- Deliberately NO storage policies, exactly like booking-receipts: with none,
-- anon and authenticated can reach nothing, and the only way in is the
-- service-role client behind the /admin cookie check. Reads are handed out as
-- short-lived signed URLs rather than by loosening this.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-documents',
  'legal-documents',
  false,
  4194304,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Assert the property that matters. A bucket that silently ended up public
-- would publish a signed company document, which is the whole failure this is
-- avoiding.
do $$
begin
  if exists (select 1 from storage.buckets where id='legal-documents' and public) then
    raise exception 'legal-documents bucket is PUBLIC';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and qual ilike '%legal-documents%'
  ) then
    raise exception 'legal-documents has storage policies; it must be service-role only';
  end if;
end $$;
