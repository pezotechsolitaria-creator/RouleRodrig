import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isTransferQuote, nightWindowLabel, rupees, TRIP_TYPES, NIGHT_MODES } from "./transfer";

// ── M220 · AIRPORT TRANSFERS PRICED BY ZONE ─────────────────────────────────
//
// The engine lives in Postgres and is proven there: supabase/tests/
// m220_transfer_pricing.sql runs the owner's worked examples, every zone line,
// the night window and the booking path inside a rolled-back transaction (65
// assertions, all green on 2026-09-29). What cannot be reached from here is
// the database itself — so these guard the decisions around it that would be
// undone silently by a later edit:
//
//   · no fare, zone line or night hour is typed into the frontend
//   · the booking presents its quote, and a changed price comes back to the
//     customer instead of being charged unseen
//   · a zone never comes from the straight-line estimate
//   · the migration keeps the overload trap, the grants and the dispatch hold
//
// Comments are stripped before any "must not contain" check: an explanation of
// why a number is banned legitimately quotes the number.

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");

const MIGRATION = read("supabase", "migrations", "20260929090000_m220_airport_transfers_priced_by_zone.sql");
const SHEET = read("supabase", "migrations", "20260929091000_m220b_transfer_price_sheet.sql");
const BOOK = read("app", "taxi", "book", "BookRide.tsx");
const QUOTE_ROUTE = read("app", "api", "rides", "quote", "route.ts");
const BOOK_ROUTE = read("app", "api", "rides", "route.ts");
const SERVER = read("lib", "rides", "transfer-server.ts");
const SHAPES = read("lib", "rides", "transfer.ts");

describe("the owner's numbers are seeded exactly, and only in the database", () => {
  it("seeds the launch price list with his zones and fares", () => {
    // one way 1,200 / 1,500 / 2,000; return 1,200 / 1,500 / 1,700 each way;
    // 150 per extra passenger; night 17:00–04:59 priced by hand.
    expect(MIGRATION).toMatch(/7, 15,\s*\n\s*120000, 150000, 200000,\s*\n\s*120000, 150000, 170000,\s*\n\s*1, 15000, 6,/);
    expect(MIGRATION).toMatch(/'manual', 17, 4, 30000, 1\.20,/);
  });

  it("draws the zone lines exactly as he wrote them: ≤ 7, < 15, else 3", () => {
    expect(MIGRATION).toMatch(/when p_road_km <= v\.zone1_max_km then 1\s*\n\s*when p_road_km <\s+v\.zone2_max_km then 2\s*\n\s*else 3 end/);
  });

  it("charges extra passengers per direction, after the included ones", () => {
    expect(MIGRATION).toMatch(/v_extra_n := greatest\(v_n - v\.included_passengers, 0\)/);
    expect(MIGRATION).toMatch(/v_extra\s+:= v_extra_n \* v\.extra_passenger_fee/);
  });

  it("types none of them into the booking screen, the shapes, or the admin form", () => {
    for (const [name, src] of [["BookRide", BOOK], ["transfer.ts", SHAPES]] as const) {
      expect(code(src), name).not.toMatch(/\b(120000|150000|200000|170000|15000|1200|1500|2000|1700)\b/);
    }
  });
});

describe("a zone is a ROAD distance", () => {
  it("never prices from the straight-line fallback", () => {
    // routeBetween() falls back to crow-flies × 1.35 when the router fails —
    // the estimate that put Port Mathurin (18.2 km by road) in Zone 2. Only a
    // real route is passed on; otherwise the fare is left for the owner.
    expect(SERVER).toMatch(/if \(route\.eta\.source !== "route" \|\| !\(route\.eta\.km > 0\)\) return first;/);
  });

  it("only routes when the database asks for it", () => {
    // 32 named places have a measured distance; routing them again would be a
    // network call per keystroke for nothing.
    expect(SERVER).toMatch(/first\.data\?\.reason !== "need_road_distance"/);
  });

  it("seeds a measured distance for Port Mathurin that lands in Zone 3", () => {
    expect(MIGRATION).toContain("('port-mathurin', 'Port Mathurin', -19.6836, 63.4186, 18.23)");
  });

  it("never lets the browser send a distance", () => {
    expect(QUOTE_ROUTE).not.toMatch(/roadKm|routerKm|p_router_km/);
    expect(BOOK_ROUTE).not.toMatch(/routerKm|p_router_km/);
  });
});

