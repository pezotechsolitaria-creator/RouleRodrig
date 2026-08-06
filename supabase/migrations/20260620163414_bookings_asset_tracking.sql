ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS asset_label text;