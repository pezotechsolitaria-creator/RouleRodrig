CREATE TABLE IF NOT EXISTS owner_applications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name  text NOT NULL,
  phone       text NOT NULL,
  email       text,
  location    text,
  scooters    text,            -- free text: models / how many
  message     text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_applications_status  ON owner_applications (status);
CREATE INDEX IF NOT EXISTS idx_owner_applications_created ON owner_applications (created_at DESC);

ALTER TABLE owner_applications ENABLE ROW LEVEL SECURITY;

-- Public may only INSERT a pending application; admin reads via service role.
CREATE POLICY owner_apps_anon_insert ON owner_applications
  FOR INSERT TO anon WITH CHECK (status = 'pending');