describe("the booking is made from the quote the customer saw", () => {
  it("sends the quote id and what was shown, for airport only", () => {
    expect(BOOK).toMatch(/quoteId: quote\?\.quoteId \?\? null/);
    expect(BOOK).toMatch(/shownFares: \(quote\?\.legs \?\? \[\]\)\.map\(\(l\) => l\.fare \?\? null\)/);
    expect(BOOK).toMatch(/\.\.\.\(service === "airport"/);
  });

  it("shows a changed price instead of booking it", () => {
    expect(BOOK).toMatch(/if \(r\.status === 409\) \{/);
    expect(BOOK).toContain("c.transfer.priceChanged");
  });

  it("passes the quote to create_ride_request and never a price", () => {
    expect(BOOK_ROUTE).toContain('p_quote_id: v.service === "airport" ? (v.quoteId ?? null) : null');
    expect(code(BOOK_ROUTE)).not.toMatch(/p_price|p_quoted_price|p_total/);
  });

  it("re-books a stale quote only when every leg is unchanged", () => {
    expect(BOOK_ROUTE).toMatch(/error\?\.code === "RR097" && v\.service === "airport" && error\.hint !== "used"/);
    expect(BOOK_ROUTE).toMatch(/freshFares\.every\(\(f, i\) => f === shown\[i\]\)/);
    expect(BOOK_ROUTE).toMatch(/\{ error: "price_changed", quote: q\?\.ok \? q : null \},\s*\n\s*\{ status: 409 \}/);
  });

  it("asks for the return trip's time before pricing a package", () => {
    expect(BOOK).toMatch(/if \(isReturn && !returnWhen\) \{\s*\n\s*setQuote\(null\);/);
    expect(BOOK).toMatch(/\(!isReturn \|\| !!returnWhen\) &&/);
  });
});

describe("the database keeps its promises", () => {
  it("drops the old create_ride_request before creating the new one (no PGRST203)", () => {
    const drop = MIGRATION.indexOf("drop function if exists public.create_ride_request(");
    const create = MIGRATION.indexOf("create function public.create_ride_request(");
    expect(drop).toBeGreaterThan(0);
    expect(create).toBeGreaterThan(drop);
    // Every new parameter defaulted, so the live route resolves while this applies.
    expect(MIGRATION).toMatch(/p_quote_id uuid default null, p_trip_type text default 'one_way',\s*\n\s*p_return_at timestamptz default null, p_return_flight_ref text default null/);
  });

  it("held a ride with no agreed fare in M220 — and M222 releases that hold", () => {
    // History, kept honest: M220 held hand-priced transfers for a fare set on a
    // desk screen. The owner then asked for no airport-only screens (M222), so
    // nothing is held; a hand-priced ride goes out like any unpriced taxi ride.
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.auto_dispatch_rides"));
    expect(fn.slice(0, 2500)).toMatch(/and not fare_pending/);
    const m222 = read("supabase", "migrations", "20260929150000_m222_airport_transfers_dispatch_like_taxi.sql");
    expect(m222.slice(m222.indexOf("create or replace function public.auto_dispatch_rides"))).not.toMatch(/and not fare_pending/);
  });

  it("refuses a quote that does not match the booking, field for field", () => {
    expect(MIGRATION).toMatch(/or v_q\.passengers <> v_n\s*\n\s*or v_q\.trip_type <> v_trip/);
    expect(MIGRATION).toMatch(/hint='mismatch'/);
    expect(MIGRATION).toMatch(/hint='used'/);
    expect(MIGRATION).toMatch(/hint='expired'/);
  });

  it("keeps price lists and booked quotes immutable", () => {
    expect(MIGRATION).toMatch(/before update or delete on public\.transfer_pricing_versions/);
    expect(MIGRATION).toMatch(/before update or delete on public\.ride_quotes/);
    expect(MIGRATION).toMatch(/This fare was agreed with the customer and cannot be changed/);
  });

  it("shows drivers their share, not the customer's fare", () => {
    expect(MIGRATION).toMatch(/generated always as \(coalesce\(driver_earnings, quoted_price\)\) stored/);
    expect(MIGRATION).toMatch(/'price', v_r\.driver_pay,\s*\n\s*'fare', v_r\.quoted_price/);
    expect(MIGRATION).toMatch(/r\.driver_pay, r\.pickup_label, r\.dropoff_label/);
  });

  it("keeps every new function and table away from anon", () => {
    for (const fn of ["quote_airport_transfer", "create_ride_request", "quote_ride", "admin_set_ride_fare", "price_transfer_leg"]) {
      expect(MIGRATION, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(`));
    }
    expect(MIGRATION).toMatch(/revoke all on table public\.transfer_pricing_versions, public\.transfer_known_distances, public\.ride_quotes\s*\n\s*from public, anon, authenticated;/);
    expect(SHEET).toMatch(/revoke all on function public\.transfer_price_sheet\(\) from public, anon, authenticated;/);
  });
});

describe("the shapes and formatters", () => {
  it("knows the two products and the four night rules", () => {
    expect([...TRIP_TYPES]).toEqual(["one_way", "return"]);
    expect([...NIGHT_MODES]).toEqual(["none", "manual", "fixed", "multiplier"]);
  });

  it("writes the night window the way the owner did", () => {
    expect(nightWindowLabel(17, 4)).toBe("17:00–04:59");
    expect(nightWindowLabel(21, 5)).toBe("21:00–05:59");
  });

  it("formats minor units as whole, grouped rupees", () => {
    expect(rupees(215000)).toBe("Rs 2,150");
    expect(rupees(120000)).toBe("Rs 1,200");
  });

  it("recognises a zone quote and nothing else", () => {
    expect(isTransferQuote({ ok: true, legs: [] })).toBe(true);
    expect(isTransferQuote({ ok: true, price: 61600 })).toBe(false);
    expect(isTransferQuote({ ok: false, legs: [] })).toBe(false);
    expect(isTransferQuote(null)).toBe(false);
  });
});
