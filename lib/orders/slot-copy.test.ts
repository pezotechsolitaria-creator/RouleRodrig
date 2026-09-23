import { describe, expect, it } from "vitest";
import { parseSlotRange, slotFromBounds } from "./slot";
import {
  customerSlotLead,
  customerSlotPayment,
  merchantSlotCopy,
  slotAlertLine,
  slotCard,
  slotCardApplies,
  slotRowLabel,
  slotShortLabel,
} from "./slot-copy";

// ── M216 · WHAT A BOOKED ORDER SAYS ABOUT ITS DAY ───────────────────────────
//
// Friday 25 September 2026, 12:00–12:30 Rodrigues time (UTC+4) — the slot as
// PostgREST hands it over. Every assertion below is about that one lunch.
const SLOT = parseSlotRange('["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")')!;

// Wednesday 23 Sept, 20:00 on the island — two days before.
const WEDNESDAY = new Date("2026-09-23T16:00:00Z");
// Thursday 24 Sept, 09:00 — the day before.
const THURSDAY = new Date("2026-09-24T05:00:00Z");
// Friday 25 Sept, 07:00 — the day itself.
const FRIDAY = new Date("2026-09-25T03:00:00Z");

describe("the short forms", () => {
  it("reads the same from range text and from RPC bounds", () => {
    const fromRpc = slotFromBounds("2026-09-25T08:00:00+00:00", "2026-09-25T08:30:00+00:00")!;
    expect(slotShortLabel(fromRpc)).toBe(slotShortLabel(SLOT));
  });

  it("the PDF label is short enough for its field", () => {
    expect(slotShortLabel(SLOT)).toBe("Fri 25 Sep, 12:00–12:30");
  });

  it("the owner's alert line is the day he must not misread, in capitals", () => {
    expect(slotAlertLine(SLOT)).toBe("For FRI 25 SEP 12:00–12:30");
  });

  it("uses island time, not the server's — 22:00 UTC is already tomorrow on Rodrigues", () => {
    const late = parseSlotRange('["2026-09-24 22:00:00+00","2026-09-24 22:30:00+00")')!;
    expect(slotAlertLine(late)).toBe("For FRI 25 SEP 02:00–02:30");
  });

  it("labels the row by what happens at the slot", () => {
    expect(slotRowLabel("pickup")).toBe("Collection");
    expect(slotRowLabel("rr_delivery")).toBe("Handed to driver");
    expect(slotRowLabel("customer_delivery")).toBe("Driver collects");
    expect(slotRowLabel(null)).toBe("Collection");
  });
});

describe("the customer email's lead sentence", () => {
  it("pickup: when and where to collect, date spelled out", () => {
    expect(customerSlotLead(SLOT, "pickup", "Chez Banane")).toBe(
      "Collect on Friday 25 September, 12:00–12:30 at Chez Banane.",
    );
  });

  it("a Roulé delivery promises the HANDOVER, not an arrival time", () => {
    // The delivery job is created when the cook marks the order ready, so the
    // slot is when the food leaves the kitchen — nobody can promise the door.
    const s = customerSlotLead(SLOT, "rr_delivery", "Chez Banane");
    expect(s).toBe("Delivery on Friday 25 September — the kitchen hands it to the driver at 12:00–12:30.");
    expect(s).not.toMatch(/delivered (at|by|between)/i);
  });

  it("customer_delivery: ready for their own driver", () => {
    expect(customerSlotLead(SLOT, "customer_delivery", "Chez Banane")).toBe(
      "Ready for your driver on Friday 25 September, 12:00–12:30 at Chez Banane.",
    );
  });

  it("never says 'tomorrow' — an email is read whenever it is read", () => {
    for (const f of ["pickup", "rr_delivery", "customer_delivery"]) {
      expect(customerSlotLead(SLOT, f, "X")).not.toMatch(/tomorrow|today/i);
    }
  });
});

describe("what the customer owes", () => {
  it("cash is paid at collection, and nothing now", () => {
    expect(customerSlotPayment("cash", "pickup")).toBe("Pay in cash when you collect — nothing is charged now.");
    // Not "at handover": for a delivery the handover just named is kitchen →
    // driver. The customer pays when it reaches them, as checkout says.
    expect(customerSlotPayment("cash", "rr_delivery")).toMatch(/^Pay in cash when it reaches you/);
    expect(customerSlotPayment("cash", "rr_delivery")).not.toMatch(/handover/);
  });

  it("never names the 7-day hold", () => {
    for (const p of ["cash", "bank_transfer", "manual"] as const) {
      expect(customerSlotPayment(p, "pickup")).not.toMatch(/reserved until|days/i);
    }
  });

  it("a transfer is due before the slot, and is never taken automatically", () => {
    const s = customerSlotPayment("bank_transfer", "pickup");
    expect(s).toMatch(/before then/);
    expect(s).toMatch(/never charged automatically/);
  });
});

