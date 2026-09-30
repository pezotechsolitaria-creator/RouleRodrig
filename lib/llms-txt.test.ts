import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { DEFAULT_CONTENT, type RecommendedPlace, type SiteContent } from "@/lib/defaults";
import { SHEET } from "@/test/transfer-sheet.fixture";
import { foodFaq } from "@/lib/food-faq";
import { FR_PAGES } from "@/lib/nav/hubs";
import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  isSeedContent,
  UNREAD_CONTENT,
  unreadLlmsData,
  type LlmsData,
} from "./llms-txt";

// ── THE FILE AI ASSISTANTS READ FIRST (M150; generated since the SEO audit of
// 2026-09-29, C8/T20) ────────────────────────────────────────────────────────
//
// llms.txt is the one document written specifically for the engines that
// answer "how do I get around Rodrigues" without sending anyone to a website.
// Everything in it is quoted with our name attached, so a wrong line here is
// worse than a wrong line anywhere else on the site.
//
// It was a static file, and it drifted the way every hand-typed price on this
// site has: "les 12 plus belles plages" beside a page titled 19, "cars …
// delivered free" beside a car whose own note conditions delivery, "open every
// day", tickets promised while /events had none, "island kitchens" when there
// is one, and no airport transfer page at all. It shipped once claiming
// kitesurfing, which exists nowhere on the site.
//
// These build the real files from a fixture shaped like site_content, whose
// figures are deliberately NOT the live ones: a line that printed a remembered
// price instead of the data's would print a number the fixture never held.

const U = "https://roulerodrig.com";
const ROOT = join(__dirname, "..");

const base = DEFAULT_CONTENT.fleet[0];
const FLEET = [
  { ...base, id: "t-scoot", name: "Test Scooter 125", category: "scooter", price: "From Rs 777(free delivery)" },
  { ...base, id: "t-scoot2", name: "Test Scooter 150", category: "scooter", price: "Rs 888" },
  { ...base, id: "t-car", name: "Test Car", category: "car", price: "Rs 1888(Book for more than 2 days to get free delivery!!)" },
  { ...base, id: "t-car2", name: "Test Pickup", category: "car", price: "Rs 2,999" },
];

const place = (p: Partial<RecommendedPlace>) =>
  ({ description: "", image: "/x.jpg", ...p }) as RecommendedPlace;
const ITEMS = [
  place({ id: "h1", category: "hotel", name: "Test Lodge", priceNote: "Rs 1,357 per night" }),
  place({ id: "c1", category: "activity", name: "Île aux Cocos Excursion with Les Inséparables", priceNote: "Rs 1313/Person " }),
  place({ id: "b1", category: "activity", serviceType: "boat", name: "Balade test", priceNote: "Rs 717 per person", depositAmount: 717 }),
  place({ id: "m1", category: "activity", serviceType: "massage", name: "Rituel test", priceNote: "Rs 1,919 per person" }),
  // A nameless placeholder row, as site_content holds four of: renders nowhere.
  place({ id: "n1", category: "activity", serviceType: "hiking", name: "", image: "" }),
];

const CONTENT: SiteContent = {
  ...DEFAULT_CONTENT,
  fleet: FLEET,
  vehicleCategories: DEFAULT_CONTENT.vehicleCategories.map((c) => ({ ...c, deliveryFee: 0 })),
  recommended: { ...DEFAULT_CONTENT.recommended, enabled: true, items: ITEMS },
  contact: {
    ...DEFAULT_CONTENT.contact,
    phone: "+230 5835 5588",
    email: "bookings@roulerodrig.com",
    location: "Baie aux Huîtres, Rodrigues",
    hours: "Open 24 hours, every day",
  },
  faq: {
    ...DEFAULT_CONTENT.faq,
    enabled: true,
    items: [{ ...DEFAULT_CONTENT.faq.items[0], question: "Do I need a licence?", answer: "Yes, a valid one." }],
  },
  mapLocations: [],
};

const DATA: LlmsData = {
  siteUrl: U,
  content: CONTENT,
  fares: { airport: SHEET, ferry: 99900 },
  food: {
    kitchens: [{ name: "Chez Banane", address: "Rivière Banane", minNoticeHours: 24 }],
    dishPrices: [111100, 222200],
    deliveryEnabled: false,
  },
  eventsOnSale: false,
};

const TXT = buildLlmsTxt(DATA);
const FULL = buildLlmsFullTxt(DATA);

/** Every "Rs 1,234" / "Rs 1 234" / "Rs 1234" in a text, as whole rupees. */
const figures = (s: string) =>
  [...s.matchAll(/Rs\s?(\d{1,3}(?:[ ,  ]\d{3})+|\d+)/g)].map((m) => Number(m[1].replace(/\D/g, "")));

