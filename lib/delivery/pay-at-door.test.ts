import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { payAtDoor } from "./request-status";

const read = (p: string) => readFileSync(p, "utf8");

// ── WHERE DID THE CASH GO? ──────────────────────────────────────────────────
//
// payAtDoor() decides what a customer is told to have in their hand when the
// driver arrives, and it was BLIND to how they had chosen to pay.
//
// On a bank transfer the fee has already been sent. Ignoring that told somebody
// who had just transferred Rs 250 to have Rs 250 ready at the door — the whole
// sum, twice — while driver_dashboard() sets `collectCash` to 0 for exactly
// that case and the driver's card reads "Nothing to collect for the delivery."
// Two screens, one job, opposite instructions.
//
// The half a transfer does NOT cover is the till. On a shopping run the driver
// spends their own money and is repaid in cash on arrival, whatever happened to
// the fee. That money is the answer to "where did the cash go": it never went
// anywhere, and only the fee moved.

const FEE = 25_000;   // Rs 250
const CAP = 900_000;  // Rs 9,000

describe("a package, nothing laid out", () => {
  it("cash: the fee is due at the door", () => {
    const p = payAtDoor({ fee: FEE, kind: "package", spendCap: null }, "en");
    expect(p.dueAtDoor).toBe(true);
    expect(p.total).toBe("Rs 250");
  });

  it("bank transfer: NOTHING is due at the door", () => {
    // The bug: this used to say "Rs 250", asking again for money already sent.
    const p = payAtDoor(
      { fee: FEE, kind: "package", spendCap: null, paymentMethod: "bank_transfer" },
      "en",
    );
    expect(p.dueAtDoor).toBe(false);
    expect(p.total).toBe("Nothing to pay at the door");
    // The fee still appears, marked as sent — a total that simply vanishes
    // reads as a page that lost the price.
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].label).toContain("transfer");
    expect(p.lines[0].value).toBe("Rs 250");
  });
});

describe("a shopping run, where the driver fronts the till", () => {
  it("cash: fee AND spend are due at the door", () => {
    const p = payAtDoor(
      { fee: FEE, kind: "shop_and_deliver", spendCap: CAP },
      "en",
    );
    expect(p.dueAtDoor).toBe(true);
    expect(p.total).toBe("up to Rs 9250");
    expect(p.lines).toHaveLength(2);
  });

  it("bank transfer: the TILL money is still cash at the door", () => {
    // This is the whole question. The transfer moved the fee and nothing else;
    // the driver is out of pocket for the shopping until they are repaid.
    const p = payAtDoor(
      {
        fee: FEE,
        kind: "shop_and_deliver",
        spendCap: CAP,
        paymentMethod: "bank_transfer",
      },
      "en",
    );
    expect(p.dueAtDoor).toBe(true);
    // Rs 9000, NOT Rs 9250 — the fee is gone from the total, the spend is not.
    // (centsToShortString groups nothing; that is the site-wide format.)
    expect(p.total).toBe("up to Rs 9000");
    expect(p.note).not.toBeNull();
  });

  it("an errand that pays a bill behaves like a shopping run", () => {
    // mayLayOutMoney, not kind === shop_and_deliver. Somebody whose CEB bill is
    // paid for them owes that money back too.
    const p = payAtDoor(
      { fee: FEE, kind: "errand", spendCap: CAP, paymentMethod: "bank_transfer" },
      "en",
    );
    expect(p.dueAtDoor).toBe(true);
    expect(p.total).toBe("up to Rs 9000");
  });
});

describe("legacy rows keep their old meaning", () => {
  it("no method recorded is treated as cash", () => {
    // Every delivery created before M155 has a null payment_method, and every
    // one of them was cash. Reading absent as "transferred" would tell those
    // customers to pay nothing.
    const withNull = payAtDoor(
      { fee: FEE, kind: "package", spendCap: null, paymentMethod: null },
      "en",
    );
    const withNothing = payAtDoor(
      { fee: FEE, kind: "package", spendCap: null },
      "en",
    );
    expect(withNull.dueAtDoor).toBe(true);
    expect(withNull.total).toBe("Rs 250");
    expect(withNothing).toEqual(withNull);
  });
});

describe("all three languages answer", () => {
  it("none of them falls back to English", () => {
    const en = payAtDoor({ fee: FEE, kind: "package", spendCap: null, paymentMethod: "bank_transfer" }, "en");
    const fr = payAtDoor({ fee: FEE, kind: "package", spendCap: null, paymentMethod: "bank_transfer" }, "fr");
    const cr = payAtDoor({ fee: FEE, kind: "package", spendCap: null, paymentMethod: "bank_transfer" }, "cr");
    expect(new Set([en.total, fr.total, cr.total]).size).toBe(3);
  });
});

describe("the screens agree with the function", () => {
  const src = read("app/deliver/[id]/RequestTracker.tsx");

  it("the sheet's breakdown follows the toggle", () => {
    // Fixed at the cash figure, the heading read "You pay at the door — up to
    // Rs 9,250" directly above an option saying only the shop money was due.
    expect(src).toMatch(/paymentMethod: method,/);
  });

  it("the booked screen passes the delivery's own method", () => {
    expect(src).toMatch(/paymentMethod: d\.paymentMethod,/);
  });

  it("neither screen says 'you pay' about nothing", () => {
    expect(src.match(/pay\.dueAtDoor/g) ?? []).toHaveLength(2);
    expect(src).toContain("c.tracker.settledByTransfer");
  });

  it("the transfer option names an amount", () => {
    // It said only "Send it now, then attach the receipt" — no figure anywhere
    // in the flow, on the one path where the customer must decide how much to
    // send.
    expect(src).toContain("c.pay.transferSplit");
    expect(src).toContain("c.pay.transferTotal");
  });
});

describe("confirming can never fail in silence", () => {
  it("act() catches the network and a non-JSON reply", () => {
    // book() wraps act() in try/finally with no catch and is called as
    // `void book(...)`, so a rejection here was unhandled: spinner cleared,
    // sheet open, customer told nothing. That is what "it crashes when I
    // choose how to pay" looks like from their seat.
    const src = read("app/deliver/[id]/RequestTracker.tsx");
    const act = src.slice(
      src.indexOf("async function act("),
      src.indexOf("async function book("),
    );
    expect(act).toContain("try {");
    expect(act).toContain("c.error.network");
    // The res.json() parse is guarded separately: a 502 from the edge is HTML.
    // Two real catches: the fetch/parse wrapper and the res.json() guard.
    // Counted as `} catch` so the word inside this function's own comment
    // does not inflate it.
    expect(act.match(/\}\s*catch/g) ?? []).toHaveLength(2);
  });
});
