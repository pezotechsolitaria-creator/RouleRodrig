CREATE TABLE IF NOT EXISTS taxi_drivers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone       text NOT NULL,
  whatsapp    text,
  photo       text,
  vehicle     text NOT NULL DEFAULT '',
  vehicle_type text NOT NULL DEFAULT 'car'
                CHECK (vehicle_type IN ('car','minibus','van','scooter','other')),
  languages   text[] DEFAULT '{}',
  areas       text NOT NULL DEFAULT '',
  rate_from   text,
  notes       text,
  featured    boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE taxi_drivers ENABLE ROW LEVEL SECURITY;

-- Public read: only active drivers
CREATE POLICY "public read active taxi drivers"
  ON taxi_drivers FOR SELECT
  USING (active = true);

-- Service role (used by API routes with service key) can do everything
CREATE POLICY "service role full access taxi drivers"
  ON taxi_drivers FOR ALL
  USING (true)
  WITH CHECK (true);