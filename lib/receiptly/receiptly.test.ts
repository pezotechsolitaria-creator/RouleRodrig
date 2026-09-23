import { describe, expect, it } from "vitest";
import { measure, fit, wrapToWidth } from "./metrics";
import {
  CURRENCIES, currencyByCode, formatMoney, parseMoney, computeMoney, docStatus,
  heroAmount, suggestReference, lineTotal, MAX_LINES, DOC_KINDS,
  type ReceiptlyDoc,
} from "./model";
import { buildReceiptlyPdf, receiptlyFilename, longDate } from "./pdf";
import { PAGE, FOOTER_RESERVE, hexToRgb } from "./theme";
import { reviveDoc, blankDoc } from "./draft";

const MUR = currencyByCode("MUR");
const USD = currencyByCode("USD");
const JPY = currencyByCode("JPY");

const DOC: ReceiptlyDoc = {
  kind: "confirmation",
  business: {
    name: "Roulé Rodrigues", tagline: "Take the long way",
    website: "roulerodrig.com", logo: null, accent: "#0a7d3b",
  },
  customerName: "Sandrine Baltz",
  customerEmail: "sandrine.baltz@example.com",
  customerPhone: "+230 5712 3456",
  serviceName: "Îles aux Cocos – Les Inséparables",
  details: [
    { label: "Guests", value: "2 persons" },
    { label: "Meeting point", value: "Pointe Diable" },
    { label: "Meeting time", value: "09:00" },
    { label: "Date", value: "23 September 2026" },
  ],
  lines: [
    { description: "Îles aux Cocos – Les Inséparables", qty: 2, unitMinor: 180000 },
    { description: "Lunch on the island, per person", qty: 2, unitMinor: 45000 },
  ],
  currencyCode: "MUR",
  depositPct: 50,
  depositFixedMinor: null,
  receivedMinor: 0,
  payMethod: "MCB Juice",
  payReference: "58363401",
  reference: "RR-COCOS-SB",
  issuedOn: "2026-09-22",
  dueOn: "2026-09-25",
  notes: "Bring a hat.",
  terms: "The reservation is held once the deposit is received.",
  footer: "",
};

const latin1 = (d: ReceiptlyDoc) => Buffer.from(buildReceiptlyPdf(d)).toString("latin1");

/** Every text op drawn on the page. */
function drawn(d: ReceiptlyDoc) {
  const raw = latin1(d);
  const content = raw.slice(raw.indexOf("stream") + 6, raw.indexOf("endstream"));
  // A tracked run carries `Tc` inside its BT/ET, set before the run and reset
  // straight after so it cannot leak into the rest of the page.
  return [...content.matchAll(
    /BT (?:([\d.-]+) Tc )?\/(F\d) ([\d.]+) Tf ([\d.-]+) ([\d.-]+) Td \((.*?)\) Tj(?: 0 Tc)? ET/g,
  )].map((mm) => ({
    track: Number(mm[1] ?? 0), font: mm[2], size: Number(mm[3]),
    x: Number(mm[4]), y: Number(mm[5]), text: mm[6],
  }));
}

// ── MONEY IS WRITTEN THE WAY EACH CURRENCY IS WRITTEN ───────────────────────
describe("formatting money", () => {
  it("writes a whole rupee amount without decimals, as the owner does", () => {
    // His own document reads "Rs 3,600", not "Rs 3,600.00".
    expect(formatMoney(360000, MUR)).toBe("Rs 3,600");
    expect(formatMoney(450000, MUR)).toBe("Rs 4,500");
  });

  it("still shows the cents on a rupee amount that has them", () => {
    expect(formatMoney(97880, MUR)).toBe("Rs 978.80");
  });

  it("always shows them on a dollar, because that is how a dollar is written", () => {
    expect(formatMoney(4500, USD)).toBe("$ 45.00");
  });

  it("gives a yen no minor unit at all", () => {
    // Dividing a yen by a hundred invents precision the currency does not have.
    expect(JPY.exponent).toBe(0);
    expect(formatMoney(4500, JPY)).toBe("¥ 4,500");
  });

  it("groups thousands with a plain comma, never a narrow space", () => {
    // U+202F from French-locale formatting is the exact character that once
    // printed "Rs 25?883" on a real customer receipt.
    const s = formatMoney(2588300, MUR);
    expect(s).toBe("Rs 25,883");
    expect(s).not.toContain(" ");
  });

  it("every currency in the picker round-trips a typed amount", () => {
    for (const c of CURRENCIES) {
      const typed = c.exponent === 0 ? "4500" : "45.50";
      const minor = parseMoney(typed, c);
      expect(minor, c.code).not.toBeNull();
      expect(formatMoney(minor as number, c), c.code).toContain(c.symbol);
    }
  });
});

