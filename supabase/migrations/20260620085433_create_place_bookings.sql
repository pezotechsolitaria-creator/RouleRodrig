CREATE TABLE IF NOT EXISTS public.place_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL,
  place_name text NOT NULL,
  category text,
  name text NOT NULL,
  email text,
  phone text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  guests integer,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reminded boolean NOT NULL DEFAULT false,
  feedback_reminded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.place_bookings ENABLE ROW LEVEL SECURITY;

-- Mirror the bookings table: anon may only INSERT a pending request; reads are
-- service-role only (admin API). No anon SELECT/UPDATE/DELETE policy exists.
DROP POLICY IF EXISTS place_bookings_anon_insert ON public.place_bookings;
CREATE POLICY place_bookings_anon_insert ON public.place_bookings
  FOR INSERT TO anon
  WITH CHECK (status = 'pending');

CREATE INDEX IF NOT EXISTS place_bookings_place_id_idx ON public.place_bookings (place_id);
CREATE INDEX IF NOT EXISTS place_bookings_dates_idx ON public.place_bookings (start_date, end_date);