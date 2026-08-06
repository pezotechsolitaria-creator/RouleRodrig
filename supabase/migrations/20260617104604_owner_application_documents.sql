-- Private bucket for sensitive application documents (ID, insurance, vehicle photos).
-- Not public: objects are only reachable via short-lived signed URLs generated
-- server-side with the service-role key.
INSERT INTO storage.buckets (id, name, public)
VALUES ('applications', 'applications', false)
ON CONFLICT (id) DO NOTHING;

-- No anon storage policies are created → the public role cannot read or list.
-- Uploads happen via the service role (server-side), reads via signed URLs.

ALTER TABLE owner_applications
  ADD COLUMN IF NOT EXISTS id_card       text,
  ADD COLUMN IF NOT EXISTS insurance     text,
  ADD COLUMN IF NOT EXISTS vehicle_photos jsonb NOT NULL DEFAULT '[]'::jsonb;