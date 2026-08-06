ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pickup_time text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS return_time text;