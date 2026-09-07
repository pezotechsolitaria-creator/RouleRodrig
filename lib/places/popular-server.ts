import "server-only";
import { createAnonClient } from "@/lib/supabase/anon";
import type { MapLocation } from "@/lib/defaults";
import {
  NO_SIGNALS,
  rankPlaces,
  type PlaceSignals,
  type RankedPlace,
  type ScoreInput,
} from "./popularity";

// ── Reading the counters, and surviving without them ────────────────────────
//
// The map renders whether or not this works. If place_popularity() fails, is
// empty, or the table has not been written to yet — which is the state on the
// day it ships — every place falls back to NO_SIGNALS and the layer shows the
// owner's curated picks alone. That is not a degraded mode, it is the intended
// first month.
//
// The one thing this must never do is throw: a counter is not worth taking the
// island guide down for.

export type PopularityWindow = 7 | 30 | 365;

type Row = {
  place_id: string;
  views_window: number;
  views_all: number;
  directions_window: number;
  saves_all: number;
  last_seen: string | null;
};

function daysSince(day: string | null): number | null {
  if (!day) return null;
  const then = new Date(`${day}T12:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  // Whole days, floored, so "today" is 0 rather than 0.4.
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/**
 * Signals for every place that has any, keyed by CMS id.
 *
 * Read with the ordinary client: place_popularity() is aggregate-only and
 * granted to anon, because there is no visitor identity anywhere in this
 * feature to protect.
 */
export async function loadPlaceSignals(
  days: PopularityWindow = 7,
): Promise<Map<string, { signals: PlaceSignals; daysSinceLastSeen: number | null }>> {
  const out = new Map<string, { signals: PlaceSignals; daysSinceLastSeen: number | null }>();
  try {
    // ── COOKIELESS, AND THAT IS THE POINT ───────────────────────────
    // The server client reads cookies to carry a visitor's session, and
    // touching cookies opts the whole route into DYNAMIC rendering. /map is
    // revalidate = 3600 — static, regenerated hourly — and making it dynamic
    // would mean a server render and a Supabase round trip for every visitor,
    // on a project where egress is the stated constraint.
    //
    // Worse, the failure is silent: Next throws "Dynamic server usage", the
    // catch below swallows it, and the page ships with no popularity at all.
    // That is the exact bug lib/supabase/anon.ts was written for, after a
    // sitemap shipped for months missing every dish URL. The build named it
    // here too, which is the only reason this is not still doing it.
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("place_popularity", { p_days: days });
    if (error) {
      // Named, not swallowed. A silently empty popularity layer looks exactly
      // like an unpopular island.
      console.error("place_popularity failed", error);
      return out;
    }
    for (const r of (data ?? []) as Row[]) {
      out.set(r.place_id, {
        signals: {
          ...NO_SIGNALS,
          viewsWindow: Number(r.views_window) || 0,
          viewsAll: Number(r.views_all) || 0,
          directionsWindow: Number(r.directions_window) || 0,
          savesAll: Number(r.saves_all) || 0,
        },
        daysSinceLastSeen: daysSince(r.last_seen),
      });
    }
  } catch (err) {
    console.error("place_popularity threw", err);
  }
  return out;
}

/**
 * The island's places, ranked, ready for the map.
 *
 * Curated flags come from the CMS blob the owner already edits; the counters
 * come from Postgres. Neither side has to know about the other.
 */
export async function rankIslandPlaces(
  places: MapLocation[],
  days: PopularityWindow = 7,
): Promise<RankedPlace[]> {
  const signals = await loadPlaceSignals(days);
  return rankPlaces(places, (p): ScoreInput => {
    const found = signals.get(p.id);
    return {
      signals: found?.signals ?? NO_SIGNALS,
      curated: p.popular === true,
      curatedRank: p.popularRank ?? null,
      daysSinceLastSeen: found?.daysSinceLastSeen ?? null,
    };
  });
}
