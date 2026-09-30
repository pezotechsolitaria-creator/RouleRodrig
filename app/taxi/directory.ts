import type { TaxiDriver } from "@/lib/supabase/taxi-types";

// ── THE DRIVER LIST A CRAWLER CAN READ (SEO audit 2026-09-29 C23) ───────────
//
// /taxi was a client page that fetched its drivers from /api/taxi after
// hydration. robots.txt disallows /api, so Googlebot's renderer could never
// fetch the list, and an AI crawler runs no JS at all: the SSR HTML said
// "Loading drivers…" and nothing else. Every driver added stayed invisible.
//
// The server now reads public_taxi_drivers() the way app/api/taxi/route.ts
// does, attaches the same approved-review aggregates, and hands the list to
// the client component as its first render.
//
// ── WHAT IS LEFT OUT OF THE SERVER HTML ─────────────────────────────────────
// Phone and WhatsApp numbers. They arrived client-side before and they still
// do: the page fetches /api/taxi on mount exactly as it always has, and the
// contact buttons appear when that answer lands. The directory's name, vehicle,
// languages, areas and airport runs are what a search needs; a private
// driver's mobile number in every crawl of the page is not.

/** A driver as the directory first renders it: contact fields optional,
 *  because the server copy carries none. handles_airport is a column
 *  public_taxi_drivers() already returns (M96) and the old type never named. */
export type DirectoryDriver = Omit<TaxiDriver, "phone" | "whatsapp"> & {
  phone?: string;
  whatsapp?: string | null;
  handles_airport?: boolean | null;
};

type Row = Record<string, unknown> & { id: string };
type ReviewRow = { driver_id: string | null; rating: number };

/** The same aggregation /api/taxi applies: avg to one decimal, count. */
export function withRatings<T extends { id: string }>(
  drivers: T[],
  reviews: ReviewRow[],
): (T & { rating_avg: number | null; rating_count: number })[] {
  const agg = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    if (!r.driver_id) continue;
    const a = agg.get(r.driver_id) ?? { sum: 0, count: 0 };
    a.sum += r.rating;
    a.count += 1;
    agg.set(r.driver_id, a);
  }
  return drivers.map((d) => {
    const a = agg.get(d.id);
    return {
      ...d,
      rating_avg: a ? Math.round((a.sum / a.count) * 10) / 10 : null,
      rating_count: a ? a.count : 0,
    };
  });
}

/** The server copy of a driver: every publishable column except the numbers. */
export function withoutContact(row: Row): DirectoryDriver {
  const { phone: _phone, whatsapp: _whatsapp, ...rest } = row;
  void _phone;
  void _whatsapp;
  return rest as unknown as DirectoryDriver;
}
