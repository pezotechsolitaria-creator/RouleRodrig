import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";
import {
  cheapestDailyRate,
  defaultMetaDescription,
  homeDescription,
  rentalFromPrices,
} from "./home-description";

// ── WHAT THE SITE SAYS IT IS (SEO audit 2026-09-29 C4, T8, C19, T16) ────────
//
// The homepage `about` block — also the #business JSON-LD description — said
// who and nothing else: no village, no car price, no way to book or pay. The
// root layout's default description printed a constant, not the fleet. Every
// figure below is passed in; nothing here may invent one.

const ROOT = join(__dirname, "..");
const code = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const LIVE = {
  locality: "Baie Aux Huîtres",
  scooterFrom: 699,
  carFrom: 1899,
  hours: "Open 24 hours, every day",
  foodOnSale: true,
  conciergeEnabled: true,
};

describe("homeDescription answers who, where, how much, how to pay, when", () => {
  const d = homeDescription(LIVE);

  it("says who and where", () => {
    expect(d.startsWith("Roule Rodrigues, based in Baie Aux Huîtres on Rodrigues Island (Mauritius)")).toBe(true);
  });

  it("prints both daily prices it was given, grouped", () => {
    expect(d).toContain("scooters from Rs 699 and cars from Rs 1,899 a day");
  });

  it("says how to book and pay — cash as something we agree, not a promise", () => {
    expect(d).toContain("You request your dates online and we confirm them");
    expect(d).toContain("by bank transfer, MCB Juice or PayPal");
    expect(d).toContain("when we agree it, in cash in person");
  });

  it("carries the owner's hours verbatim", () => {
    expect(d).toContain("Open 24 hours, every day.");
  });

  it("keeps the concierge, which still books tables, beside the food that is sold", () => {
    expect(d).toContain("order food from a local kitchen ahead of time, paid in cash");
    expect(d).toContain("WhatsApp food concierge to book you a table");
  });

  it("prints no figure it was not given", () => {
    const bare = homeDescription({});
    expect(bare).not.toMatch(/Rs\s?\d/);
    expect(bare).toContain("rents scooters and cars");
    expect(bare).toContain("on Rodrigues Island (Mauritius)");
    expect(bare).not.toMatch(/based in/);
    expect(bare).not.toMatch(/concierge|local kitchen/);
    // One missing price does not drag the other down with it.
    expect(homeDescription({ scooterFrom: 699 })).toContain("scooters from Rs 699 a day, and cars");
  });

  it("never calls anything free except the guide", () => {
    expect(d.match(/\bfree\b/gi)).toEqual(["free"]);
    expect(d).toContain("a free island guide");
  });

  it("uses the unaccented brand in visible text (C17)", () => {
    expect(d).not.toContain("Roulé Rodrigues");
  });
});

describe("defaultMetaDescription", () => {
  it("fits in 155 characters with the widest inputs", () => {
    for (const fromPrice of [699, 99999, null]) {
      for (const conciergeEnabled of [true, false]) {
        const d = defaultMetaDescription({ fromPrice, conciergeEnabled });
        expect(d.length, d).toBeLessThanOrEqual(155);
      }
    }
  });

  it("prints the live price, or none", () => {
    expect(defaultMetaDescription({ fromPrice: 699 })).toContain("from Rs 699/day");
    expect(defaultMetaDescription({})).not.toMatch(/Rs\s?\d/);
  });
});

// ── THE SEED IS NOBODY'S PRICE (C4) ─────────────────────────────────────────
// getContent() answers a failed read with DEFAULT_CONTENT, whose fleet says
// "From Rs 800" / "From Rs 600". Both sentences take their figures through
// rentalFromPrices, so a DB hiccup prints no price rather than Rs 600.
describe("rentalFromPrices / cheapestDailyRate", () => {
  const withCars = DEFAULT_CONTENT.vehicleCategories.map((c) =>
    c.id === "car" ? { ...c, enabled: true } : c,
  );
  const owner = (
    fleet: { id: string; category: string; price: string }[],
    vehicleCategories = withCars,
  ): SiteContent => ({
    ...DEFAULT_CONTENT,
    fleet: fleet.map((f) => ({ ...DEFAULT_CONTENT.fleet[0], ...f })),
    vehicleCategories,
  });

  it("answers nothing for the seed fleet getContent() falls back to", () => {
    expect(rentalFromPrices(DEFAULT_CONTENT)).toEqual({ scooterFrom: null, carFrom: null });
    expect(cheapestDailyRate(DEFAULT_CONTENT)).toBeNull();
    expect(defaultMetaDescription({ fromPrice: cheapestDailyRate(DEFAULT_CONTENT) })).not.toMatch(/Rs\s?\d/);
    expect(homeDescription(rentalFromPrices(DEFAULT_CONTENT))).not.toMatch(/Rs\s?\d/);
  });

  it("prices the owner's fleet per category, cheapest first", () => {
    const c = owner([
      { id: "a", category: "scooter", price: "From Rs 799" },
      { id: "b", category: "scooter", price: "From Rs 699" },
      { id: "c", category: "car", price: "From Rs 1,899" },
    ]);
    // Scooters quote the published scooter rate (SCOOTER_RATES.threePlus, 6 Oct 2026), whatever the price box says.
    expect(rentalFromPrices(c)).toEqual({ scooterFrom: 799, carFrom: 1899 });
    expect(cheapestDailyRate(c)).toBe(799);
  });

  it("a seed id carrying the owner's own price is the owner's fleet", () => {
    const c = owner([{ id: DEFAULT_CONTENT.fleet[0].id, category: "scooter", price: "From Rs 699" }]);
    expect(cheapestDailyRate(c)).toBe(799);
  });

  it("skips a category the hub does not show, and an unpriced row", () => {
    const c = owner(
      [
        { id: "a", category: "scooter", price: "From Rs 999" },
        { id: "c", category: "car", price: "From Rs 650" },
        { id: "d", category: "scooter", price: "On request" },
      ],
      DEFAULT_CONTENT.vehicleCategories, // cars seeded off
    );
    // The hidden Rs 650 car would undercut the scooter if it were read.
    expect(rentalFromPrices(c)).toEqual({ scooterFrom: 799, carFrom: null });
    expect(cheapestDailyRate(c)).toBe(799);
    expect(cheapestDailyRate(owner([]))).toBeNull();
  });
});

