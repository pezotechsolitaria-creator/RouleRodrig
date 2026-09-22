import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOUSE,
  centsToMinor,
  islandToday,
  lineFromTotal,
  marketplaceOrderDoc,
  placeReservationDoc,
  rideDoc,
  rupeesToMinor,
  vehicleRentalDoc,
} from "./documents";
import { attachmentName, attachmentsFor, documentAttachment } from "./attach";
import { blankDoc } from "./draft";
import { computeMoney, docStatus, heroAmount, MAX_LINES, currencyByCode, type ReceiptlyDoc } from "./model";
import { toWinAnsi } from "@/lib/receipt-pdf";

const readTs = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8");

const EMAIL = readTs("lib", "email.ts");
const TYPES = readTs("lib", "email", "types.ts");

const MUR = currencyByCode("MUR");
const total = (d: ReturnType<typeof vehicleRentalDoc>) => computeMoney(d!).totalMinor;

// ── THE ONE INVARIANT EVERY ADAPTER OWES ────────────────────────────────────
//
// A document is attached to an email that already states the price. If the two
// disagree by so much as a rupee, the customer is holding two figures and no
// way to tell which one the business meant. So: whatever the source row says
// the thing costs, the lines on the document add up to exactly that.
describe("the document totals what the booking totals", () => {
  it("a vehicle rental, rental and delivery itemised", () => {
    const doc = vehicleRentalDoc({
      kind: "confirmation",
      reference: "RR-4F2A1B",
      customerName: "Sandrine Baltz",
      vehicle: "BURGMAN 125cc",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      days: 4,
      // bookings.total_amount is WHOLE RUPEES.
      totalRupees: 5997,
      deliveryRupees: 300,
      depositRupees: 1499,
      depositPct: 25,
      issuedOn: "2026-09-23",
    });
    expect(total(doc)).toBe(599700);
    expect(doc!.lines).toHaveLength(2);
    // The rental line is the total LESS the delivery, so the two add back up.
    expect(computeMoney(doc!).lineTotals.reduce((a, b) => a + b, 0)).toBe(599700);
  });

  it("a reservation, whose stored 'deposit' is the whole price", () => {
    const doc = placeReservationDoc({
      kind: "confirmation",
      reference: "RR-COCOS1",
      customerName: "Sandrine Baltz",
      placeName: "Îles aux Cocos",
      startDate: "2026-10-02",
      endDate: "2026-10-02",
      quantity: 2,
      priceRupees: 3600,
      issuedOn: "2026-09-23",
    });
    expect(computeMoney(doc!).totalMinor).toBe(360000);
  });

  it("a ride, whose fare is stored in CENTS", () => {
    const doc = rideDoc({
      reference: "RR-8823A1",
      customerName: "Sandrine Baltz",
      serviceLabel: "Airport transfer",
      pickup: "Plaine Corail",
      dropoff: "Port Mathurin",
      // ride_requests.quoted_price 180000 is Rs 1,800 — NOT Rs 180,000.
      fareCents: 180000,
      issuedOn: "2026-09-23",
    });
    expect(computeMoney(doc!).totalMinor).toBe(180000);
    expect(heroAmount(doc!, computeMoney(doc!)).minor).toBe(180000);
  });

  it("a shop order, items plus delivery plus tax", () => {
    const doc = marketplaceOrderDoc({
      kind: "receipt",
      orderNumber: "RR260907-C92312",
      customerName: "Marie L",
      items: [
        { name: "Piment confit", quantity: 2, lineTotalCents: 15000 },
        { name: "Miel", variant: "500g", quantity: 1, lineTotalCents: 45000 },
      ],
      deliveryFeeCents: 10000,
      taxCents: 5000,
      totalCents: 75000,
      paidCents: 75000,
      issuedOn: "2026-09-23",
    });
    expect(computeMoney(doc!).totalMinor).toBe(75000);
    expect(docStatus(doc!, computeMoney(doc!)).label).toBe("PAID IN FULL");
  });
});

