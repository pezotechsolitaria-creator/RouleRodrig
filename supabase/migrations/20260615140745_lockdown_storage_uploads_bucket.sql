-- Public bucket serves images via the public URL path (no RLS needed for that).
-- Admin uploads go through the service-role client (bypasses RLS), so the anon
-- role needs ZERO direct access to storage.objects. Remove all anon policies:
--   * anon INSERT  → prevented strangers uploading arbitrary files
--   * anon UPDATE  → prevented strangers overwriting existing images
--   * public SELECT (list) → prevented enumerating every uploaded file
DROP POLICY IF EXISTS uploads_anon_insert ON storage.objects;
DROP POLICY IF EXISTS uploads_anon_update ON storage.objects;
DROP POLICY IF EXISTS uploads_public_read ON storage.objects;