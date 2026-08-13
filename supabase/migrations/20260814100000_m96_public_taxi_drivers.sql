-- M96 — "Aucun chauffeur pour le moment" with two active drivers on file.
--
-- /api/taxi read taxi_drivers through the ANON client. There is an RLS policy
-- (taxi_anon_select_active, active = true) and it had never done anything,
-- because anon holds no SELECT GRANT on the table. A policy without a grant
-- returns no rows and NO ERROR, so the page rendered its empty state and the
-- site looked like it had no drivers at all.
--
-- The missing grant is NOT the bug and must not be "restored". taxi_drivers
-- carries driver_token and whatsapp_api_key — both bearer credentials — and the
-- route asked for every column. Granting anon SELECT would have published each
-- driver's private link and CallMeBot key to anyone opening the network tab.
-- The table is correctly unreadable; what was missing was a way to read the
-- PUBLIC part of it.
--
-- rate_from is deliberately absent from the return. Roule Rodrigues does not
-- set taxi fares — every driver charges differently and the price is agreed
-- between the driver and the customer — so publishing a number here would be a
-- quote the platform cannot honour.
create or replace function public.public_taxi_drivers()
returns table (
  id uuid, name text, phone text, whatsapp text, photo text, photos text[],
  vehicle text, vehicle_type text, languages text[], areas text, notes text,
  featured boolean, seats int, luggage_capacity int, base_label text,
  handles_taxi boolean, handles_airport boolean, handles_transfer boolean,
  availability text, created_at timestamptz
)
language sql
security definer
set search_path to 'public', 'pg_temp'
stable
as $$
  select d.id, d.name, d.phone, d.whatsapp, d.photo, d.photos, d.vehicle,
         d.vehicle_type, d.languages, d.areas, d.notes, d.featured, d.seats,
         d.luggage_capacity, d.base_label, d.handles_taxi, d.handles_airport,
         d.handles_transfer, d.availability, d.created_at
  from public.taxi_drivers d
  where d.active = true
  order by d.featured desc nulls last, d.created_at asc;
$$;

revoke all on function public.public_taxi_drivers() from public;
grant execute on function public.public_taxi_drivers() to anon, authenticated, service_role;

comment on function public.public_taxi_drivers() is
  'M96: the publishable columns of an active taxi driver. Never returns driver_token, whatsapp_api_key or rate_from.';
