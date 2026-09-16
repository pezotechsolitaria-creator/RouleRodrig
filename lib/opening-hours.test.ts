import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPENING_HOURS } from "./site";

// ── HOURS ARE A PROMISE SOMEBODY TURNS UP ON (M143) ─────────────────────────
//
// The site published "Mon-sun: 7am-8pm" while the business opens 9am to 6pm.
// It had been live long enough that an external audit quoted it back as a fact
// about the business. A customer reading it could arrive at half past seven in
// the morning to a locked door — which is worse than publishing no hours at
// all, because it is a specific claim they acted on.
//
// The visible line is content.contact.hours, edited in /admin. The machine
// times below are what LocalBusiness schema emits. Google cross-checks the
// two, and a mismatch is the same class of fault as the address that said Port
// Mathurin while the page said Baie aux Huîtres.

describe("the published opening hours", () => {
  it("covers every day, because the business opens every day", () => {
    expect(OPENING_HOURS.days).toHaveLength(7);
    expect(OPENING_HOURS.days).toContain("Sunday");
  });

  it("uses 24-hour times, which is what schema.org expects", () => {
    // "9am" in an opens field is silently ignored by parsers.
    expect(OPENING_HOURS.opens).toMatch(/^\d{2}:\d{2}$/);
    expect(OPENING_HOURS.closes).toMatch(/^\d{2}:\d{2}$/);
  });

  it("opens before it closes", () => {
    expect(OPENING_HOURS.opens < OPENING_HOURS.closes).toBe(true);
  });

  it("says the same thing to a machine and to a person", () => {
    // Two shapes, because the business is now one of them. 00:00-23:59 is how
    // schema.org spells "open 24 hours", and checking it for "0am" and "11pm"
    // would assert nonsense; anything else is a normal day and keeps the
    // original am/pm cross-check that caught "Mon-sun: 7am-8pm".
    const label = OPENING_HOURS.label.toLowerCase();
    const openHour = Number(OPENING_HOURS.opens.slice(0, 2));
    const closeHour = Number(OPENING_HOURS.closes.slice(0, 2));
    const allDay = OPENING_HOURS.opens === "00:00" && OPENING_HOURS.closes === "23:59";

    if (allDay) {
      expect(label).toMatch(/24 hours/);
    } else {
      expect(label).toContain(`${openHour}am`);
      expect(label).toContain(`${closeHour - 12}pm`);
    }
  });

  it("still says every day, whichever shape it is in", () => {
    expect(OPENING_HOURS.label.toLowerCase()).toContain("every day");
  });

  it("is emitted as OpeningHoursSpecification on the business entity", () => {
    const page = readFileSync(join(__dirname, "..", "app", "page.tsx"), "utf8");
    expect(page).toMatch(/"@type": "OpeningHoursSpecification"/);
    expect(page).toMatch(/OPENING_HOURS\.opens/);
    expect(page).toMatch(/OPENING_HOURS\.closes/);
    // Never a literal: a typed "09:00" here would drift from the constant the
    // moment the hours change.
    expect(page).not.toMatch(/opens: "0?\d:\d\d"/);
  });
});
