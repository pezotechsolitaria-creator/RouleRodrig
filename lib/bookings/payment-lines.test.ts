import { describe, expect, it } from "vitest";
import {
  cashDueSentence,
  collectLine,
  hasStarted,
  placeMoneyLines,
  prefersInPerson,
  vehicleMoneyLines,
} from "./payment-lines";

// ── THE LINES UNDER "TOTAL", BRANCH BY BRANCH (M220) ────────────────────────
//
// Figures from the live rows on 29 Sept 2026. RR-329D81 is a Rs 5,152 rental
// confirmed by hand with nothing paid; its pickup reminder said "Balance at
// pickup Rs 3,864" because summaryRows() subtracted a 25% deposit nobody paid.

const label = (pairs: [string, string][]) => pairs.map(([k]) => k);
const joined = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}=${v}`).join(" | ");

const RENTAL = { total_amount: 5152, deposit_amount: 1288, deposit_pct: 25 };

describe("a rental paid in person", () => {
  it("tells them the WHOLE amount to bring in cash, not total minus an unpaid deposit", () => {
    const lines = vehicleMoneyLines({ ...RENTAL, status: "confirmed", pay_in_person: true });
    expect(lines).toEqual([["To pay at pickup (cash) · À régler au retrait (espèces)", "Rs 5,152"]]);
    // The exact regression: never Rs 3,864, never a deposit line.
    expect(joined(lines)).not.toContain("3,864");
    expect(joined(lines)).not.toMatch(/Deposit|Acompte/);
  });

  it("subtracts cash already taken, and shows it", () => {
    const lines = vehicleMoneyLines({ ...RENTAL, status: "confirmed", pay_in_person: true, amount_paid: 2000 });
    expect(lines).toEqual([
      ["Paid · Payé", "Rs 2,000"],
      ["To pay at pickup (cash) · À régler au retrait (espèces)", "Rs 3,152"],
    ]);
  });

  it("says paid in full when nothing is left", () => {
    const lines = vehicleMoneyLines({ ...RENTAL, status: "confirmed", pay_in_person: true, amount_paid: 5152 });
    expect(lines).toEqual([
      ["Paid · Payé", "Rs 5,152"],
      ["Balance · Solde", "Paid in full · Payé intégralement"],
    ]);
  });
});

describe("a rental paid online", () => {
  it("shows the deposit as PAID only once it arrived, with the true balance", () => {
    const lines = vehicleMoneyLines({
      ...RENTAL,
      status: "confirmed",
      amount_paid: 1288,
      deposit_paid_at: "2026-09-20T10:00:00Z",
    });
    expect(lines).toEqual([
      ["Deposit paid · Acompte payé", "Rs 1,288"],
      ["Balance at pickup · Solde au retrait", "Rs 3,864"],
    ]);
  });

  it("uses what PayPal actually took, not the figure asked for", () => {
    const lines = vehicleMoneyLines({
      ...RENTAL,
      status: "confirmed",
      amount_paid: 1300,
      deposit_paid_at: "2026-09-20T10:00:00Z",
    });
    expect(joined(lines)).toContain("Deposit paid · Acompte payé=Rs 1,300");
    expect(joined(lines)).toContain("Rs 3,852");
  });

  it("counts a declared transfer the owner confirmed, like the receipt does", () => {
    const lines = vehicleMoneyLines({
      ...RENTAL,
      status: "confirmed",
      payment_reported_at: "2026-09-20T10:00:00Z",
    });
    expect(label(lines)).toEqual(["Deposit paid · Acompte payé", "Balance at pickup · Solde au retrait"]);
  });

  it("does not count a declared transfer the owner has NOT confirmed", () => {
    const lines = vehicleMoneyLines({
      ...RENTAL,
      status: "approved",
      payment_reported_at: "2026-09-20T10:00:00Z",
    });
    expect(label(lines)[0]).toBe("Deposit to confirm · Acompte (25%)");
  });

  it("paid in full online says so", () => {
    const lines = vehicleMoneyLines({ ...RENTAL, status: "confirmed", amount_paid: 5152, deposit_paid_at: "x" });
    expect(lines).toEqual([["Paid · Payé", "Rs 5,152"], ["Balance · Solde", "Paid in full · Payé intégralement"]]);
  });
});

describe("a rental with nothing paid", () => {
  it("a request quotes the plan exactly as the request email always has", () => {
    // No status: the request email hands over the row it just inserted.
    for (const status of [undefined, "pending", "approved"]) {
      expect(vehicleMoneyLines({ ...RENTAL, status })).toEqual([
        ["Deposit to confirm · Acompte (25%)", "Rs 1,288"],
        ["Balance at pickup · Solde au retrait", "Rs 3,864"],
      ]);
    }
  });

  it("a confirmed online booking with nothing recorded is the old pill: the deposit was in (M220 review)", () => {
    // It printed "Still to pay Rs 5,152" to customers whose transfer the owner
    // had checked before pressing Confirmed. Never "still to pay" here.
    for (const status of ["confirmed", "completed"]) {
      const lines = vehicleMoneyLines({ ...RENTAL, status });
      expect(lines).toEqual([
        ["Deposit paid · Acompte payé", "Rs 1,288"],
        ["Balance at pickup · Solde au retrait", "Rs 3,864"],
      ]);
      expect(joined(lines)).not.toMatch(/Still to pay|Reste à payer/);
    }
  });

  it("with no deposit figure it prints nothing under the Total", () => {
    expect(vehicleMoneyLines({ total_amount: 5152, deposit_amount: null, status: "confirmed" })).toEqual([]);
  });

  it("a request from a customer who asked to pay in person quotes no online deposit (M220 review)", () => {
    for (const status of [undefined, "pending"]) {
      const lines = vehicleMoneyLines({ ...RENTAL, status, payment_preference: "in_person" });
      expect(lines).toEqual([["Payment · Paiement", "In person, to be confirmed · En personne, à confirmer"]]);
      expect(joined(lines)).not.toMatch(/Deposit|Acompte \(/);
    }
    // Only the request: once the owner holds it for online payment, the plan
    // is what they were sent.
    expect(label(vehicleMoneyLines({ ...RENTAL, status: "approved", payment_preference: "in_person" }))[0]).toBe(
      "Deposit to confirm · Acompte (25%)",
    );
    // An online preference changes nothing.
    expect(label(vehicleMoneyLines({ ...RENTAL, status: "pending", payment_preference: "online" }))[0]).toBe(
      "Deposit to confirm · Acompte (25%)",
    );
  });

  it("a cancelled booking owes nothing and says nothing", () => {
    expect(vehicleMoneyLines({ ...RENTAL, status: "cancelled", pay_in_person: true })).toEqual([]);
  });

  it("an unknown total prints no money lines (the caller has its own fallback)", () => {
    expect(vehicleMoneyLines({ total_amount: null, status: "confirmed", pay_in_person: true })).toEqual([]);
  });
});

describe("a reservation (stay, table, experience)", () => {
  // place_bookings.deposit_amount IS the whole price (M210).
  const RES = { deposit_amount: 3600, status: "confirmed" };

  it("paid in person: what to pay on arrival", () => {
    expect(placeMoneyLines({ ...RES, pay_in_person: true })).toEqual([
      ["To pay on arrival (cash) · À régler à l'arrivée (espèces)", "Rs 3,600"],
    ]);
    expect(placeMoneyLines({ ...RES, pay_in_person: true, amount_paid: 1000 })).toEqual([
      ["Paid · Payé", "Rs 1,000"],
      ["To pay on arrival (cash) · À régler à l'arrivée (espèces)", "Rs 2,600"],
    ]);
  });

  it("an online reservation keeps the card it always had — no money lines", () => {
    expect(placeMoneyLines(RES)).toEqual([]);
    expect(placeMoneyLines({ ...RES, pay_in_person: true, status: "cancelled" })).toEqual([]);
  });
});

describe("once the pickup / arrival day has come (M220 review)", () => {
  // The return reminder and the owner's collect reminder go out after pickup:
  // "to pay AT PICKUP" is then a sentence about the past.
  const TODAY = "2026-10-03";

  it("a rental's remainder is 'Still to pay (cash)', from the pickup day on", () => {
    for (const start_date of ["2026-10-01", "2026-10-03"]) {
      expect(
        vehicleMoneyLines({ ...RENTAL, status: "confirmed", pay_in_person: true, start_date }, TODAY),
      ).toEqual([["Still to pay (cash) · Reste à payer (espèces)", "Rs 5,152"]]);
    }
  });

  it("the day before pickup it is still 'at pickup', and without a clock nothing has started", () => {
    const row = { ...RENTAL, status: "confirmed", pay_in_person: true, start_date: "2026-10-04" };
    expect(label(vehicleMoneyLines(row, TODAY))).toEqual(["To pay at pickup (cash) · À régler au retrait (espèces)"]);
    expect(label(vehicleMoneyLines({ ...row, start_date: "2026-10-01" }))).toEqual([
      "To pay at pickup (cash) · À régler au retrait (espèces)",
    ]);
  });

  it("a reservation's remainder is 'Still to pay (cash)' from the arrival day on", () => {
    const row = { deposit_amount: 3600, status: "confirmed", pay_in_person: true, amount_paid: 1000, start_date: "2026-10-02" };
    expect(placeMoneyLines(row, TODAY)).toEqual([
      ["Paid · Payé", "Rs 1,000"],
      ["Still to pay (cash) · Reste à payer (espèces)", "Rs 2,600"],
    ]);
    expect(label(placeMoneyLines(row, "2026-10-01"))[1]).toBe("To pay on arrival (cash) · À régler à l'arrivée (espèces)");
  });

  it("hasStarted reads the date part only, and needs both dates", () => {
    expect(hasStarted({ start_date: "2026-10-03T00:00:00Z" }, TODAY)).toBe(true);
    expect(hasStarted({ start_date: "2026-10-04" }, TODAY)).toBe(false);
    expect(hasStarted({ start_date: null }, TODAY)).toBe(false);
    expect(hasStarted({ start_date: "2026-10-01" }, null)).toBe(false);
  });
});

describe("the sentences", () => {
  it("tells a cash customer what to bring, in both languages", () => {
    const s = cashDueSentence("vehicle", { total_amount: 5152, pay_in_person: true, status: "confirmed" })!;
    expect(s.en).toContain("Rs 5,152 in cash");
    expect(s.en).toContain("Nothing to pay online");
    expect(s.fr).toContain("Rs 5,152 en espèces");
    const p = cashDueSentence("place", { deposit_amount: 3600, pay_in_person: true })!;
    expect(p.en).toBe("Pay Rs 3,600 in cash on arrival. Nothing to pay online.");
    expect(p.fr).toContain("à votre arrivée");
  });

  it("says nothing to an online customer or when nothing is owed", () => {
    expect(cashDueSentence("vehicle", { total_amount: 5152 })).toBeNull();
    expect(cashDueSentence("vehicle", { total_amount: 5152, pay_in_person: true, amount_paid: 5152 })).toBeNull();
  });

  it("gives the owner the cash to collect, only for a live in-person booking", () => {
    expect(collectLine("vehicle", { total_amount: 5152, pay_in_person: true, status: "confirmed" })).toBe(
      "💵 Collect Rs 5,152 in cash",
    );
    expect(collectLine("vehicle", { total_amount: 5152, pay_in_person: true, status: "cancelled" })).toBeNull();
    expect(collectLine("vehicle", { total_amount: 5152, status: "confirmed" })).toBeNull();
    expect(collectLine("place", { deposit_amount: 900, pay_in_person: true, status: "confirmed", amount_paid: 900 })).toBeNull();
  });

  it("reads the customer's stated preference", () => {
    expect(prefersInPerson({ payment_preference: "in_person" })).toBe(true);
    expect(prefersInPerson({ payment_preference: "online" })).toBe(false);
    expect(prefersInPerson({})).toBe(false);
  });
});