describe("the homepage builds it from live data", () => {
  const page = code("app/page.tsx");

  it("feeds one sentence to the visible block and to the JSON-LD", () => {
    expect(page).toMatch(/const businessDescription = homeDescription\(\{/);
    expect(page).toContain("description: businessDescription");
    expect(page).toContain("about={businessDescription}");
  });

  it("reads the village, hours and food flags from content, not literals", () => {
    expect(page).toContain("locality: addressLocality");
    // Prices and hours through the seed guard: a failed read prints neither.
    expect(page).toContain("const { scooterFrom, carFrom } = rentalFromPrices(content);");
    expect(page).toContain("const seedRead = isSeedContent(content);");
    expect(page).toContain("hours: seedRead ? null : content.contact.hours");
    expect(page).toMatch(/homeDescription\(\{[\s\S]*?scooterFrom,\s*carFrom,/);
    expect(page).toContain("conciergeEnabled: content.foodConcierge?.enabled === true");
    // The constant fallback (699) must not be able to reach the description.
    expect(page).not.toContain("fleetFromPrice");
  });

  it("states payment methods and the routed email on #business (T8)", () => {
    expect(page).toContain("paymentAccepted: PAYMENT_ACCEPTED");
    expect(page).toContain("email: CONTACT_EMAIL");
    expect(page).toContain("alternateName: BRAND_ALTERNATE");
  });

  it("points 'Activities & experiences' at /experiences (C19)", () => {
    expect(page).toMatch(/activities: "\/experiences"/);
    expect(page).toContain("SERVICE_URL[c.slug] ?? c.href");
  });

  it("no longer names /food a concierge (it is ordering; the concierge has its own URL)", () => {
    expect(page).not.toMatch(/food: "WhatsApp food concierge"/);
  });
});

describe("the root layout", () => {
  const layout = code("app/layout.tsx");

  it("derives its default description rather than printing a constant", () => {
    expect(layout).toContain("defaultMetaDescription({");
    expect(layout).not.toContain("FLEET_PRICE_FALLBACK");
    // Through the seed guard (lib/layout-default-description.test.ts drives it).
    expect(layout).toMatch(/import \{[^}]*\bcheapestDailyRate\b[^}]*\} from "@\/lib\/home-description"/);
    expect(layout).toContain("fromPrice: cheapestDailyRate(content)");
  });

  // ── FRENCH PAGES SERVED lang="en" (T16) ──────────────────────────────────
  // The pre-paint script is run here against a fake browser: the attribute is
  // what Bing reads, and a test of the source text alone would pass on a
  // script that never ran.
  const raw = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
  const script = raw.match(/__html: `(\(function\(\)\{try\{var d=document\.documentElement;var lang=null;[\s\S]*?\}\)\(\);)`/)?.[1];

  function run(pathname: string, stored: string | null, navLang = "en-GB") {
    expect(script, "the language script was not found in app/layout.tsx").toBeTruthy();
    const store = new Map<string, string>(stored ? [["rr_language", stored]] : []);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const html = { lang: "en", setAttribute() {}, removeAttribute() {} };
    const doc = {
      documentElement: html,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener() {},
    };
    new Function(
      "document", "location", "localStorage", "sessionStorage", "navigator", "window",
      "setTimeout", "setInterval", "clearInterval",
      script!,
    )(
      doc, { pathname, search: "" }, storage, storage, { language: navLang },
      { matchMedia: () => ({ matches: false }) }, () => 0, () => 0, () => {},
    );
    return { lang: html.lang, stored: store.get("rr_language") };
  }

  it("says fr on a /fr page whatever the visitor or crawler prefers", () => {
    expect(run("/fr/plages-rodrigues", null).lang).toBe("fr");
    expect(run("/fr", "en").lang).toBe("fr");
    expect(run("/fr/taxi-rodrigues", "cr").lang).toBe("fr");
  });

  it("leaves the visitor's stored choice alone", () => {
    expect(run("/fr/plages-rodrigues", "en").stored).toBe("en");
  });

  it("changes nothing elsewhere, including paths that merely start with the letters", () => {
    expect(run("/", "en").lang).toBe("en");
    expect(run("/", "cr").lang).toBe("mfe");
    expect(run("/free-stuff", "en").lang).toBe("en");
    expect(run("/experiences", null, "fr-FR").lang).toBe("fr");
  });
});