// ── THE UNIT MAP, ASSERTED ──────────────────────────────────────────────────
describe("rupees and cents are never confused", () => {
  it("converts whole rupees to minor units", () => {
    expect(rupeesToMinor(1800)).toBe(180000);
    expect(centsToMinor(180000)).toBe(180000);
  });

  it("a rupee column and a cent column of the same magnitude differ 100×", () => {
    // This is the bug that has shipped four times, in one assertion: the same
    // number 1800, read from bookings.total_amount and from
    // ride_requests.quoted_price, is Rs 1,800 and Rs 18.00.
    const asRental = vehicleRentalDoc({
      kind: "quote", reference: "R", customerName: "X", vehicle: "V",
      startDate: "2026-10-01", endDate: "2026-10-02", days: 1,
      totalRupees: 1800, issuedOn: "2026-09-23",
    });
    const asFare = rideDoc({
      reference: "R", customerName: "X", serviceLabel: "Taxi", pickup: "A",
      fareCents: 1800, issuedOn: "2026-09-23",
    });
    expect(total(asRental)).toBe(100 * computeMoney(asFare!).totalMinor);
  });
});

describe("a quantity is only broken out when it divides exactly", () => {
  it("splits a clean total", () => {
    expect(lineFromTotal("Night", 3, 750000)).toEqual({
      description: "Night", qty: 3, unitMinor: 250000,
    });
  });

  it("refuses to split one that would round", () => {
    // 749900 / 3 is not a whole number of minor units. Splitting it would make
    // qty × unit disagree with the figure the customer was quoted.
    const line = lineFromTotal("Night", 3, 749900);
    expect(line.qty).toBe(1);
    expect(line.unitMinor).toBe(749900);
    expect(line.description).toBe("3 × Night");
    expect(line.qty * line.unitMinor).toBe(749900);
  });
});

// ── WHAT EACH DOCUMENT IS ALLOWED TO CLAIM ──────────────────────────────────
describe("a document never says more than the email it travels with", () => {
  const request = () =>
    vehicleRentalDoc({
      kind: "quote", reference: "RR-1", customerName: "X", vehicle: "V",
      startDate: "2026-10-01", endDate: "2026-10-02", days: 1,
      totalRupees: 2000, depositRupees: 500, depositPct: 25,
      issuedOn: "2026-09-23",
    })!;

  it("a request prints ESTIMATE, not a demand for money", () => {
    const s = docStatus(request(), computeMoney(request()));
    expect(s.label).toBe("ESTIMATE");
    expect(s.detail).toBe("This is an estimate, not a request for payment.");
  });

  it("a request carries no bank details", () => {
    expect(request().payMethod).toBe("");
    expect(request().payReference).toBe("");
  });

  it("a ride repeats the email's own sentence about who gets paid", () => {
    const doc = rideDoc({
      reference: "RR-1", customerName: "X", serviceLabel: "Taxi",
      pickup: "A", fareCents: 50000, issuedOn: "2026-09-23",
    })!;
    const SENTENCE =
      "You pay the driver directly at the end of the trip — nothing is charged here";
    expect(doc.notes).toContain(SENTENCE);
    // The same words are in the email's checklist. If one is reworded without
    // the other, a customer is told two different things about the money.
    expect(EMAIL).toContain(SENTENCE);
    expect(doc.kind).toBe("quote");
  });

  it("a reservation is never split into a deposit and a balance", () => {
    // place_bookings.deposit_amount stopped being a deposit on 2026-08-13:
    // it is the whole price. A "Deposit (50%)" row would invent a balance the
    // guest does not owe.
    const doc = placeReservationDoc({
      kind: "confirmation", reference: "RR-1", customerName: "X",
      placeName: "Îles aux Cocos", startDate: "2026-10-02", endDate: "2026-10-02",
      priceRupees: 3600, issuedOn: "2026-09-23",
    })!;
    expect(doc.depositPct).toBeNull();
    expect(doc.depositFixedMinor).toBeNull();
    expect(computeMoney(doc).depositMinor).toBe(0);
  });

  it("a reservation is one line, whatever the party size", () => {
    // The stored figure is flat per reservation — /api/place-bookings resolves
    // it server-side and says so. Multiplying by guests would print a per-head
    // rate this business has never charged.
    const doc = placeReservationDoc({
      kind: "confirmation", reference: "RR-1", customerName: "X",
      placeName: "Îles aux Cocos", startDate: "2026-10-02", endDate: "2026-10-02",
      guests: 4, quantity: 2, priceRupees: 3600, issuedOn: "2026-09-23",
    })!;
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].qty).toBe(1);
    expect(doc.lines[0].unitMinor).toBe(360000);
  });
});