describe("reading what a human typed", () => {
  it("refuses an ambiguous comma rather than guessing", () => {
    // "2,50" is two-fifty in French and two thousand five hundred in English.
    // Guessing wrong is a 100x error on a document somebody keeps.
    expect(parseMoney("2,50", MUR)).toBeNull();
  });

  it("accepts a properly grouped thousand", () => {
    expect(parseMoney("1,800", MUR)).toBe(180000);
  });

  it("returns null for nothing, so a blank field is not a zero", () => {
    expect(parseMoney("", MUR)).toBeNull();
    expect(parseMoney("abc", MUR)).toBeNull();
  });
});

// ── THE ARITHMETIC ──────────────────────────────────────────────────────────
describe("the money on the document", () => {
  const m = computeMoney(DOC);

  it("multiplies each line and adds them up", () => {
    expect(m.lineTotals).toEqual([360000, 90000]);
    expect(m.totalMinor).toBe(450000);
  });

  it("takes the deposit as a percentage and never loses a unit to rounding", () => {
    expect(m.depositMinor).toBe(225000);
    expect(m.depositMinor + m.balanceAfterDepositMinor).toBe(m.totalMinor);

    const odd = computeMoney({
      ...DOC,
      lines: [{ description: "x", qty: 3, unitMinor: 33333 }],
      depositPct: 50,
    });
    expect(odd.depositMinor + odd.balanceAfterDepositMinor).toBe(odd.totalMinor);
  });

  it("lets a fixed deposit override a percentage, and caps it at the total", () => {
    const fixed = computeMoney({ ...DOC, depositFixedMinor: 100000 });
    expect(fixed.depositMinor).toBe(100000);
    const silly = computeMoney({ ...DOC, depositFixedMinor: 99_000_000 });
    expect(silly.depositMinor).toBe(silly.totalMinor);
  });

  it("ignores lines beyond what fits on the page", () => {
    const many = computeMoney({
      ...DOC,
      lines: Array.from({ length: 40 }, () => ({ description: "x", qty: 1, unitMinor: 100 })),
    });
    expect(many.lineTotals).toHaveLength(MAX_LINES);
  });

  it("rounds a fractional quantity rather than carrying a fraction of a cent", () => {
    expect(lineTotal({ description: "x", qty: 1.5, unitMinor: 333 })).toBe(500);
  });
});

// ── WHAT THE DOCUMENT SAYS IT IS ────────────────────────────────────────────
describe("status and hero, per kind", () => {
  it("leads a receipt with what was received, not what was owed", () => {
    const paid: ReceiptlyDoc = { ...DOC, kind: "receipt", receivedMinor: 450000 };
    const m = computeMoney(paid);
    expect(heroAmount(paid, m)).toEqual({ minor: 450000, caption: "Received with thanks" });
    expect(docStatus(paid, m).label).toBe("PAID IN FULL");
  });

  it("leads an unpaid confirmation with the deposit that holds it", () => {
    const m = computeMoney(DOC);
    expect(heroAmount(DOC, m)).toEqual({ minor: 225000, caption: "Deposit to confirm" });
    expect(docStatus(DOC, m).label).toBe("AWAITING PAYMENT");
  });

  it("leads an invoice with what is still owed", () => {
    const inv: ReceiptlyDoc = { ...DOC, kind: "invoice", receivedMinor: 100000 };
    const m = computeMoney(inv);
    expect(heroAmount(inv, m).minor).toBe(350000);
    expect(heroAmount(inv, m).caption).toBe("Amount due");
  });

  it("never asks a quote for money", () => {
    const q: ReceiptlyDoc = { ...DOC, kind: "quote" };
    const s = docStatus(q, computeMoney(q));
    expect(s.label).toBe("ESTIMATE");
    expect(s.detail).toContain("not a request for payment");
  });

  it("says when more arrived than was owed rather than hiding it", () => {
    const over: ReceiptlyDoc = { ...DOC, receivedMinor: 500000 };
    expect(docStatus(over, computeMoney(over)).detail).toContain("returnable");
  });

  it("distinguishes a deposit that is covered from one that is not", () => {
    const covered = { ...DOC, receivedMinor: 225000 };
    const short = { ...DOC, receivedMinor: 10000 };
    expect(docStatus(covered, computeMoney(covered)).label).toBe("DEPOSIT RECEIVED");
    expect(docStatus(short, computeMoney(short)).label).toBe("PART PAID");
  });
});

