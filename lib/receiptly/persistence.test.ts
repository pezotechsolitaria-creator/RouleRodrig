import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toSaveArgs, toSavedDoc, toProfile, EMPTY_PROFILE } from "./db";
import { blankDoc } from "./draft";
import { computeMoney, type ReceiptlyDoc } from "./model";

const readSql = (f: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8")
    .replace(/^\s*--.*$/gm, "");
const readTs = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const M214 = readSql("20260923090000_m214_receiptly_documents.sql");
const M215 = readSql("20260923100000_m215_saving_a_receiptly_document.sql");
const ROUTE = readTs("app", "api", "admin", "receiptly", "route.ts");

const DOC: ReceiptlyDoc = {
  ...blankDoc("2026-09-23"),
  reference: "RR-COCOS-SB",
  customerName: "Sandrine Baltz",
  lines: [
    { description: "Cocos", qty: 2, unitMinor: 180000 },
    { description: "Lunch", qty: 2, unitMinor: 45000 },
  ],
};

// ── THE ONE MISMATCH THAT ONLY SHOWS UP AT RUNTIME ──────────────────────────
//
// supabase-js sends RPC arguments BY NAME. A key here that the function does
// not declare, or a parameter there that nothing sends, fails at the moment
// somebody presses Save — with a PostgREST error about a function signature,
// not a type error at build time. Nothing else in the stack catches it.
describe("the save call matches the function that receives it", () => {
  /** The parameter names receiptly_doc_save actually declares. */
  const declared = (() => {
    const start = M215.indexOf("create or replace function public.receiptly_doc_save(");
    const open = M215.indexOf("(", start);
    const close = M215.indexOf(")\nreturns", open);
    return new Set(
      [...M215.slice(open + 1, close).matchAll(/(p_[a-z_]+)\s+[a-z]/g)].map((m) => m[1]),
    );
  })();

  const sent = new Set(Object.keys(toSaveArgs(DOC, null, null)));

  it("finds the function and its parameters at all", () => {
    // A tripwire: two empty sets compare equal, and would make this whole
    // describe block a green test that checks nothing.
    expect(declared.size).toBeGreaterThan(15);
    expect(sent.size).toBeGreaterThan(15);
  });

  it("sends every parameter the function declares", () => {
    expect([...declared].filter((p) => !sent.has(p))).toEqual([]);
  });

  it("sends nothing the function does not declare", () => {
    expect([...sent].filter((p) => !declared.has(p))).toEqual([]);
  });
});

// ── NO DERIVED FIGURE TRAVELS OVER THE WIRE ─────────────────────────────────
describe("the browser never sends a total", () => {
  const args = toSaveArgs(DOC, null, null) as Record<string, unknown>;

  it("sends the typed figures and nothing computed from them", () => {
    // The database adds the lines up. A total that arrived over the wire is a
    // total that can disagree with the page it is printed on.
    for (const key of Object.keys(args)) {
      expect(key, key).not.toMatch(/total|subtotal|balance|outstanding/i);
    }
    expect(args.p_deposit_pct).toBe(50);
  });

  it("sends each line as description, qty and unit price only", () => {
    const lines = args.p_lines as Record<string, unknown>[];
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(Object.keys(l).sort()).toEqual(["description", "qty", "unitMinor"]);
    }
  });

  it("drops a line with no description rather than saving a blank row", () => {
    const withBlank = toSaveArgs(
      { ...DOC, lines: [...DOC.lines, { description: "  ", qty: 1, unitMinor: 500 }] },
      null, null,
    );
    expect((withBlank.p_lines as unknown[]).length).toBe(2);
  });

  it("never sends both a percentage and a flat deposit", () => {
    // The column has a CHECK refusing both; sending both would be a failed
    // save rather than a silently wrong figure, but it is still wrong to send.
    const both = toSaveArgs({ ...DOC, depositPct: 50, depositFixedMinor: 10000 }, null, null);
    expect(both.p_deposit_pct).toBeNull();
    expect(both.p_deposit_fixed_minor).toBe(10000);
  });
});

