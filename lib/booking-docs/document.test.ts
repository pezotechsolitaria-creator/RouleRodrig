import { describe, expect, it } from "vitest";
import {
  bookingDocMoney, bookingDocStatus, bookingDocHeading, bookingDocNote, MAX_LINES,
} from "./model";
import { buildBookingDocPdf, money, bookingDocFilename, type BookingDocData } from "./pdf";

const EN_DASH = "–";
const EM_DASH = "—";
/** What toWinAnsi turns an em-dash into: the byte WinAnsi actually has for it. */
const EM_DASH_BYTE = "";
const MIDDOT = "·";

const COCOS: BookingDocData = {
  ref: "RR-COCOS-SB",
  number: "RR-BKG-2026-000001",
  guestName: "Sandrine Baltz",
  details: [
    { label: "Experience", value: `Îles aux Cocos ${EN_DASH} Les Inséparables` },
    { label: "Guests", value: "2 persons" },
    { label: "Meeting point", value: "Pointe Diable" },
    { label: "Meeting time", value: "09:00" },
    { label: "Date", value: "23 September 2026" },
  ],
  lines: [
    { description: `Îles aux Cocos ${EN_DASH} Les Inséparables`, qty: 2, unitPriceCents: 180000 },
  ],
  depositPct: 50,
  receivedCents: 0,
  payInstruction: "MCB Juice: 58363401",
};

const bytes = (d: BookingDocData) => buildBookingDocPdf(d, new Date("2026-09-22T08:00:00Z"));
const latin1 = (d: BookingDocData) => Buffer.from(bytes(d)).toString("latin1");

/** Every text-drawing op on the page, as {font, size, x, y, text}. */
function drawn(d: BookingDocData) {
  const raw = latin1(d);
  const content = raw.slice(raw.indexOf("stream") + 6, raw.indexOf("endstream"));
  return [...content.matchAll(/BT \/(F\d) ([\d.]+) Tf ([\d.-]+) ([\d.-]+) Td \((.*?)\) Tj ET/g)]
    .map((m) => ({ font: m[1], size: Number(m[2]), x: Number(m[3]), y: Number(m[4]), text: m[5] }));
}

// ── THE ARITHMETIC ON A PAGE SOMEBODY KEEPS ─────────────────────────────────
//
// Every figure here is from the document the owner actually sends: two guests
// at Rs 1,800, a 50% deposit, nothing received yet.
describe("the money on the owner's own example", () => {
  const m = bookingDocMoney({ lines: COCOS.lines, depositPct: 50, receivedCents: 0 });

  it("multiplies the line out", () => {
    expect(m.lineTotals).toEqual([360000]);
    expect(money(m.totalCents)).toBe("Rs 3,600");
  });

  it("takes the deposit as a percentage of the total", () => {
    expect(money(m.depositCents)).toBe("Rs 1,800");
    expect(money(m.balanceAfterDepositCents)).toBe("Rs 1,800");
  });

  it("keeps 'balance after deposit' and 'still owed' apart", () => {
    // Two different questions that happen to share a figure at the start.
    // Once the whole Rs 3,600 has arrived, nothing is owed — while "balance
    // after deposit" still describes the arrangement that was agreed.
    const paid = bookingDocMoney({ lines: COCOS.lines, depositPct: 50, receivedCents: 360000 });
    expect(paid.balanceAfterDepositCents).toBe(180000);
    expect(paid.outstandingCents).toBe(0);
  });

  it("never loses a cent to rounding a percentage", () => {
    const odd = bookingDocMoney({
      lines: [{ description: "x", qty: 3, unitPriceCents: 33333 }],
      depositPct: 50,
      receivedCents: 0,
    });
    expect(odd.totalCents).toBe(99999);
    expect(odd.depositCents + odd.balanceAfterDepositCents).toBe(odd.totalCents);
  });

  it("treats no deposit as the whole amount being due", () => {
    const none = bookingDocMoney({ lines: COCOS.lines, depositPct: null, receivedCents: 0 });
    expect(none.depositCents).toBe(0);
    expect(none.balanceAfterDepositCents).toBe(none.totalCents);
  });
});

