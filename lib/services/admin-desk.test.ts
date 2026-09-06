import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const code = (sql: string) =>
  sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

// ── The owner's view of every diary ─────────────────────────────────────────
//
// The owner has asked three times for admin to see what a console sees. A
// booking system they cannot look at is that gap again: when a customer rings
// to say a car wash never turned up, there has to be somewhere to check.

describe("the desk is reachable, not just built", () => {
  it("is in the admin navigation and the command palette", () => {
    // The fault this platform has hit repeatedly: a console that exists and
    // that nobody can reach without knowing its URL.
    expect(read("components/admin/AdminShell.tsx")).toMatch(/href: "\/admin\/service-bookings"/);
    expect(read("components/admin/CommandPalette.tsx")).toMatch(/href: "\/admin\/service-bookings"/);
  });

  it("sits with the other desks that hold a promise to a customer", () => {
    const shell = read("components/admin/AdminShell.tsx");
    const deliveries = shell.indexOf('href: "/admin/deliveries"');
    const bookings = shell.indexOf('href: "/admin/service-bookings"');
    const people = shell.indexOf('title: "People"');
    expect(bookings).toBeGreaterThan(deliveries);
    expect(bookings).toBeLessThan(people);
  });
});

describe("it does not sit on the rental bookings route", () => {
  it("keeps the vehicle rentals API where it has always been", () => {
    // Written after this exact mistake: the desk was first built at
    // /api/admin/bookings, which SILENTLY REPLACED the rental bookings route
    // that has served scooters since long before trades existed. Nothing
    // caught it — both are "bookings", both are admin, and the build passed.
    // On this platform a "booking" has meant a scooter for two years.
    const rentals = read("app/api/admin/bookings/route.ts");
    expect(rentals).toMatch(/from\('bookings'\)/);
    expect(rentals).not.toMatch(/service_bookings/);
  });
});

describe("an empty diary has two completely different causes", () => {
  const board = read("app/admin/service-bookings/BookingsBoard.tsx");

  it("names the broken setups rather than showing an empty list", () => {
    // A trade with no bookable service and a trade nobody has booked look
    // identical from outside. One is a phone call to fix, the other is
    // marketing, and the board must not confuse them.
    expect(board).toMatch(/no service has a length set/);
    expect(board).toMatch(/the shop is not published/);
    expect(board).toMatch(/online booking is switched off/);
  });

  it("joins them into one sentence, not three badges", () => {
    // They are all the same problem: this business cannot take a booking.
    expect(board).toMatch(/faults\.join\("; "\)/);
  });
});

describe("the route decides nothing", () => {
  const api = read("app/api/admin/service-bookings/route.ts");

  it("checks the admin cookie AND the service role before anything else", () => {
    expect(api).toMatch(/verifySession\(req\.cookies\.get\(COOKIE_NAME\)\?\.value\)/);
    expect(api).toMatch(/hasServiceRole\(\)/);
    // Both the read and the write go through the same guard.
    expect((api.match(/const denied = guard\(req\);/g) ?? []).length).toBe(2);
  });

  it("marks a booking through the SAME function the provider uses", () => {
    // Two screens that record what happened differently is how a dispute
    // becomes unresolvable.
    expect(api).toMatch(/rpc\("set_service_booking_status"/);
    expect(api).not.toMatch(/from\("service_bookings"\)/);
  });
});

describe("the admin gate matches the one the delivery desk uses", () => {
  const sql = code(read("supabase/migrations/20260907050000_m180_admin_service_bookings.sql"));

  it("lets the cookie session through and still refuses a signed-in stranger", () => {
    // The admin console authenticates with ADMIN_PASSWORD and acts as the
    // service role, where auth.uid() is null. A signed-in user always has one,
    // so the null branch is unreachable except through that route.
    expect(sql).toMatch(/auth\.uid\(\) is not null and not is_platform_admin\(\)/);
  });

  it("still lets a provider mark their own booking", () => {
    expect(sql).toMatch(/is_store_staff\(v_b\.store_id\) or is_platform_admin\(\)/);
  });
});
