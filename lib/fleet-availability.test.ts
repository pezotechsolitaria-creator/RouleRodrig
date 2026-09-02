import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── ONE DAY'S BOOKING CLOSED EVERY OTHER DAY (M158) ─────────────────────────
//
// The owner reported the Burgman showing as unavailable when it is not: it is
// booked for a period, and people should still be able to book the free days.
//
// Two unrelated states were collapsed into one flag:
//
//   available === false   the owner withdrew the vehicle in admin — not for
//                         hire at all, and the button should be dead
//   soldOutToday          every unit is on a trip TODAY — which says nothing
//                         about next Tuesday
//
// The card painted a red UNAVAILABLE badge for both and set
// pointer-events-none on Book, so a customer could not reach the calendar that
// would have shown them the free dates.
//
// Nothing was wrong with the booking engine. /api/availability is capacity
// aware per date, the form renders a calendar of full days, and
// app/api/bookings re-checks server-side before accepting. The card was a
// cruder gate standing in front of a correct one.

const ROOT = join(__dirname, "..");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FLEET = strip(readFileSync(join(ROOT, "components", "Fleet.tsx"), "utf8"));
const BOOKING = strip(
  readFileSync(join(ROOT, "components", "BookingSection.tsx"), "utf8"),
);
const I18N = readFileSync(join(ROOT, "lib", "i18n.ts"), "utf8");

describe("being booked today does not withdraw a vehicle", () => {
  it("disables the Book button ONLY when the owner withdrew it", () => {
    expect(FLEET).toMatch(/const out = scooter\.available === false;/);
    // The old form. If this comes back, one day's booking closes every other.
    expect(FLEET).not.toMatch(
      /const out =[^;]*soldOutToday === true;/,
    );
  });

  it("keeps booked-today as its own state", () => {
    expect(FLEET).toMatch(
      /const busyToday = !out && scooter\.soldOutToday === true;/,
    );
  });

  it("shows it in amber with its own words, not the red UNAVAILABLE", () => {
    expect(FLEET).toContain("t.fleet.bookedToday");
    const badge = FLEET.slice(FLEET.indexOf("busyToday ?"));
    expect(badge).toContain("amber");
    expect(badge.slice(0, 400)).not.toContain("t.fleet.unavailable");
  });
});

describe("the sort no longer buries a bookable vehicle", () => {
  it("ranks free today, then out-on-a-trip, then withdrawn", () => {
    expect(FLEET).toMatch(/isWithdrawn\(it\) \? 2 : isBusyToday\(it\) \? 1 : 0/);
    // The old two-way sort put a bookable scooter at the bottom beside the
    // withdrawn ones.
    expect(FLEET).not.toMatch(
      /const isOut = \(it: FleetItem\) => it\.available === false \|\| it\.soldOutToday === true;/,
    );
  });
});

describe("the booking form does not contradict its own calendar", () => {
  it("gives the availability strip three states", () => {
    expect(BOOKING).toMatch(/s\.available === false \?/);
    expect(BOOKING).toMatch(/s\.soldOutToday \?/);
    expect(BOOKING).toContain("t.fleet.bookedToday");
  });

  it("still calls the per-date availability endpoint", () => {
    // This is the thing that was always correct, and the reason re-enabling
    // the button is safe rather than reckless.
    expect(BOOKING).toContain("/api/availability?scooter=");
  });
});

describe("the new wording exists in every language", () => {
  it("is defined for en, fr and cr", () => {
    // LanguageContext reads the dictionary through a cast, so a key present in
    // `en` alone renders as nothing for a French or Kreol reader — a blank
    // badge where the state should be.
    expect((I18N.match(/bookedToday: "/g) ?? []).length).toBe(3);
    expect(I18N).toContain('bookedToday: "BOOKED TODAY"');
    expect(I18N).toContain("bookedToday: \"RÉSERVÉ AUJOURD'HUI\"");
    expect(I18N).toContain('bookedToday: "REZERVE ZORDI"');
  });
});
