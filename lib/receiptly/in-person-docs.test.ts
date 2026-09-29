import { describe, expect, it } from "vitest";
import { placeReservationDoc, vehicleRentalDoc } from "./documents";
import { computeMoney, heroAmount, type ReceiptlyDoc } from "./model";
import { toWinAnsi } from "@/lib/receipt-pdf";
import { PAYMENT } from "@/lib/payment-details";

// ── THE CONFIRMATION A CASH CUSTOMER KEEPS (M220) ───────────────────────────
//
// A booking confirmed as paid in person carries the same confirmation
// document as the online flow — but a page that printed an account number or
// a pay-by date would send the customer to a bank for money the owner is
// going to take in cash at the counter. The builder decides that from one
// flag, and ignores whatever `pay` / `dueOn` a caller passes.

const BANK = {
  method: `${PAYMENT.bank} · ${PAYMENT.account}`,
  reference: `${PAYMENT.accountName} · Ref RR-4F2A1B`,
};

const car = (extra: Partial<Parameters<typeof vehicleRentalDoc>[0]> = {}) =>
  vehicleRentalDoc({
    kind: "confirmation",
    reference: "RR-4F2A1B",
    customerName: "Éloïse Bané",
    vehicle: "Suzuki Swift",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    pickupTime: "09:00",
    days: 4,
    totalRupees: 5152,
    deliveryRupees: 300,
    depositRupees: 1288,
    depositPct: 25,
    issuedOn: "2026-09-29",
    payInPerson: true,
    // Deliberately passed: the flag must win over them.
    pay: BANK,
    dueOn: "2026-09-30",
    ...extra,
  })!;

const everyString = (d: ReceiptlyDoc) =>
  [d.payMethod, d.payReference, d.notes, d.dueOn, d.terms, d.footer].join(" | ");

describe("a rental confirmed as paid in person", () => {
  it("names the counter, not a bank", () => {
    const d = car();
    expect(d.payMethod).toBe("Cash at pickup");
    expect(d.payReference).toContain("RR-4F2A1B");
    expect(everyString(d)).not.toContain(PAYMENT.account);
    expect(everyString(d)).not.toContain(PAYMENT.bank);
  });

  it("has no pay-by deadline", () => {
    expect(car().dueOn).toBe("");
  });

  it("asks for no deposit: the hero is the total, not 'Deposit to confirm'", () => {
    const d = car();
    expect(d.depositPct).toBeNull();
    expect(d.depositFixedMinor).toBeNull();
    const m = computeMoney(d);
    expect(m.totalMinor).toBe(515200);
    expect(heroAmount(d, m)).toEqual({ minor: 515200, caption: "Total" });
  });

  it("shows cash taken at the counter as paid, and the rest as outstanding", () => {
    const m = computeMoney(car({ paidRupees: 2000 }));
    expect(m.receivedMinor).toBe(200000);
    expect(m.outstandingMinor).toBe(315200);
  });

  it("an online confirmation is untouched — deposit, deadline and account as before", () => {
    const d = car({ payInPerson: false });
    expect(d.payMethod).toBe(BANK.method);
    expect(d.dueOn).toBe("2026-09-30");
    expect(d.depositPct).toBe(25);
  });

  it("a quote stays a quote even if the flag is passed", () => {
    const d = car({ kind: "quote" });
    expect(d.payMethod).toBe(BANK.method);
    expect(d.depositPct).toBeNull();
  });
});

describe("a reservation confirmed as paid in person", () => {
  const res = placeReservationDoc({
    kind: "confirmation",
    reference: "RR-COCOS1",
    customerName: "Sandrine Baltz",
    placeName: "Îles aux Cocos – Les Inséparables",
    startDate: "2026-10-02",
    endDate: "2026-10-02",
    priceRupees: 3600,
    issuedOn: "2026-09-29",
    payInPerson: true,
    pay: BANK,
    dueOn: "2026-09-30",
  })!;

  it("pays on arrival, with no account and no deadline", () => {
    expect(res.payMethod).toBe("Cash on arrival");
    expect(res.dueOn).toBe("");
    expect(everyString(res)).not.toContain(PAYMENT.account);
    expect(computeMoney(res).totalMinor).toBe(360000);
  });
});

describe("every character the in-person block writes exists in the PDF font", () => {
  it("never turns into a question mark", () => {
    for (const d of [car(), car({ paidRupees: 500 })]) {
      for (const s of [d.payMethod, d.payReference]) {
        expect(toWinAnsi(s), s).not.toContain("?");
      }
    }
  });
});

// ── A RECEIPT FOR ONE PAYMENT AFTER AN EARLIER ONE (M220) ───────────────────
//
// The hero is THIS payment; the earlier money is its own negative line, so
// the lines, the badge and the balance all stay true. No deposit is asked.

describe("a receipt for a second payment", () => {
  const second = () =>
    car({ kind: "receipt", paidRupees: 3152, paidBeforeRupees: 2000, pay: null, dueOn: undefined });

  it("itemises the earlier payment as a negative line", () => {
    const d = second();
    const before = d.lines.find((l) => l.description === "Received before this payment");
    expect(before).toEqual({ description: "Received before this payment", qty: 1, unitMinor: -200000 });
  });

  it("adds up to the total less the earlier payment, and asks for no deposit", () => {
    const m = computeMoney(second());
    expect(m.totalMinor).toBe(315200);
    expect(m.depositMinor).toBe(0);
    expect(m.receivedMinor).toBe(315200);
    expect(heroAmount(second(), m).minor).toBe(315200);
  });

  it("ignores a zero or missing earlier payment", () => {
    for (const paidBeforeRupees of [0, null, undefined]) {
      const d = car({ kind: "receipt", paidRupees: 5152, paidBeforeRupees });
      expect(d.lines.some((l) => l.description === "Received before this payment")).toBe(false);
    }
  });
});