/**
 * Every figure the fixture holds, read straight off it — not through the
 * builder's helpers: the fleet's price strings, the listings' price notes, the
 * sheet's fares (and what a return saves, which the page states), the ferry,
 * the dishes.
 */
const ALLOWED = new Set<number>([
  ...FLEET.flatMap((f) => figures(f.price)),
  ...ITEMS.flatMap((p) => figures(p.priceNote ?? "")),
  ...[...SHEET.oneWay, ...SHEET.returnEach, SHEET.extraPassengerFee, SHEET.eveningSurcharge ?? 0].map((c) => c / 100),
  ...SHEET.oneWay.map((c, i) => (c - SHEET.returnEach[i]) / 100),
  99900 / 100,
  ...DATA.food!.dishPrices.map((c) => c / 100),
]);

/** Every route the app can serve, as segment lists. A "[slug]" segment is a
 *  wildcard. Compared segment-by-segment rather than by building a RegExp, so
 *  there is no escaping to get wrong. */
const ROUTES: string[][] = (function walk(dir: string, acc: string[][] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith("_") || name === "api") continue;
    for (const f of ["page.tsx", "page.ts", "route.ts"]) {
      try {
        statSync(join(full, f));
        acc.push(
          relative(join(ROOT, "app"), full)
            .split(sep)
            .filter((seg) => !seg.startsWith("(")),
        );
        break;
      } catch {
        /* no page file at this level */
      }
    }
    walk(full, acc);
  }
  return acc;
})(join(ROOT, "app"));

const matches = (path: string) => {
  const want = path.split("/").filter(Boolean);
  return ROUTES.some(
    (route) =>
      route.length === want.length &&
      route.every((seg, i) => seg.startsWith("[") || seg === want[i]),
  );
};

const urls = [...TXT.matchAll(/\((https:\/\/roulerodrig\.com[^)]*)\)/g)].map((m) => m[1]);
const lineFor = (path: string) => TXT.split("\n").find((l) => l.includes(`(${U}${path})`)) ?? "";

describe("every figure is one the data holds (C8, T20)", () => {
  it("prints no Rs figure in llms.txt that is not a live-data value", () => {
    const stray = figures(TXT).filter((n) => !ALLOWED.has(n));
    expect(stray, `figures not in the data: ${stray.join(", ")}`).toEqual([]);
    expect(figures(TXT).length).toBeGreaterThan(10);
  });

  it("prints none in llms-full.txt either", () => {
    const stray = figures(FULL).filter((n) => !ALLOWED.has(n));
    expect(stray, `figures not in the data: ${stray.join(", ")}`).toEqual([]);
  });

  it("leads the rentals with the fleet's own from-prices", () => {
    expect(lineFor("/browse/scooter")).toContain("from Rs 777/day");
    expect(lineFor("/browse/car")).toContain("from Rs 1,888/day");
    expect(TXT).toContain("Scooters from Rs 777 a day");
    expect(lineFor("/browse/stays")).toContain("from Rs 1,357 a night");
  });

  it("gives the French hub lines the same figures, grouped the French way (C1)", () => {
    expect(lineFor("/fr/location-scooter-rodrigues")).toContain("Dès Rs 777 par jour");
    expect(lineFor("/fr/location-voiture-rodrigues")).toContain("Dès Rs 1 888 par jour");
    expect(lineFor("/fr/hebergement-rodrigues")).toContain("dès Rs 1 357 la nuit");
  });

  it("states the airport zone fares from the sheet, on the /transfers line", () => {
    const l = lineFor("/transfers");
    expect(l).toContain("Rs 1,111 up to 6 km, Rs 1,444 over 6 and under 13 km, and Rs 1,777 for 13 km and over");
    expect(l).toContain("Port Mathurin Rs 1,777");
    expect(l).toContain("each extra passenger adds Rs 123");
    expect(l).toContain("you pay the driver");
  });

  it("prices each listing that has a page, and each category from what is in it", () => {
    expect(TXT).toContain(`(${U}/experiences/ile-aux-cocos-excursion-with-les-inseparables): price: Rs 1313/Person`);
    expect(lineFor("/experiences/boat")).toContain("From Rs 717.");
    expect(lineFor("/experiences/massage")).toContain("From Rs 1,919.");
  });
});