// ── MEASUREMENT, WHICH IS WHY THE NUMBERS LINE UP ───────────────────────────
describe("font metrics", () => {
  it("knows a digit is wider than a full stop", () => {
    expect(measure("0", 10, "regular")).toBeGreaterThan(measure(".", 10, "regular"));
  });

  it("gives every digit the same width, which is what lets money align", () => {
    const widths = "0123456789".split("").map((d) => measure(d, 10, "regular"));
    expect(new Set(widths).size).toBe(1);
  });

  it("scales linearly with size", () => {
    expect(measure("Total", 20, "bold")).toBeCloseTo(measure("Total", 10, "bold") * 2, 5);
  });

  it("cuts to a width, not a character count", () => {
    const long = "Iles aux Cocos and a great deal more text than will ever fit";
    const cut = fit(long, 80, 10, "regular");
    expect(measure(cut, 10, "regular")).toBeLessThanOrEqual(80);
    expect(cut.endsWith("")).toBe(true);
  });

  it("leaves a string that fits completely alone", () => {
    expect(fit("Total", 200, 10, "bold")).toBe("Total");
  });

  it("wraps to a width", () => {
    const lines = wrapToWidth("one two three four five six seven eight", 60, 9, "regular");
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l, 9, "regular")).toBeLessThanOrEqual(60);
  });
});

// ── THE PAGE ────────────────────────────────────────────────────────────────
describe("the rendered document", () => {
  it("is a real PDF", () => {
    const raw = latin1(DOC);
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toContain("%%EOF");
  });

  it("right-aligns money, so a longer figure starts further left", () => {
    // The whole point of shipping font metrics. Two documents, one with a
    // bigger total: the bigger number must START further left and END at the
    // same x, or the column is not aligned.
    const small = drawn(DOC).find((o) => o.text === "Rs 4,500")!;
    const bigDoc: ReceiptlyDoc = {
      ...DOC, lines: [{ description: "x", qty: 1, unitMinor: 12345600 }],
    };
    const big = drawn(bigDoc).find((o) => o.text === "Rs 123,456")!;
    expect(small).toBeTruthy();
    expect(big).toBeTruthy();
    expect(big.x).toBeLessThan(small.x);
  });

  it("puts the hero amount before anything else on the page", () => {
    const ops = drawn(DOC);
    const hero = ops.find((o) => o.size >= 24)!;
    expect(hero.text).toBe("Rs 2,250");
  });

  it("carries the reference and the document kind", () => {
    const raw = latin1(DOC);
    expect(raw).toContain("RR-COCOS-SB");
    expect(raw).toContain("BOOKING CONFIRMATION");
  });

  it("shows how to pay on a confirmation and not on a receipt", () => {
    expect(latin1(DOC)).toContain("MCB Juice");
    const paid: ReceiptlyDoc = { ...DOC, kind: "receipt", receivedMinor: 450000 };
    // A receipt is proof it is already paid; telling the reader how to pay
    // again is how somebody pays twice.
    expect(latin1(paid)).not.toContain("HOW TO PAY");
  });

  it("never draws over its own footer, however full the document", () => {
    const full: ReceiptlyDoc = {
      ...DOC,
      lines: Array.from({ length: MAX_LINES }, (_, i) => ({
        description: `Line ${i + 1} with a long description that has to be cut`,
        qty: 3, unitMinor: 123456,
      })),
      notes: "A deliberately long note. ".repeat(20),
      terms: "And terms at least as long as the note. ".repeat(20),
    };
    const ops = drawn(full);
    // The footer is PINNED: identified by where it sits, not by its words.
    // It used to read "Thank you for choosing X" beside "Made with
    // Receiptly", which gave the software equal billing with the business on
    // the business's own paper; it carries the hard facts now.
    const isFooter = (o: { y: number }) => o.y <= PAGE.margin + 14;
    expect(ops.filter(isFooter).length).toBeGreaterThanOrEqual(2);
    const content = ops.filter((o) => !isFooter(o));
    expect(Math.min(...content.map((o) => o.y)))
      .toBeGreaterThanOrEqual(PAGE.margin + FOOTER_RESERVE - 24);
  });

  it("renders every kind without throwing", () => {
    for (const kind of DOC_KINDS) {
      expect(() => buildReceiptlyPdf({ ...DOC, kind }), kind).not.toThrow();
    }
  });

  it("survives a completely empty document", () => {
    // The preview renders from the first keystroke, so the renderer sees a
    // blank document long before it sees a finished one.
    const empty = blankDoc("2026-09-22");
    expect(() => buildReceiptlyPdf(empty)).not.toThrow();
  });

  it("names the file after the reference", () => {
    expect(receiptlyFilename(DOC)).toBe("RR-COCOS-SB.pdf");
    expect(receiptlyFilename({ ...DOC, reference: "" })).toBe("Bookingconfirmation.pdf");
  });

  it("writes a date the way a document writes one", () => {
    expect(longDate("2026-09-23")).toBe("23 September 2026");
    expect(longDate("")).toBe("");
  });
});

