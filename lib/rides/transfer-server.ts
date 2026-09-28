import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { routeBetween } from "@/lib/tracking/routing";
import type { TransferPricing, TripType } from "./transfer";

// ── ONE WAY TO QUOTE AN AIRPORT TRANSFER, FOR EVERY ROUTE THAT NEEDS ONE ────
//
// The quote route calls this for the price on the screen; the booking route
// calls it again if the customer's quote went stale. Same function, so the two
// can never price the same trip differently.
//
// ── WHY THE SERVER ROUTES, AND ONLY SOMETIMES ───────────────────────────────
// A zone is a ROAD distance. For the 32 named places the database already has
// one, measured once (transfer_known_distances), so the first call usually
// answers straight away with no network at all.
//
// A pin that is not a named place — "use where I am now", or a guesthouse
// dropped on the map — comes back `need_road_distance` with the two points to
// route between. Only then does this ask the router, and it passes the answer
// back ONLY if it is a real route. The straight-line fallback that
// routeBetween() offers is exactly the estimate that put Port Mathurin in the
// wrong zone, so it is never used for a price: without a route, the ride books
// with the fare left for the owner to set.
//
// The browser never supplies a distance. It sends two points; the distance is
// measured here or read from the table.

export type AirportQuoteInput = {
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  passengers: number;
  tripType: TripType;
  outboundAt: string | null;
  returnAt: string | null;
};

type RpcAnswer = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null };

type LatLng = { lat: number; lng: number };

function isPoint(v: unknown): v is LatLng {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as LatLng).lat === "number" &&
    typeof (v as LatLng).lng === "number"
  );
}

export async function quoteAirportTransfer(
  admin: SupabaseClient,
  input: AirportQuoteInput,
): Promise<RpcAnswer> {
  const call = async (routerKm: number | null): Promise<RpcAnswer> => {
    const { data, error } = await admin.rpc("quote_airport_transfer", {
      p_pickup_lat: input.pickupLat,
      p_pickup_lng: input.pickupLng,
      p_dropoff_lat: input.dropoffLat,
      p_dropoff_lng: input.dropoffLng,
      p_passengers: input.passengers,
      p_trip_type: input.tripType,
      p_outbound_at: input.outboundAt,
      p_return_at: input.tripType === "return" ? input.returnAt : null,
      p_router_km: routerKm,
    });
    return { data: (data ?? null) as Record<string, unknown> | null, error };
  };

  const first = await call(null);
  if (first.error || first.data?.reason !== "need_road_distance") return first;

  const origin = first.data.origin;
  const destination = first.data.destination;
  if (!isPoint(origin) || !isPoint(destination)) return first;

  // Road factor and speed only shape routeBetween()'s straight-line fallback,
  // which is discarded below. The numbers are dispatch_settings' defaults.
  const route = await routeBetween(origin.lat, origin.lng, destination.lat, destination.lng, 1.35, 35);
  if (route.eta.source !== "route" || !(route.eta.km > 0)) return first;

  return call(Math.round(route.eta.km * 100) / 100);
}

/** The active price list and every named place's zone, or null. Never throws. */
export async function readTransferPricing(admin: SupabaseClient): Promise<TransferPricing | null> {
  try {
    const { data, error } = await admin.rpc("transfer_price_sheet");
    if (error || !data || typeof data !== "object") return null;
    const p = data as TransferPricing;
    // A sheet with no fares is not a sheet worth publishing a price from.
    const ok =
      Array.isArray(p.oneWay) && p.oneWay.length === 3 && p.oneWay.every((n) => n > 0) &&
      Array.isArray(p.returnEach) && p.returnEach.length === 3 && p.returnEach.every((n) => n > 0);
    return ok ? p : null;
  } catch {
    return null;
  }
}
