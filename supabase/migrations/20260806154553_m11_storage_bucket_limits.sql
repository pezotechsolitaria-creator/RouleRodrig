-- M11 — Storage buckets: enforce size and MIME limits at the storage service.
--
-- THE GAP
-- All four buckets had file_size_limit = NULL and allowed_mime_types = NULL,
-- i.e. any size, any type. The API routes DO validate (4 MB + magic-byte
-- sniffing in lib/file-signature.ts) — but that is application-layer validation
-- on a path the client is not obliged to use. `merchant-media` and
-- `order-receipts` both carry INSERT policies for `authenticated`, so a signed-in
-- merchant or customer can call the Storage API directly with the publishable
-- key and skip every check the Next.js route performs.
--
-- What that allowed:
--   * unbounded uploads → storage cost with no ceiling
--   * arbitrary content-types into `merchant-media`, which is PUBLIC. An SVG or
--     HTML file is then served from the Supabase origin with that content-type,
--     which is the standard stored-XSS / malware-hosting shape. (Cross-origin
--     from roulerodrig.com, so it cannot read site cookies — but it is still
--     hostile content served from the business's own infrastructure.)
--
-- `uploads` additionally backs /api/admin/upload, which trusts the CLIENT's
-- file.type via startsWith("image/") and applies no size cap at all —
-- "image/svg+xml" satisfies that check. A bucket-level allow-list fixes that
-- route regardless of what it sends.
--
-- Limits mirror each bucket's owning route so nothing legitimate is rejected:
--   merchant-media  ← app/api/merchant/media/route.ts     4 MB, jpeg/png/webp
--   order-receipts  ← app/api/orders/[id]/receipt/route.ts 4 MB, + pdf
--   applications    ← app/api/owner-upload/route.ts        4 MB, + heic + pdf
--   uploads         ← app/api/admin/upload/route.ts       10 MB, site imagery
--
-- `uploads` gets headroom rather than 4 MB: only service_role can write to it
-- (no INSERT policy for anon/authenticated), the owner uploads phone photos
-- through it, and Vercel's ~4.5 MB request body cap already bounds that route
-- in practice. Verified against live data first — the largest existing object
-- anywhere is a 4004 kB HEIC in `uploads`, so no current file exceeds its new
-- limit. Existing objects are unaffected regardless; these apply to new writes.
--
-- image/svg+xml is deliberately absent from every list.

update storage.buckets
   set file_size_limit   = 4194304,  -- 4 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'merchant-media';

update storage.buckets
   set file_size_limit   = 4194304,  -- 4 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'order-receipts';

update storage.buckets
   set file_size_limit   = 4194304,  -- 4 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
 where id = 'applications';

update storage.buckets
   set file_size_limit   = 10485760, -- 10 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/gif','image/avif']
 where id = 'uploads';

-- Fail the migration rather than leave a bucket silently unlimited: a NULL here
-- is exactly the state this migration exists to remove, and a typo'd bucket id
-- would otherwise pass as a no-op.
do $$
declare
  v_open int;
begin
  select count(*) into v_open
  from storage.buckets
  where file_size_limit is null or allowed_mime_types is null;

  if v_open > 0 then
    raise exception 'M11: % storage bucket(s) still have no size or MIME limit', v_open;
  end if;
end;
$$;
