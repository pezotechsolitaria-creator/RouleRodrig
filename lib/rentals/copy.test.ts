import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATE_LOCALE, RENT_COPY, rentLang, rs } from "./copy";

// ── THE RENTALS COPY: THREE LANGUAGES, ONE TONE (owner brief, 6 Oct 2026) ──
//
// The brief named what made the flow feel unfinished: "Request Booking",
// "Estimated total", "Deposit to confirm", "Request in a minute", "!!",
// "(600x2)" and emoji. One price, a Reserve button, calm sentences. These hold
// that line in English, French and Kreol at once.

type Leaf = { path: string; value: string };

/** Every string the copy can produce, with functions called on sample input. */
function leaves(node: unknown, path = ""): Leaf[] {
  if (typeof node === "string") return [{ path, value: node }];
  if (typeof node === "function") {
    const f = node as (...a: unknown[]) => unknown;
    const out = f.length >= 3 ? f("scooter", 3, 799) : f(3);
    return leaves(out, `${path}()`);
  }
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

const LANGS = ["en", "fr", "cr"] as const;

describe("RENT_COPY parity", () => {
  it("has the same keys, in every language", () => {
    const keys = (l: (typeof LANGS)[number]) => leaves(RENT_COPY[l]).map((x) => x.path);
    expect(keys("fr")).toEqual(keys("en"));
    expect(keys("cr")).toEqual(keys("en"));
  });

  it("leaves no string empty", () => {
    for (const l of LANGS) {
      const empty = leaves(RENT_COPY[l]).filter((x) => !x.value.trim()).map((x) => x.path);
      expect(empty, l).toEqual([]);
    }
  });

  it("is translated, not copied: the button and the totals differ from English", () => {
    for (const l of ["fr", "cr"] as const) {
      expect(RENT_COPY[l].reserve).not.toBe(RENT_COPY.en.reserve);
      expect(RENT_COPY[l].dueAtPickup).not.toBe(RENT_COPY.en.dueAtPickup);
      expect(RENT_COPY[l].holdAtPickup).not.toBe(RENT_COPY.en.holdAtPickup);
    }
  });
});

describe("the tone the brief asked for", () => {
  const all = LANGS.flatMap((l) => leaves(RENT_COPY[l]).map((x) => ({ ...x, l })));

  it("has no exclamation mark", () => {
    expect(all.filter((x) => x.value.includes("!")).map((x) => `${x.l}.${x.path}`)).toEqual([]);
  });

  it("has no emoji", () => {
    expect(all.filter((x) => /\p{Extended_Pictographic}/u.test(x.value)).map((x) => `${x.l}.${x.path}`)).toEqual([]);
  });

  it("never estimates and never requests", () => {
    const bad = /estimat|request|deposit to confirm|demande de réservation|in a minute/i;
    expect(all.filter((x) => bad.test(x.value)).map((x) => `${x.l}.${x.path}: ${x.value}`)).toEqual([]);
  });

  it("says Reserve, Due now and Due at pickup in English", () => {
    expect(RENT_COPY.en.reserve).toBe("Reserve");
    expect(RENT_COPY.en.dueNow(50)).toBe("Due now (50%)");
    expect(RENT_COPY.en.dueAtPickup).toBe("Due at pickup");
    expect(RENT_COPY.en.holdAtPickup).toBe("Hold at pickup");
  });

  it("puts no arithmetic in a line item", () => {
    // "(600x2)" and "Rs 699 (x3)" are what the brief removed.
    expect(all.filter((x) => /\(\s*[\d,]+\s*[x×]\s*\d+\s*\)|\([^)]*Rs[^)]*\)/i.test(x.value)).map((x) => x.path)).toEqual([]);
  });

  it("advertises the scooter rate's condition beside it", () => {
    expect(RENT_COPY.en.scooterSub).toBe("3 days or more · delivery included");
  });
});

describe("rs() and the language helpers", () => {
  it("formats rupees with an English thousands comma, whole numbers only", () => {
    expect(rs(1899)).toBe("Rs 1,899");
    expect(rs(799)).toBe("Rs 799");
    expect(rs(5000)).toBe("Rs 5,000");
  });

  it("groups a French figure with a narrow no-break space, Kreol the island's way", () => {
    expect(rs(1899, "fr")).toBe("Rs 1 899");
    expect(rs(5697, "cr")).toBe("Rs 5,697");
    expect(rs(799, "fr")).toBe("Rs 799");
  });

  it("keeps the summary bar's due-now label short enough for one line", () => {
    // The bar beside Reserve has about 190px on a 375px phone; "À payer
    // maintenant (50 %) Rs 2 849" wrapped to a fourth line and moved the
    // calendar the moment a range was chosen.
    for (const l of LANGS) expect(RENT_COPY[l].dueNowShort.length, l).toBeLessThanOrEqual(18);
  });

  it("maps any other site language to English, and Kreol dates to French", () => {
    expect(rentLang("de")).toBe("en");
    expect(rentLang("fr")).toBe("fr");
    expect(rentLang("cr")).toBe("cr");
    expect(DATE_LOCALE.cr).toBe("fr-FR");
  });
});

describe("the surfaces speak from it", () => {
  const code = (p: string) =>
    readFileSync(join(process.cwd(), p), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  for (const file of [
    "components/BookingSection.tsx",
    "components/Fleet.tsx",
    "components/VehicleActionBar.tsx",
    "components/TrustBar.tsx",
    "app/browse/[category]/[vehicle]/page.tsx",
  ]) {
    it(`${file} carries none of the removed wording`, () => {
      expect(code(file)).not.toMatch(/Request Booking|Estimated total|Deposit to confirm|Request in a minute|ESTIMATED|% OFF/);
    });
  }
});
