ALTER TABLE place_bookings
  ADD COLUMN IF NOT EXISTS deposit_amount integer,
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paypal_capture_id text;