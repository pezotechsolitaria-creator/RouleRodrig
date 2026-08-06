
-- Hotel / Guesthouse partners
CREATE TABLE IF NOT EXISTS partners (
  id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT         NOT NULL,
  type           TEXT         NOT NULL DEFAULT 'hotel',  -- hotel | guesthouse | travel_agency | other
  email          TEXT,
  phone          TEXT,
  partner_code   TEXT         UNIQUE NOT NULL,
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  active         BOOLEAN      DEFAULT true,
  notes          TEXT,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_partners" ON partners FOR SELECT USING (true);
CREATE POLICY "anon_insert_partners" ON partners FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_partners" ON partners FOR UPDATE USING (true);
CREATE POLICY "anon_delete_partners" ON partners FOR DELETE USING (true);

-- Add partner code to bookings (track which partner referred each booking)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_code TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount INTEGER; -- numeric Rs amount

-- Local business marketplace listings
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT        NOT NULL,
  category      TEXT        NOT NULL DEFAULT 'restaurant',  -- restaurant | tour | activity | accommodation | shopping
  description   TEXT        NOT NULL,
  offer         TEXT        NOT NULL,
  image_url     TEXT,
  contact       TEXT,
  website       TEXT,
  active        BOOLEAN     DEFAULT true,
  featured      BOOLEAN     DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_listings"  ON marketplace_listings FOR SELECT USING (true);
CREATE POLICY "anon_insert_listings"  ON marketplace_listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_listings"  ON marketplace_listings FOR UPDATE USING (true);
CREATE POLICY "anon_delete_listings"  ON marketplace_listings FOR DELETE USING (true);