describe("it lists the pages that answer questions (C5, C8)", () => {
  it("lists /transfers, /about, /map, /emergency, /deliver and /guide/routes", () => {
    for (const p of ["/transfers", "/about", "/map", "/emergency", "/deliver", "/guide/routes", "/taxi"]) {
      expect(lineFor(p), p).not.toBe("");
    }
  });

  it("lists the experience categories that have listings, and only those", () => {
    expect(lineFor("/experiences/boat")).not.toBe("");
    expect(lineFor("/experiences/massage")).not.toBe("");
    // The only hiking row is nameless, and fishing has none.
    expect(lineFor("/experiences/hiking")).toBe("");
    expect(lineFor("/experiences/fishing")).toBe("");
  });

  it("lists /events only while tickets are on sale", () => {
    expect(TXT).not.toContain("/events");
    const onSale = buildLlmsTxt({ ...DATA, eventsOnSale: true });
    expect(onSale).toContain(`(${U}/events)`);
    expect(onSale).toContain("Event tickets:");
  });

  it("points at the full-answers file", () => {
    expect(TXT).toContain(`${U}/llms-full.txt`);
  });

  it("every link resolves to a real route", () => {
    expect(urls.length).toBeGreaterThan(15);
    const missing = urls.filter((u) => {
      const path = new URL(u).pathname.replace(/\/$/, "") || "/";
      if (path === "/") return false;
      return !matches(path);
    });
    expect(missing, `not routes: ${missing.join(", ")}`).toEqual([]);
  });

  it("uses the canonical host, never the retired vercel.app one", () => {
    expect(TXT).not.toMatch(/vercel\.app/);
    expect(TXT).not.toMatch(/http:\/\//);
  });
});

describe("the stale lines the audit found are gone (C8)", () => {
  it("drops the beach count the page computes live", () => {
    expect(TXT).not.toMatch(/Les \d+ plus belles plages|The \d+ best beaches/);
    expect(TXT).toContain("Les plus belles plages de Rodrigues");
  });

  it("says 'delivered free' only where the fee is 0 and no owner note conditions it", () => {
    expect(lineFor("/browse/scooter")).toContain("delivered free to your guest house");
    // The car's own note: "Book for more than 2 days to get free delivery!!"
    expect(lineFor("/browse/car")).toContain("delivered to your guest house");
    expect(lineFor("/browse/car")).not.toContain("delivered free");
  });

  it("takes the hours and base from the contact row, not 'open every day'", () => {
    expect(TXT).toContain("- Hours: Open 24 hours, every day");
    expect(TXT).toContain("Based in Baie aux Huîtres, Rodrigues.");
    expect(TXT).not.toMatch(/open every day/);
  });

  it("names the kitchen the catalog has, with its notice and cash at collection", () => {
    const l = lineFor("/food");
    expect(l).toContain("Chez Banane at Rivière Banane");
    expect(l).toContain("order at least 24 hours ahead");
    expect(l).toContain("pay in cash when you collect");
    expect(TXT).not.toMatch(/island kitchens/);
  });

  it("promises no coastguard number, which the data does not hold", () => {
    expect(TXT.toLowerCase()).not.toContain("coastguard");
  });

  it("no longer advertises kitesurfing, which exists nowhere on the site", () => {
    expect(TXT.toLowerCase()).not.toContain("kitesurf");
  });

  it("describes /browse/activities by what the page does, not by a fixed menu", () => {
    const l = lineFor("/browse/activities");
    expect(l).toMatch(/price per person/);
    expect(l).not.toMatch(/snorkelling|hiking|island tours/);
  });

  it("spells the brand unaccented everywhere (C17)", () => {
    expect(TXT).not.toContain("Roulé Rodrigues");
    expect(FULL).not.toContain("Roulé Rodrigues");
  });
});

describe("it says how to pay, per the house rules (C8)", () => {
  const pay = TXT.slice(TXT.indexOf("## How to pay"), TXT.indexOf("## Contact"));

  it("rentals: confirmed first, then MCB Juice, bank transfer or PayPal, or ask for cash", () => {
    expect(pay).toContain("we confirm availability first");
    expect(pay).toContain("MCB Juice, bank transfer or PayPal");
    expect(pay).toContain("ask to pay in person in cash, and we tell you whether you can");
    expect(pay).toContain("A listing with no price on it is a request only");
  });

  it("food in cash at collection; taxis and transfers to the driver", () => {
    expect(pay).toContain("(at least 24 hours) and paid to the kitchen in cash when you collect");
    expect(pay).toContain("paid in cash directly to the driver");
  });
});

describe("llms.txt keeps the shape the spec asks for", () => {
  it("opens with an H1 and a blockquote summary", () => {
    const lines = TXT.split("\n");
    expect(lines[0]).toMatch(/^# /);
    expect(lines.slice(1, 12).some((l) => l.startsWith(">"))).toBe(true);
  });

  it("groups the links under H2 sections", () => {
    expect((TXT.match(/^## /gm) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("gives a contact route that matches the site's own", () => {
    expect(TXT).toContain("bookings@roulerodrig.com");
    expect(TXT).toContain("5835 5588");
  });

  it("keeps the tours line to excursions that are actually listed", () => {
    const l = lineFor("/browse/tours");
    for (const real of ["Cocos", "Banane", "fishing", "lagoon"]) {
      expect(l).toContain(real);
    }
  });
});

describe("llms.txt does not leave the French half out", () => {
  it("lists every /fr/ page that exists, as the hub does", () => {
    const routes = readdirSync(join(ROOT, "app", "fr")).filter((n) => {
      try {
        return statSync(join(ROOT, "app", "fr", n, "page.tsx")).isFile();
      } catch {
        return false;
      }
    });
    expect(routes.length).toBeGreaterThanOrEqual(8);
    const missing = routes.filter((slug) => !TXT.includes(`/fr/${slug}`));
    expect(missing, `French pages absent from llms.txt: ${missing.join(", ")}`).toEqual([]);
    expect(FR_PAGES.every((p) => TXT.includes(`(${U}${p.href})`))).toBe(true);
  });

  it("describes the French pages in French", () => {
    const frLines = TXT.split("\n").filter((l) => l.includes("/fr/"));
    expect(frLines.length).toBeGreaterThanOrEqual(8);
    for (const l of frLines) {
      expect(l.toLowerCase()).toMatch(/francais|français|en francais/);
    }
  });
});

describe("llms-full.txt is the pages' own FAQs (C8)", () => {
  it("carries the taxi price answer in two parts, EN and FR, with the /transfers link", () => {
    expect(FULL).toContain("### How much does a taxi cost on Rodrigues?");
    expect(FULL).toContain("Every other ride: each driver sets their own fare");
    expect(FULL).toContain(`More: ${U}/transfers`);
    expect(FULL).toContain("### Combien coûte un taxi à Rodrigues ?");
    // The pointer under the French answer is in French too.
    const fr = FULL.slice(FULL.indexOf("## Le taxi à Rodrigues"));
    expect(fr).toContain(`Voir : ${U}/transfers`);
    expect(fr.slice(0, fr.indexOf("## Commander"))).not.toContain("More:");
  });

  it("carries the /transfers FAQ from the sheet", () => {
    expect(FULL).toContain("### How much is a taxi from Rodrigues airport to Port Mathurin?");
    expect(FULL).toContain("Rs 1,777 one way. Port Mathurin is 18.2 km from Plaine Corail by road");
  });

  it("names the listing at each end of the experience range, as the hub does", () => {
    expect(FULL).toContain("from Rs 717 (Balade test) to Rs 1,919 (Rituel test)");
  });

  it("carries the owner's own FAQ from the content row", () => {
    expect(FULL).toContain("### Do I need a licence?");
  });

  it("keeps the food price answer only while the catalog charges its figures", () => {
    const priced = foodFaq("en").find((f) => /Rs\s?\d/.test(f.answer))!;
    expect(FULL).not.toContain(priced.answer);
    const charged = figures(priced.answer).map((n) => n * 100);
    const kept = buildLlmsFullTxt({ ...DATA, food: { ...DATA.food!, dishPrices: charged } });
    expect(kept).toContain(priced.answer);
    // Answers with no figure pass either way.
    const plain = foodFaq("en").find((f) => !/Rs\s?\d/.test(f.answer))!;
    expect(FULL).toContain(plain.answer);
  });
});

describe("a failed or seed read still gives a useful file, with no figure", () => {
  it("recognises the seed getContent() falls back to", () => {
    expect(isSeedContent(DEFAULT_CONTENT)).toBe(true);
    expect(isSeedContent(CONTENT)).toBe(false);
    expect(isSeedContent(UNREAD_CONTENT)).toBe(false);
  });

  it("maps the site without a price, a seed phone or a seed hour", () => {
    const txt = buildLlmsTxt(unreadLlmsData(U));
    const full = buildLlmsFullTxt(unreadLlmsData(U));
    expect(figures(txt)).toEqual([]);
    expect(figures(full)).toEqual([]);
    expect(txt).not.toContain("5XXX");
    expect(txt).not.toContain(DEFAULT_CONTENT.contact.hours);
    expect(txt).toContain(`(${U}/transfers)`);
    expect(txt).toContain(`(${U}/browse/scooter)`);
    expect(txt).toContain("## How to pay");
  });
});

// ── THE LAST HAND-TYPED PRICE ON THE SITE, AND ITS TRIPWIRE ─────────────────
// The category titles stopped carrying a literal in 2eb8f542, because the
// hardcoded "Rs 1,999" was wrong the morning after it was written. llms.txt now
// reads the fleet; this keeps the titles from growing a second literal.
describe("no second hardcoded price in the category titles", () => {
  it("keeps price literals out of the browse META", () => {
    const page = readFileSync(join(ROOT, "app", "browse", "[category]", "page.tsx"), "utf8");
    // Comments stripped first: a prose mention of an old price is history.
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const META = code.slice(code.indexOf("const META"), code.indexOf("export async function generateMetadata"));
    expect(META).not.toMatch(/Rs [\d,]+/);
  });
});