describe("the brand colour", () => {
  it("reads a hex into PDF colour components", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#ffffff")).toEqual([1, 1, 1]);
  });

  it("expands the three-character form", () => {
    expect(hexToRgb("#fff")).toEqual([1, 1, 1]);
  });

  it("never throws on nonsense, because it comes from a colour input", () => {
    expect(() => hexToRgb("not a colour")).not.toThrow();
  });
});

// ── A DRAFT FROM A PREVIOUS VERSION, OR A HAND-EDITED ONE ───────────────────
describe("reviving a stored draft", () => {
  const today = "2026-09-22";

  it("survives absolute rubbish", () => {
    expect(reviveDoc(null, today).kind).toBe("confirmation");
    expect(reviveDoc("nonsense", today).lines).toHaveLength(1);
    expect(reviveDoc({ kind: "not-a-kind" }, today).kind).toBe("confirmation");
  });

  it("accepts only a JPEG data URL as a logo", () => {
    // A stored draft is user-controlled input, and this same reviver
    // sanitises the POST body. An http:// logo would make the document fetch
    // from somewhere on render; an SVG data URL in an <img> is a script
    // surface; a PNG would pass here and be dropped by the column CHECK,
    // showing a logo in the preview that never reaches the document.
    for (const bad of [
      "http://evil.example/x.png",
      "data:image/svg+xml;base64,AAA",
      "data:text/html;base64,AAA",
      "data:image/png;base64,AAA",
    ]) {
      expect(reviveDoc({ business: { logo: bad } }, today).business.logo, bad).toBeNull();
    }
    expect(reviveDoc({ business: { logo: "data:image/jpeg;base64,AAA" } }, today).business.logo)
      .toBe("data:image/jpeg;base64,AAA");
  });

  it("refuses an accent that is not a colour", () => {
    expect(reviveDoc({ business: { accent: "javascript:alert(1)" } }, today).business.accent)
      .toBe("#0a7d3b");
  });

  it("clamps a deposit percentage into range", () => {
    expect(reviveDoc({ depositPct: 900 }, today).depositPct).toBe(50);
    expect(reviveDoc({ depositPct: null }, today).depositPct).toBeNull();
  });

  it("keeps a real draft intact", () => {
    const back = reviveDoc(JSON.parse(JSON.stringify(DOC)), today);
    expect(back.customerName).toBe("Sandrine Baltz");
    expect(back.lines).toHaveLength(2);
    expect(computeMoney(back).totalMinor).toBe(450000);
  });
});

describe("suggesting a reference", () => {
  it("builds the shape the owner types by hand", () => {
    // RR-COCOS-SB: business initials, a slug of the trip, the guest's initials.
    // "Îles" loses its diacritic before the slug is cut, so the five letters
    // are ILESA — not LESAU. The accent is stripped, not the letter.
    expect(suggestReference("Roulé Rodrigues", "Îles aux Cocos", "Sandrine Baltz", "0922"))
      .toBe("RR-ILESA-SB");
  });

  it("still produces something when the fields are empty", () => {
    expect(suggestReference("", "", "", "0922")).toBe("RR-0922");
  });
});
