import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── The scooter list is the owner's to edit (6 Oct 2026, "it should be auto")
//
// Three boxes on the Scooters category in /admin → Vehicle categories, beside
// its delivery fee and deposit. Without them the list is a constant in code
// and a price the owner types anywhere changes nothing — the very complaint.

const ADMIN = readFileSync(join(process.cwd(), "app", "admin", "AdminDashboard.tsx"), "utf8");

describe("/admin edits the scooter price list", () => {
  it("shows the three boxes on the Scooters category only", () => {
    expect(ADMIN).toContain('{c.id === "scooter" && (() => {');
    expect(ADMIN).toContain('{rate("oneDay", "1 day")}');
    expect(ADMIN).toContain('{rate("twoDays", "2 days, per day")}');
    expect(ADMIN).toContain('{rate("threePlus", "3 days or more, per day")}');
  });

  it("writes them to the category's dayRates, empty meaning the default", () => {
    expect(ADMIN).toContain("dayRates: {");
    expect(ADMIN).toContain('[key]: raw === "" ? undefined : Math.min(99999, Math.max(1, parseInt(raw, 10))),');
    expect(ADMIN).toContain("placeholder={String(SCOOTER_RATES[key])}");
  });

  it("says what a customer will pay, from the same function the checkout uses", () => {
    expect(ADMIN).toContain("const live = scooterRates([c]);");
  });

  it("tells the owner a scooter's own price box no longer sets its price", () => {
    expect(ADMIN).toContain("Scooters are charged from the price list in Vehicle categories → Scooters");
  });

  it("documents the FAQ placeholders where answers are written", () => {
    for (const t of ["{scooter_1_day}", "{scooter_2_days}", "{scooter_per_day}", "{car_from}"]) {
      expect(ADMIN).toContain(`{"${t}"}`);
    }
  });
});