// ── THE WORDS ARE THE OWNER'S ───────────────────────────────────────────────
describe("the payment status says what he already says", () => {
  const m = bookingDocMoney({ lines: COCOS.lines, depositPct: 50, receivedCents: 0 });

  it("is PENDING with nothing received", () => {
    const s = bookingDocStatus(m, true);
    expect(s.label).toBe(`PENDING ${EM_DASH} NO PAYMENT RECEIVED`);
    expect(s.detail).toBe("Reservation is not locked until the required deposit is received.");
  });

  it("says the reservation is locked once the deposit is covered", () => {
    const part = bookingDocMoney({ lines: COCOS.lines, depositPct: 50, receivedCents: 180000 });
    const s = bookingDocStatus(part, true);
    expect(s.label).toBe(`DEPOSIT RECEIVED ${EM_DASH} BALANCE DUE`);
    expect(s.tone).toBe("part");
  });

  it("is not locked when less than the deposit arrived", () => {
    const part = bookingDocMoney({ lines: COCOS.lines, depositPct: 50, receivedCents: 50000 });
    expect(bookingDocStatus(part, true).label).toBe(`PART PAID ${EM_DASH} BALANCE DUE`);
  });

  it("becomes a receipt once it is paid in full", () => {
    const paid = bookingDocMoney({ lines: COCOS.lines, depositPct: 50, receivedCents: 360000 });
    expect(bookingDocStatus(paid, true).label).toBe("PAID IN FULL");
    expect(bookingDocHeading(paid)).toBe("RECEIPT");
    expect(bookingDocHeading(m)).toBe("BOOKING CONFIRMATION");
  });

  it("builds the note from the figures instead of retyping them", () => {
    // His own note repeats Rs 1,800 twice. Typed by hand, that is two chances
    // to disagree with the table above it.
    const note = bookingDocNote(m, true, money);
    expect(note).toContain("Rs 1,800 deposit is received");
    expect(note).toContain("The remaining Rs 1,800");
  });
});

// ── THE PAGE ────────────────────────────────────────────────────────────────
describe("the document as a page", () => {
  it("is a real PDF", () => {
    const b = bytes(COCOS);
    expect(Buffer.from(b.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(Buffer.from(b).toString("latin1")).toContain("%%EOF");
  });

  it("carries the owner's own reference in the header", () => {
    expect(latin1(COCOS)).toContain("Booking Ref: RR-COCOS-SB");
  });

  it("prints the four table columns at four separate x positions, left to right", () => {
    const header = drawn(COCOS)
      .filter((o) => ["Service", "Qty", "Unit price", "Total"].includes(o.text));
    expect(header).toHaveLength(4);
    const xs = header.map((o) => o.x);
    expect(new Set(xs).size).toBe(4);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("prints Amount received even when it is zero", () => {
    // Deliberate, and the opposite of the invoice — moneyRows() suppresses a
    // zero paid row because it reads as a failed payment. Here the zero IS the
    // message: it is what tells the guest the seat is not held yet.
    expect(drawn(COCOS).some((o) => o.text === "Rs 0")).toBe(true);
  });

  it("keeps the owner's typography rather than flattening it to ASCII", () => {
    const raw = latin1(COCOS);
    expect(raw).toContain(`Roulé Rodrigues ${EM_DASH_BYTE} take the long way.`);
    expect(raw).toContain(`PENDING ${EM_DASH_BYTE} NO PAYMENT RECEIVED`);
    expect(raw).toContain(`roulerodrig.com ${MIDDOT} Rodrigues Island`);
  });

  it("never draws over the footer, however much is on it", () => {
    // The renderer walks y downward with no overflow check and draws the
    // footer at a fixed height regardless, so this is the check that keeps a
    // full document from printing through its own footer.
    const full: BookingDocData = {
      ...COCOS,
      details: COCOS.details.map((d) => ({ ...d, value: `${d.value} and a much longer value` })),
      lines: Array.from({ length: MAX_LINES }, (_, i) => ({
        description: `Line ${i + 1} with a description long enough to be clamped`,
        qty: 3,
        unitPriceCents: 123456,
      })),
      note: "A deliberately long note. ".repeat(12),
    };
    const ops = drawn(full);
    const footer = ops.find((o) => o.text.startsWith("Thank you"))!;
    const above = ops.filter((o) => o !== footer).map((o) => o.y);
    expect(Math.min(...above)).toBeGreaterThan(footer.y + 12);
  });

  it("refuses to draw more lines than fit on the page", () => {
    const tooMany: BookingDocData = {
      ...COCOS,
      lines: Array.from({ length: 40 }, () => ({ description: "x", qty: 1, unitPriceCents: 100 })),
    };
    expect(drawn(tooMany).filter((o) => o.text === "x")).toHaveLength(MAX_LINES);
  });

  it("names the file after the reference the owner typed", () => {
    expect(bookingDocFilename("RR-COCOS-SB")).toBe("RR-COCOS-SB.pdf");
  });
});
