ALTER TABLE public.place_bookings ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.place_bookings ADD COLUMN IF NOT EXISTS time_slot text;