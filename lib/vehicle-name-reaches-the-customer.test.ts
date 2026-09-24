import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

// ── A CUSTOMER NEVER SEES veh-1783380348440 ─────────────────────────────────
//
// Every vehicle the owner adds is keyed `veh-${Date.now()}`, and
// bookings.scooter stores that key. POST /api/bookings resolves it before the
// FIRST email, so the confirmation says "Suzuki Swift (Latest Gen)" — and
// every screen and message after it said a timestamp:
//
//   /manage-booking          Vehicle   veh-1783380348440
//   approval email           "Good news — veh-1783380348440 is free"
//   decline email            "veh-1783380348440 isn't free for those dates"
//
// A customer checking they had booked the right car could not tell.

describe("every surface after the first email resolves the fleet id", () => {
  it("the lookup endpoint, which feeds /manage-booking", () => {
    const src = read("app", "api", "bookings", "lookup", "route.ts");
    expect(src).toContain('from "@/lib/vehicle-name"');
    expect(src).toContain("await vehicleName(b.item)");
    // Resolved before it is returned, not after — the page renders what it is
    // handed and has no fleet to look anything up in.
    expect(src.indexOf("await vehicleName(b.item)"))
      .toBeLessThan(src.indexOf("ok: true, booking:"));
  });

  it("the approval and decline emails", () => {
    const src = read("app", "api", "admin", "bookings", "availability", "route.ts");
    expect(src).toContain('from "@/lib/vehicle-name"');
    // Both calls, not just the one somebody happened to look at.
    expect(src.split("await vehicleName(").length - 1).toBe(2);
    expect(src).not.toMatch(/scooter: \(row\.scooter as string\)/);
  });

  it("keeps a fallback, so an unreadable fleet cannot blank the row", () => {
    const src = read("app", "api", "admin", "bookings", "availability", "route.ts");
    // vehicleName("") returns "", which would have printed nothing at all.
    expect(src).toContain('|| "your vehicle"');
    expect(src).toContain('|| "the vehicle"');
  });

  it("vehicleName falls back to the id rather than throwing", () => {
    // The property the fix leans on: a content read that fails degrades to
    // the old behaviour instead of losing the row.
    const src = read("lib", "vehicle-name.ts");
    expect(src).toContain("?? idOrName");
    expect(src).toContain("catch");
  });
});