// ── A ROW COMES BACK AS THE DOCUMENT IT WAS ─────────────────────────────────
describe("reading a saved row", () => {
  const row = {
    id: "d1", number: "RR-BKG-2026-000001", state: "open",
    created_at: "2026-09-23T08:00:00Z", updated_at: "2026-09-23T08:00:00Z",
    kind: "receipt", reference: "RR-COCOS-SB",
    biz_name: "Roule Rodrigues", biz_tagline: "Take the long way",
    biz_website: "roulerodrig.com", biz_accent: "#0a7d3b", biz_logo: null,
    customer_name: "Sandrine Baltz", customer_email: "s@example.com", customer_phone: null,
    service_name: "Cocos", details: [{ label: "Guests", value: "2 persons" }],
    currency_code: "MUR", total_minor: 450000, deposit_pct: 50,
    deposit_fixed_minor: null, deposit_minor: 225000, received_minor: 450000,
    pay_method: "MCB Juice", pay_reference: "58363401",
    issued_on: "2026-09-23", due_on: null,
    notes: null, terms: null, footer: null, place_booking_id: null,
  };
  const lines = [
    { description: "Cocos", position: 1, qty: "2.000", unit_price_minor: 180000, line_total_minor: 360000 },
    { description: "Lunch", position: 2, qty: "2.000", unit_price_minor: 45000, line_total_minor: 90000 },
  ];

  it("turns the numeric qty PostgREST sends as a string back into a number", () => {
    const doc = toSavedDoc(row, lines);
    expect(doc.lines[0].qty).toBe(2);
    expect(typeof doc.lines[0].qty).toBe("number");
  });

  it("recomputes the same total the database stored", () => {
    // The round trip's real test: save, read back, and the arithmetic done in
    // TypeScript for the preview must land on the figure SQL committed.
    const doc = toSavedDoc(row, lines);
    expect(computeMoney(doc).totalMinor).toBe(row.total_minor);
    expect(computeMoney(doc).depositMinor).toBe(row.deposit_minor);
  });

  it("never leaves a money field undefined", () => {
    // The invoicing side shipped "Rs NaN still owed" exactly this way: a raw
    // row cast to the camelCase type, compiling perfectly, every figure gone.
    const doc = toSavedDoc(row, lines);
    for (const k of ["receivedMinor"] as const) {
      expect(Number.isFinite(doc[k]), k).toBe(true);
    }
    expect(doc.number).toBe("RR-BKG-2026-000001");
  });

  it("falls back rather than trusting an unknown kind or currency", () => {
    const odd = toSavedDoc({ ...row, kind: "nonsense", currency_code: "XXX" }, lines);
    expect(odd.kind).toBe("confirmation");
    expect(odd.currencyCode).toBe("MUR");
  });
});

describe("the business profile", () => {
  it("survives rubbish in the jsonb column", () => {
    expect(toProfile(null)).toEqual(EMPTY_PROFILE);
    expect(toProfile("nope")).toEqual(EMPTY_PROFILE);
  });

  it("accepts only a JPEG data URL as a logo", () => {
    expect(toProfile({ logo: "http://evil.example/x.png" }).logo).toBeNull();
    expect(toProfile({ logo: "data:image/svg+xml;base64,AAA" }).logo).toBeNull();
    expect(toProfile({ logo: "data:image/jpeg;base64,AAA" }).logo)
      .toBe("data:image/jpeg;base64,AAA");
  });

  it("refuses an accent that is not a colour", () => {
    expect(toProfile({ accent: "javascript:alert(1)" }).accent).toBe("#0a7d3b");
  });
});

// ── THE SCHEMA SAYS WHAT THE CODE ASSUMES ───────────────────────────────────
describe("the table backs the promises the tool makes", () => {
  it("keeps money in minor units, not cents, because a yen has none", () => {
    expect(M214).toContain("total_minor");
    expect(M214).not.toMatch(/total_cents/);
  });

  it("refuses a logo that is not a bounded JPEG data URL", () => {
    expect(M214).toContain("data:image/jpeg;base64,%");
    expect(M214).toContain("length(biz_logo) <= 120000");
  });

  it("refuses a deposit that is both a percentage and a figure", () => {
    expect(M214).toContain("receiptly_one_deposit_basis");
  });

  it("refuses a deposit larger than the document", () => {
    expect(M214).toContain("receiptly_deposit_within_total");
  });

  it("is denied to anon and authenticated, and asserts it", () => {
    expect(M214).toContain("enable row level security");
    expect(M214).toMatch(/revoke all on table public\.receiptly_documents\s+from anon, authenticated/);
    expect(M215).toContain("raise exception 'anon can write Receiptly documents'");
    expect(M215).toContain("raise exception 'anon can read Receiptly documents'");
  });

  it("shares the invoice register's counter, so two documents cannot collide", () => {
    expect(M215).toContain("public.next_invoice_seq('BKG', v_year)");
  });
});

describe("the endpoint guards what the database would refuse anyway", () => {
  it("runs the posted body through the same reviver a stored draft gets", () => {
    // A request body is user-controlled input even when the user is the owner.
    expect(ROUTE).toContain("reviveDoc(rawDoc");
  });

  it("is admin-guarded before it reads anything", () => {
    expect(ROUTE).toContain('guardAdminApi(req, "Invoicing")');
    expect(ROUTE.indexOf("guardAdminApi")).toBeLessThan(ROUTE.indexOf("receiptly_documents"));
  });

  it("audits the figures the database computed, not the ones posted", () => {
    expect(ROUTE).toContain("totalMinor: row.total_minor");
  });
});
