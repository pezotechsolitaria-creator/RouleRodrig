-- Indexes to keep queries fast as data grows (prevents full-table scans).
CREATE INDEX IF NOT EXISTS idx_bookings_partner_code ON bookings (partner_code);
CREATE INDEX IF NOT EXISTS idx_bookings_status       ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_scooter      ON bookings (scooter);
CREATE INDEX IF NOT EXISTS idx_bookings_dates        ON bookings (start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_reviews_status        ON product_reviews (status);

CREATE INDEX IF NOT EXISTS idx_listings_active       ON marketplace_listings (active);
CREATE INDEX IF NOT EXISTS idx_listings_featured     ON marketplace_listings (featured);

CREATE INDEX IF NOT EXISTS idx_partners_code         ON partners (partner_code);

CREATE INDEX IF NOT EXISTS idx_taxi_active           ON taxi_drivers (active);