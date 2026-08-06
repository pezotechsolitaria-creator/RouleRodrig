
CREATE TABLE IF NOT EXISTS bookings (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT         NOT NULL,
  email       TEXT,
  phone       TEXT,
  scooter     TEXT         NOT NULL,
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  days        INTEGER      NOT NULL,
  total_price TEXT,
  message     TEXT,
  status      TEXT         NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_bookings"  ON bookings FOR INSERT TO anon   WITH CHECK (true);
CREATE POLICY "anon_select_bookings"  ON bookings FOR SELECT USING (true);
CREATE POLICY "anon_update_bookings"  ON bookings FOR UPDATE USING (true);