describe("what the kitchen is told", () => {
  it("leads with the slot and drops the 'confirm within 7 days' clock", () => {
    const s = merchantSlotCopy(SLOT, "pickup", "cash");
    expect(s.startsWith("Booked for Friday 25 September, 12:00–12:30.")).toBe(true);
    expect(s).toMatch(/pays in cash when they collect/);
    expect(merchantSlotCopy(SLOT, "rr_delivery", "cash")).toMatch(/pays in cash when it is delivered/);
    expect(s).toMatch(/Start cooking it on the day/);
    expect(s).not.toMatch(/7 days|Confirm within|reservation/i);
  });

  it("a delivery is booked only when the cook marks it ready", () => {
    expect(merchantSlotCopy(SLOT, "rr_delivery", "cash")).toMatch(/Mark it ready then/);
  });
});

describe("the order-page card", () => {
  it("two days out, names the date", () => {
    const c = slotCard(SLOT, { fulfillment: "pickup", storeName: "Chez Banane", provider: "cash", status: "pending_payment", now: WEDNESDAY });
    expect(c.headline).toBe("Collect on Friday 25 September, 12:00–12:30");
    expect(c.date).toBeNull();
    expect(c.lines).toEqual([
      "At Chez Banane.",
      "Pay in cash when you collect — nothing is charged now.",
      "The cook starts it on the day.",
    ]);
  });

  it("the day before says tomorrow — and still prints the date under it", () => {
    const c = slotCard(SLOT, { fulfillment: "pickup", storeName: "Chez Banane", provider: "cash", now: THURSDAY });
    expect(c.headline).toBe("Collect tomorrow, 12:00–12:30");
    expect(c.date).toBe("Friday 25 September");
  });

  it("on the day says today", () => {
    const c = slotCard(SLOT, { fulfillment: "pickup", storeName: "Chez Banane", now: FRIDAY });
    expect(c.headline).toBe("Collect today, 12:00–12:30");
  });

  it("a delivery headline carries the day, and the handover time below it", () => {
    const c = slotCard(SLOT, { fulfillment: "rr_delivery", storeName: "Chez Banane", provider: "cash", now: WEDNESDAY });
    expect(c.headline).toBe("Delivery on Friday 25 September");
    expect(c.lines[0]).toBe("The kitchen hands it to the driver between 12:00 and 12:30.");
  });

  it("stops talking about paying and the cook once it is under way", () => {
    const c = slotCard(SLOT, { fulfillment: "pickup", storeName: "Chez Banane", provider: "bank_transfer", status: "preparing", now: FRIDAY });
    expect(c.lines).toEqual(["At Chez Banane."]);
  });

  it("speaks French", () => {
    const c = slotCard(SLOT, { fulfillment: "pickup", storeName: "Chez Banane", provider: "cash", status: "pending_payment", lang: "fr", now: WEDNESDAY });
    expect(c.eyebrow).toBe("Votre créneau");
    expect(c.headline).toBe("À retirer le vendredi 25 septembre, 12:00–12:30");
    expect(c.lines[1]).toBe("Payez en espèces au retrait — rien n’est débité maintenant.");
    // The kitchen is NAMED "Chez Banane"; a French "Chez {store}" doubled it.
    expect(c.lines[0]).toBe("Auprès de Chez Banane.");
    for (const f of ["pickup", "customer_delivery"]) {
      const d = slotCard(SLOT, { fulfillment: f, storeName: "Chez Banane", lang: "fr", now: WEDNESDAY });
      expect(d.lines.join(" ")).not.toMatch(/chez chez/i);
    }
    const t = slotCard(SLOT, { fulfillment: "pickup", storeName: "Chez Banane", lang: "fr", now: THURSDAY });
    expect(t.headline).toBe("À retirer demain, 12:00–12:30");
    expect(t.date).toBe("Vendredi 25 septembre");
  });

  it("speaks Kreol", () => {
    const c = slotCard(SLOT, { fulfillment: "pickup", storeName: "Chez Banane", provider: "cash", status: "pending_payment", lang: "cr", now: WEDNESDAY });
    expect(c.headline).toBe("Vinn pran li Vandredi 25 Septam, 12:00–12:30");
    expect(c.lines[0]).toBe("Kot Chez Banane.");
    const t = slotCard(SLOT, { fulfillment: "rr_delivery", storeName: "Chez Banane", lang: "cr", now: THURSDAY });
    expect(t.headline).toBe("Livrezon demin");
  });

  it("no copy carries an HTML entity", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      for (const f of ["pickup", "rr_delivery", "customer_delivery"]) {
        for (const p of ["cash", "bank_transfer"] as const) {
          const c = slotCard(SLOT, { fulfillment: f, storeName: "X", provider: p, status: "pending_payment", lang, now: WEDNESDAY });
          expect(JSON.stringify(c)).not.toMatch(/&[a-z]+;|&#/);
        }
      }
    }
  });

  it("is only for an order still to be handed over", () => {
    expect(slotCardApplies("pending_payment")).toBe(true);
    expect(slotCardApplies("preparing")).toBe(true);
    expect(slotCardApplies("ready_for_pickup")).toBe(true);
    expect(slotCardApplies("collected")).toBe(false);
    expect(slotCardApplies("cancelled")).toBe(false);
    expect(slotCardApplies("refunded")).toBe(false);
  });
});
