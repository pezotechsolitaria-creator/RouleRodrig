-- M220b · The price list as a page can publish it.
--
-- /transfers lists which places fall in which zone. Computing that in the page
-- would be a second copy of the zone lines — the thing the owner ruled out
-- ("never hard-code pricing in the frontend") and the classic way a page comes
-- to say Zone 2 while the booking charges Zone 3. So each place's zone comes
-- from price_transfer_leg(), the function that charges.

create or replace function public.transfer_price_sheet()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v transfer_pricing_versions%rowtype;
begin
  select * into v from transfer_pricing_versions
   where service = 'airport' and effective_from <= now()
   order by effective_from desc, id desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v.id, 'label', v.label,
    'zone1MaxKm', v.zone1_max_km, 'zone2MaxKm', v.zone2_max_km,
    'oneWay', jsonb_build_array(v.one_way_zone1, v.one_way_zone2, v.one_way_zone3),
    'returnEach', jsonb_build_array(v.return_zone1, v.return_zone2, v.return_zone3),
    'includedPassengers', v.included_passengers, 'extraPassengerFee', v.extra_passenger_fee,
    'maxPricedPassengers', v.max_priced_passengers,
    'nightMode', v.night_mode, 'nightFromHour', v.night_from_hour, 'nightToHour', v.night_to_hour,
    'nightSurcharge', v.night_surcharge, 'nightMultiplier', v.night_multiplier,
    'bookable', coalesce((select is_bookable from ride_pricing where service = 'airport'), true),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.place_id, 'label', k.label, 'roadKm', k.road_km,
               'zone', (price_transfer_leg(v.id, k.road_km, 'one_way', 1, null)->>'zone')::int)
             order by k.road_km)
        from transfer_known_distances k), '[]'::jsonb));
end $$;

revoke all on function public.transfer_price_sheet() from public, anon, authenticated;
grant execute on function public.transfer_price_sheet() to service_role;

notify pgrst, 'reload schema';
