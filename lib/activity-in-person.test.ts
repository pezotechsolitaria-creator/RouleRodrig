import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bookingAmount, placeToActivity, vehicleStage, vehicleToActivity } from "./activity";
import translations from "./i18n";

// M220 — the /track and /orders card for a booking the owner confirmed as paid
// in person. It printed `amount_paid ?? deposit_amount` as a bare "Rs X", so a
// cash booking with nothing paid showed its (never-to-be-paid) online deposit,
// looking exactly like money already handed over.

const TODAY = "2026-09-29";
const ID = "87e66300-0000-0000-0000-000000000000";

describe("the amount on a pay-in-person booking card", () => {
  const car = {
    id: ID, status: "confirmed", start_date: "2026-11-14", end_date: "2026-11-16",
    pay_in_person: true, total_amount: 5997, deposit_amount: 2999, amount_paid: null,
  };

  it("is what is left to bring, labelled as such — not the unpaid deposit", () => {
    const a = vehicleToActivity(car, TODAY);
    expect(a.amountCents).toBe(599700);
    expect(a.amountNote).toBe("to_pay_in_person");
  });

  it("shrinks as cash is recorded", () => {
    expect(bookingAmount("vehicle", { ...car, amount_paid: 1000 })).toEqual({
      amountCents: 499700, amountNote: "to_pay_in_person",
    });
  });

  it("reads as paid only once it is", () => {
    expect(bookingAmount("vehicle", { ...car, amount_paid: 5997 })).toEqual({
      amountCents: 599700, amountNote: "paid",
    });
  });

  it("prices a place booking from deposit_amount, its whole price (M210)", () => {
    const a = placeToActivity(
      { id: ID, status: "confirmed", start_date: "2026-10-02", pay_in_person: true, deposit_amount: 3500 },
      TODAY,
    );
    expect(a.amountCents).toBe(350000);
    expect(a.amountNote).toBe("to_pay_in_person");
  });

  it("shows no figure for a cancelled or no-show cash booking with nothing taken", () => {
    expect(bookingAmount("vehicle", { ...car, status: "cancelled" })).toEqual({ amountCents: null, amountNote: null });
  });

  it("leaves every other booking exactly as it was", () => {
    const online = { ...car, pay_in_person: false };
    expect(bookingAmount("vehicle", online)).toEqual({ amountCents: 299900, amountNote: null });
    expect(bookingAmount("vehicle", { ...online, amount_paid: 2500 })).toEqual({ amountCents: 250000, amountNote: null });
    // Rows read before activity-server selects the new columns.
    const legacy = vehicleToActivity({ id: ID, status: "confirmed", deposit_amount: 4000 }, TODAY);
    expect(legacy.amountCents).toBe(400000);
    expect(legacy.amountNote).toBeNull();
  });
});

describe("an approved rental is still waiting on the customer", () => {
  it("is 'pending', not 'Confirmed'", () => {
    expect(vehicleStage("approved", "2026-11-14", "2026-11-16", TODAY)).toBe("pending");
    expect(vehicleToActivity({ id: ID, status: "approved", start_date: "2026-11-14", end_date: "2026-11-16" }, TODAY).statusLabel)
      .toBe("Awaiting confirmation");
  });

  it("a confirmed one still reads as confirmed", () => {
    expect(vehicleStage("confirmed", "2026-11-14", "2026-11-16", TODAY)).toBe("confirmed");
  });
});

describe("/orders labels the figure", () => {
  const ORDERS = readFileSync(join(__dirname, "..", "app", "orders", "page.tsx"), "utf8");

  it("renders the note under the amount, from the dictionary", () => {
    expect(ORDERS).toContain("notes[a.amountNote]");
    expect(ORDERS).toContain("t.ordersPage.amountToPayInPerson");
  });

  it("has the words in all three languages", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(translations[lang].ordersPage.amountToPayInPerson.length).toBeGreaterThan(0);
      expect(translations[lang].ordersPage.amountPaid.length).toBeGreaterThan(0);
    }
  });
});
