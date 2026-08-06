CREATE TABLE IF NOT EXISTS taxi_driver_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid REFERENCES taxi_drivers(id) ON DELETE CASCADE,
  driver_name text,
  name        text NOT NULL,
  origin      text,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxi_driver_reviews_driver ON taxi_driver_reviews (driver_id);
CREATE INDEX IF NOT EXISTS idx_taxi_driver_reviews_status ON taxi_driver_reviews (status);

ALTER TABLE taxi_driver_reviews ENABLE ROW LEVEL SECURITY;

-- Mirror product_reviews policy shape (will be tightened in the RLS lockdown):
-- anon may submit only PENDING reviews; reads filtered in the API.
CREATE POLICY "tdr_anon_insert" ON taxi_driver_reviews
  FOR INSERT TO anon WITH CHECK (status = 'pending');
CREATE POLICY "tdr_public_select" ON taxi_driver_reviews
  FOR SELECT TO public USING (true);
CREATE POLICY "tdr_public_update" ON taxi_driver_reviews
  FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "tdr_public_delete" ON taxi_driver_reviews
  FOR DELETE TO public USING (true);