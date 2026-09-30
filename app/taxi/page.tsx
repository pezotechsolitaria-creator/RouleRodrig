import { createAnonClient } from "@/lib/supabase/anon";
import { readTransferFares } from "@/lib/rides/fares";
import TaxiDirectory from "./TaxiDirectory";
import { withoutContact, withRatings, type DirectoryDriver } from "./directory";

// ── /taxi, READ ON THE SERVER (SEO audit 2026-09-29 C23, C2) ────────────────
//
// This file was the whole page, "use client", and its drivers came from
// /api/taxi after hydration. robots.txt disallows /api, so no crawler ever saw
// a driver: the SSR HTML read "Loading drivers…". The page is now this thin
// server wrapper around the same client component (./TaxiDirectory), which it
// hands two things read here:
//
//   · the drivers, through public_taxi_drivers() and the approved-review
//     aggregates, exactly as app/api/taxi/route.ts reads them — minus the phone
//     numbers (see ./directory.ts);
//   · the airport price sheet, so the FAQ can state the zone fares /transfers
//     publishes instead of claiming there is no price list.
//
// Both are best-effort. A failed driver read renders the page as it always
// did (the client fetch still runs); a failed fare read prints no fare.

// The same window as /transfers, which reads the same price sheet.
export const revalidate = 600;

/**
 * The driver directory, for the first render. The COOKIELESS client: the
 * session-carrying one would opt /taxi out of static rendering, and every
 * column it reads is public by construction (M96). Null, never a throw.
 */
async function readDirectory(): Promise<DirectoryDriver[] | null> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("public_taxi_drivers");
    if (error) return null;
    const { data: reviews } = await supabase
      .from("taxi_driver_reviews")
      .select("driver_id, rating")
      .eq("status", "approved");
    const rows = (data ?? []) as (Record<string, unknown> & { id: string })[];
    return withRatings(rows.map(withoutContact), reviews ?? []);
  } catch {
    return null;
  }
}

export default async function TaxiPage() {
  const [drivers, fares] = await Promise.all([readDirectory(), readTransferFares()]);
  return <TaxiDirectory initialDrivers={drivers} airport={fares.airport} />;
}