describe("the deposit prints as a percentage only when it lands exactly", () => {
  const withDeposit = (totalRupees: number, depositRupees: number, pct: number) =>
    vehicleRentalDoc({
      kind: "confirmation", reference: "RR-1", customerName: "X", vehicle: "V",
      startDate: "2026-10-01", endDate: "2026-10-02", days: 1,
      totalRupees, depositRupees, depositPct: pct, issuedOn: "2026-09-23",
    })!;

  it("uses the percentage when it reproduces the stored figure", () => {
    const doc = withDeposit(2000, 500, 25);
    expect(doc.depositPct).toBe(25);
    expect(computeMoney(doc).depositMinor).toBe(50000);
  });

  it("uses the stored figure when the percentage would disagree", () => {
    // 25% of 1999 is 499.75, and the row says 500. The percentage would print
    // a deposit the email does not name.
    const doc = withDeposit(1999, 500, 25);
    expect(doc.depositPct).toBeNull();
    expect(doc.depositFixedMinor).toBe(50000);
    expect(computeMoney(doc).depositMinor).toBe(50000);
  });
});

describe("a shop order stays on one page and still adds up", () => {
  const manyItems = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Item ${i + 1}`, quantity: 1, lineTotalCents: 1000,
    }));

  it("collapses a basket too long to print, keeping its money", () => {
    const doc = marketplaceOrderDoc({
      kind: "receipt", orderNumber: "RR1", customerName: "X",
      items: manyItems(20), totalCents: 20000, paidCents: 20000,
      issuedOn: "2026-09-23",
    })!;
    expect(doc.lines.length).toBeLessThanOrEqual(MAX_LINES);
    expect(computeMoney(doc).totalMinor).toBe(20000);
    expect(doc.lines.at(-1)!.description).toContain("further item");
  });

  it("reconciles rather than printing lines that do not reach the total", () => {
    const doc = marketplaceOrderDoc({
      kind: "receipt", orderNumber: "RR1", customerName: "X",
      items: [{ name: "Thing", quantity: 1, lineTotalCents: 1000 }],
      totalCents: 1500, issuedOn: "2026-09-23",
    })!;
    expect(computeMoney(doc).totalMinor).toBe(1500);
    expect(doc.lines.some((l) => l.description === "Adjustment")).toBe(true);
  });
});

describe("no price, no document", () => {
  it("refuses a rental with no total", () => {
    expect(vehicleRentalDoc({
      kind: "quote", reference: "RR-1", customerName: "X", vehicle: "V",
      startDate: "", endDate: "", days: 1, totalRupees: null, issuedOn: "2026-09-23",
    })).toBeNull();
  });

  it("refuses a request-only reservation, which is most of them", () => {
    expect(placeReservationDoc({
      kind: "quote", reference: "RR-1", customerName: "X", placeName: "P",
      startDate: "", endDate: "", priceRupees: 0, issuedOn: "2026-09-23",
    })).toBeNull();
  });

  it("refuses a ride nobody could price", () => {
    expect(rideDoc({
      reference: "RR-1", customerName: "X", serviceLabel: "Taxi", pickup: "A",
      fareCents: null, issuedOn: "2026-09-23",
    })).toBeNull();
  });
});

// ── THE DATE A CUSTOMER READS ───────────────────────────────────────────────
describe("a document is dated on the island, not in UTC", () => {
  it("is already tomorrow in Rodrigues at 21:00 UTC", () => {
    // Rodrigues is UTC+4. toISOString().slice(0,10) would say the 23rd.
    expect(islandToday(new Date("2026-09-23T21:00:00Z"))).toBe("2026-09-24");
  });

  it("is still yesterday's date in UTC at 01:00 local", () => {
    expect(islandToday(new Date("2026-09-23T21:30:00Z"))).toBe("2026-09-24");
    expect(new Date("2026-09-23T21:30:00Z").toISOString().slice(0, 10)).toBe("2026-09-23");
  });
});

// ── THE ATTACHMENT ──────────────────────────────────────────────────────────
describe("the attachment", () => {
  const doc = () =>
    vehicleRentalDoc({
      kind: "confirmation", reference: "RR-4F2A1B", customerName: "Sandrine Baltz",
      vehicle: "BURGMAN 125cc", startDate: "2026-10-01", endDate: "2026-10-05",
      days: 4, totalRupees: 5997, deliveryRupees: 300, depositRupees: 1499,
      depositPct: 25, issuedOn: "2026-09-23",
    })!;

  it("is a real PDF", () => {
    const a = documentAttachment(doc())!;
    expect(a).not.toBeNull();
    expect(Buffer.from(a.content, "base64").toString("latin1").startsWith("%PDF-")).toBe(true);
  });

  it("is named after what it is, not after the row it came from", () => {
    expect(attachmentName(doc())).toBe("Booking-confirmation-RR-4F2A1B.pdf");
  });

  it("is nothing at all when there is no document, and never throws", () => {
    expect(documentAttachment(null)).toBeNull();
    expect(attachmentsFor(null)).toEqual([]);
  });

  it("survives a document the renderer cannot make sense of", () => {
    // The email is the load-bearing half. A customer without their PDF has
    // lost a convenience; a customer without their confirmation has lost a
    // booking.
    const broken = { ...doc(), lines: null as never, business: null as never };
    expect(documentAttachment(broken)).toBeNull();
  });
});

describe("one business identity, not two", () => {
  it("is the same block a hand-made document starts from", () => {
    expect(blankDoc("2026-09-23").business).toEqual(HOUSE);
  });

  it("asks for the built-in mark rather than naming a file", () => {
    // null is how a document says "use the house mark": the PDF assembler
    // embeds it whenever nothing was uploaded.
    expect(HOUSE.logo).toBeNull();
  });
});

// ── THE WIRING, AT THE SOURCE ───────────────────────────────────────────────
//
// There is no DOM environment in this repo and no live mail provider in a
// test, so these assert the call sites themselves — the same way the rest of
// lib/email's contract tests do.
describe("every customer booking email carries its document", () => {
  const attachesIn = (fn: string, expected: string) => {
    const at = EMAIL.indexOf(`export async function ${fn}`);
    expect(at, fn).toBeGreaterThan(-1);
    const next = EMAIL.indexOf("\nexport async function ", at + 10);
    const body = EMAIL.slice(at, next === -1 ? undefined : next);
    expect(body, fn).toContain("attachmentsFor(");
    expect(body, fn).toContain(expected);
  };

  it("the vehicle request, as an estimate", () => {
    attachesIn("sendBookingEmails", 'kind: "quote"');
  });

  it("the vehicle approval, as a booking confirmation", () => {
    attachesIn("sendAvailabilityConfirmed", 'kind: "confirmation"');
  });

  it("the reservation request, as an estimate", () => {
    attachesIn("sendPlaceBookingEmails", 'kind: "quote"');
  });

  it("the reservation approval, as a booking confirmation", () => {
    attachesIn("sendPlaceAvailabilityConfirmed", 'kind: "confirmation"');
  });

  it("the ride request, as an estimate", () => {
    attachesIn("sendRideEmails", "rideDoc({");
  });

  it("the two payment receipts", () => {
    attachesIn("sendBookingPaymentReceipt", 'kind: "receipt"');
    attachesIn("sendPlacePaymentReceipt", 'kind: "receipt"');
  });
});

describe("the payment-confirmation types are live, not planned", () => {
  // The failure this catches is invisible: a `planned` type still sends, but
  // the quota engine and the /admin/email dashboard both treat live mail as
  // something nobody has built yet.
  for (const t of [
    "scooter_payment_confirmation",
    "car_payment_confirmation",
    "accommodation_payment_confirmation",
    "activity_payment_confirmation",
  ]) {
    it(`${t} is registered and emitted`, () => {
      const line = TYPES.split("\n").find((l) => l.trim().startsWith(`${t}:`));
      expect(line, t).toBeTruthy();
      expect(line, `${t} is marked planned but code sends it`).not.toContain("planned");
      expect(EMAIL).toContain('vehicleEmailType("payment_confirmation"');
      expect(EMAIL).toContain('placeEmailType("payment_confirmation"');
    });
  }
});

describe("a receipt is only claimed where the money can be shown", () => {
  const RECEIPTS = readTs("lib", "receipts", "payment-receipt.ts");

  it("refuses a booking with neither a payment nor a declared transfer", () => {
    // Two guards, one per table. A booking moved to `confirmed` for some other
    // reason has no payment to receipt.
    const guards = RECEIPTS.split("if (!b.deposit_paid_at && !b.payment_reported_at) return false;");
    expect(guards).toHaveLength(3);
  });

  it("reads what was received from the row, never from the caller", () => {
    expect(RECEIPTS).toContain("num(b.amount_paid) ?? num(b.deposit_amount)");
  });
});

describe("the marketplace only attaches a receipt once the money is in", () => {
  const EVENTS = readTs("lib", "notifications", "order-events.ts");
  const PLACED = readTs("lib", "notifications", "order-placed.ts");

  it("a placed order gets a confirmation, not a receipt", () => {
    expect(PLACED).toContain('orderDocumentAttachments(admin, input.orderId, "confirmation")');
    expect(PLACED).not.toContain('"receipt"');
  });

  it("only payment_confirmed gets a receipt", () => {
    expect(EVENTS).toContain('event === "payment_confirmed"');
    expect(EVENTS).toContain('orderDocumentAttachments(admin, orderId, "receipt")');
  });
});

describe("formatting a figure a customer will read", () => {
  it("writes a whole rupee amount the way the island writes it", () => {
    const doc = placeReservationDoc({
      kind: "confirmation", reference: "RR-1", customerName: "X",
      placeName: "P", startDate: "2026-10-02", endDate: "2026-10-02",
      priceRupees: 2250, issuedOn: "2026-09-23",
    })!;
    expect(MUR.alwaysDecimals).toBe(false);
    expect(computeMoney(doc).totalMinor).toBe(225000);
  });
});

// ── EVERY CHARACTER HAS TO EXIST IN THE FONT ────────────────────────────────
//
// The PDF's fonts are declared with WinAnsiEncoding, and toWinAnsi() turns
// anything the encoding has no byte for into a literal "?". An arrow did
// exactly that: "Dates: 2026-10-01 ? 2026-10-05" printed on a page a customer
// keeps, and no test noticed because the arithmetic was perfect.
describe("nothing an adapter writes turns into a question mark", () => {
  const strings = (d: ReceiptlyDoc): string[] => [
    d.reference, d.customerName, d.customerEmail, d.customerPhone, d.serviceName,
    d.payMethod, d.payReference, d.notes, d.terms, d.footer,
    ...d.details.flatMap((x) => [x.label, x.value]),
    ...d.lines.map((l) => l.description),
  ];

  const samples: Record<string, ReceiptlyDoc> = {
    vehicle: vehicleRentalDoc({
      kind: "confirmation", reference: "RR-4F2A1B", customerName: "Éloïse Bané",
      vehicle: "BURGMAN 125cc", startDate: "2026-10-01", endDate: "2026-10-05",
      pickupTime: "09:00", days: 4, totalRupees: 5997, deliveryRupees: 300,
      depositRupees: 1499, depositPct: 25, issuedOn: "2026-09-23",
    })!,
    place: placeReservationDoc({
      kind: "confirmation", reference: "RR-COCOS1", customerName: "Sandrine Baltz",
      placeName: "Îles aux Cocos – Les Inséparables", startDate: "2026-10-02",
      endDate: "2026-10-04", timeSlot: "09:00", quantity: 2, priceRupees: 3600,
      issuedOn: "2026-09-23",
    })!,
    ride: rideDoc({
      reference: "RR-8823A1", customerName: "Sandrine Baltz", serviceLabel: "Airport transfer",
      pickup: "Plaine Corail", dropoff: "Port Mathurin", whenLabel: "Thursday 1 October",
      passengers: 3, fareCents: 180000, issuedOn: "2026-09-23",
    })!,
  };

  for (const [name, doc] of Object.entries(samples)) {
    it(`${name}`, () => {
      for (const s of strings(doc)) {
        if (s.includes("?")) continue; // a question mark the caller actually typed
        expect(toWinAnsi(s), s).not.toContain("?");
      }
    });
  }

  it("uses an en dash for a date range, which the encoding has", () => {
    expect(samples.vehicle.details.find((d) => d.label === "Dates")!.value)
      .toBe("1 Oct 2026 – 5 Oct 2026");
    expect(samples.ride.lines[0].description).toBe("Plaine Corail – Port Mathurin");
  });
});

describe("an estimate demands nothing", () => {
  it("prints no deposit row, even when the booking has one", () => {
    // The request email says no payment is due and that nobody has checked
    // the vehicle is free. "Deposit required" beside that sentence is what
    // makes a customer wire money for a booking that does not exist yet.
    const q = vehicleRentalDoc({
      kind: "quote", reference: "RR-1", customerName: "X", vehicle: "V",
      startDate: "2026-10-01", endDate: "2026-10-02", days: 1,
      totalRupees: 2000, depositRupees: 500, depositPct: 25, issuedOn: "2026-09-23",
    })!;
    expect(q.depositPct).toBeNull();
    expect(q.depositFixedMinor).toBeNull();
    expect(computeMoney(q).depositMinor).toBe(0);

    // ...and the confirmation, the same booking one step later, does.
    const c = vehicleRentalDoc({
      kind: "confirmation", reference: "RR-1", customerName: "X", vehicle: "V",
      startDate: "2026-10-01", endDate: "2026-10-02", days: 1,
      totalRupees: 2000, depositRupees: 500, depositPct: 25, issuedOn: "2026-09-23",
    })!;
    expect(computeMoney(c).depositMinor).toBe(50000);
  });
});

// ── THE FIGURES ARE THE LIVE ONES ───────────────────────────────────────────
//
// Fixtures I invent agree with me. These are the amounts actually sitting in
// the tables today, so the unit reading is checked against the business rather
// than against my own arithmetic.
describe("real rows from the live tables", () => {
  const rental = (totalRupees: number, days: number, depositRupees: number, pct: number) =>
    vehicleRentalDoc({
      kind: "confirmation", reference: "RR-1", customerName: "X", vehicle: "AVENIS 125",
      startDate: "2026-10-01", endDate: "2026-10-05", days,
      totalRupees, deliveryRupees: 0, depositRupees, depositPct: pct,
      issuedOn: "2026-09-23",
    })!;

  it("prices a rental per day, because every live total divides by its days", () => {
    // 8388 over 12 days is Rs 699 a day; 5997 over 3 is Rs 1,999.
    expect(rental(8388, 12, 2097, 25).lines[0]).toEqual({
      description: "AVENIS 125 — 12 days", qty: 12, unitMinor: 69900,
    });
    expect(rental(5997, 3, 2999, 50).lines[0].unitMinor).toBe(199900);
  });

  it("shows the percentage on the rows where it lands, and the figure where it does not", () => {
    // 25% of 8388 is exactly 2097, so the document can say why.
    expect(rental(8388, 12, 2097, 25).depositPct).toBe(25);
    // 50% of 5997 is 2998.50 and the row says 2999. The stored figure is the
    // one the customer was quoted, so that is what prints.
    expect(rental(5997, 3, 2999, 50).depositPct).toBeNull();
    expect(computeMoney(rental(5997, 3, 2999, 50)).depositMinor).toBe(299900);
  });

  it("reads the only priced reservation as Rs 1,000, not Rs 10", () => {
    const doc = placeReservationDoc({
      kind: "confirmation", reference: "RR-1", customerName: "X", placeName: "P",
      startDate: "2026-10-02", endDate: "2026-10-02", priceRupees: 1000,
      issuedOn: "2026-09-23",
    })!;
    expect(computeMoney(doc).totalMinor).toBe(100_000);
  });

  it("reads the ride fares as Rs 250 to Rs 1,800, not Rs 25,000 to Rs 180,000", () => {
    // The whole span of priced rides. A rupee reading makes the cheapest taxi
    // on the island cost twenty-five thousand rupees.
    for (const [cents, rupees] of [[25_000, 250], [180_000, 1800]] as const) {
      const doc = rideDoc({
        reference: "RR-1", customerName: "X", serviceLabel: "Taxi", pickup: "A",
        fareCents: cents, issuedOn: "2026-09-23",
      })!;
      expect(computeMoney(doc).totalMinor).toBe(rupees * 100);
    }
  });

  it("refuses to receipt the two bookings that are confirmed with no payment", () => {
    // Both live `confirmed` rows have no deposit_paid_at and no
    // payment_reported_at. They are exactly what the guard in
    // lib/receipts/payment-receipt.ts exists for: confirming a booking is not
    // the same event as receiving money for it.
    const RECEIPTS = readTs("lib", "receipts", "payment-receipt.ts");
    expect(RECEIPTS).toContain("if (!b.deposit_paid_at && !b.payment_reported_at) return false;");
  });
});
