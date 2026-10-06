import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";
import type { TransferPricing } from "@/lib/rides/transfer";
import { costTiers } from "@/lib/vehicle-cost";
import { vehicleMetaDescription } from "@/lib/vehicle-meta";
import { vehicleMetaTitle } from "@/lib/browse-copy";
// From the environment (a local .env points it at the preview host), so the
// urls below are built from it rather than typed.
import { SITE_URL } from "@/lib/site";

// ── THE /browse PAGES, RENDERED (SEO audit 2026-09-29) ──────────────────────
//
// C1 C2 C4 C5 C13 C17 C18 C19 T2 T5 T7 T13 T18. Every assertion here reads what
// the real server components print — the category page, the vehicle page and
// three French pages — against a content row shaped like the live one, not a
// grep of their source (a grep matches the comment that explains the fix).
//
// The fixture's numbers are the live shape where that is the point (a Swift at
// Rs 1,899, a Rs 600 car delivery fee, an unpriced "New Cars" draft, nameless
// hiking rows, a tour priced only in its note) and deliberately NOT the live
// ones where a remembered figure could pass by accident: the airport sheet is
// Rs 1,131 / 1,464 / 1,797 with zones at 6 and 13 km.

const fx = vi.hoisted(() => ({ view: null as unknown, airport: null as unknown }));

vi.mock("@/lib/site-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/site-data")>()),
  getFleetView: async () => fx.view,
}));
vi.mock("@/lib/rides/fares", () => ({
  readTransferFares: async () => ({ airport: fx.airport, ferry: null }),
}));

// Client chrome and Next internals: not what these tests are about, and they
// want a browser or a router. Inert stand-ins.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode; className?: string; hrefLang?: string; lang?: string }) =>
    createElement("a", { href: p.href, className: p.className, hrefLang: p.hrefLang, lang: p.lang }, p.children),
}));
vi.mock("@/components/nav/LangLink", () => ({
  default: (p: { href: string; children?: ReactNode }) => createElement("a", { href: p.href }, p.children),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/BrowseTabs", () => ({ default: () => null }));
vi.mock("@/components/TrustBar", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
vi.mock("@/components/VehicleActionBar", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/PageLanguage", () => ({ default: () => null }));
vi.mock("@/components/nav/HubBacklink", () => ({ default: () => null }));
// The fleet grid prints the page's heading and the intro it is handed.
vi.mock("@/components/Fleet", () => ({
  default: (p: { title: string; subtitle?: ReactNode; intro?: ReactNode }) =>
    createElement(
      "section",
      null,
      createElement("h1", null, p.title),
      createElement("p", null, p.subtitle),
      createElement("p", null, p.intro),
    ),
}));
// The booking form: only the panel it renders from `conditions`, exactly as
// BookingSection does (<RentalConditions items={conditions} />). The panel is
// the REAL component — T18 is about what it prints.
vi.mock("@/components/BookingSection", async () => {
  const { default: RentalConditions } = await import("@/components/RentalConditions");
  return {
    default: (p: { conditions?: unknown[] }) =>
      p.conditions?.length ? createElement(RentalConditions, { items: p.conditions as never }) : null,
  };
});
vi.mock("@/components/RecommendedPlaces", () => ({
  default: (p: { content: { items: { id: string; name: string }[] } }) =>
    createElement("ul", null, p.content.items.map((i) => createElement("li", { key: i.id }, i.name))),
}));
vi.mock("@/components/GettingAround", () => ({
  default: (p: { content: { title: string } }) => createElement("h1", null, p.content.title),
}));

// ── The fixture ─────────────────────────────────────────────────────────────

const vehicle = (o: { id: string; name: string; price: string; category: string }) => ({
  badge: "",
  tagline: "",
  description: "",
  image: `/${o.id}.jpg`,
  unit: "/day",
  available: true,
  specs: ["Automatic", "5 Seats"],
  included: ["Insurance"],
  ...o,
});

const SWIFT_PRICE = "Rs 1899(Book for more than 2 days to get free delivery!!)";

function fleet(o: { swift?: string; carFee?: number; carsOn?: boolean } = {}) {
  return [
    vehicle({ id: "burgman", name: "BURGMAN 125cc", price: "Rs 699(free delivery)", category: "scooter" }),
    vehicle({ id: "avenis-1", name: "AVENIS 125cc", price: "Rs 699", category: "scooter" }),
    vehicle({ id: "avenis-2", name: "AVENIS 125cc", price: "Rs 699", category: "scooter" }),
    vehicle({ id: "swift", name: "Suzuki Swift (Latest Gen)", price: o.swift ?? SWIFT_PRICE, category: "car" }),
    vehicle({ id: "hilux", name: "Toyota Hilux", price: "Rs 2,899", category: "car" }),
    // The unfinished template row: no price, so no page, no table row, no count.
    vehicle({ id: "draft", name: "New Cars", price: "", category: "car" }),
  ];
}

const place = (o: Record<string, unknown>) => ({ image: "/p.jpg", description: "", ...o });
const PLACES = [
  place({ id: "rec-lakaze", category: "hotel", name: "Lakaze Mama", priceNote: "Rs 1,000 per night", description: "A house by the sea.", descriptionFr: "Une maison au bord de la mer." }),
  place({ id: "rec-cath", category: "hotel", name: "Cathartica", priceNote: "Rs 2,990 per night", description: "Self-catering." }),
  // Nameless: renders nowhere, so it must price, list and describe nothing —
  // even though it is the cheapest row on the page.
  place({ id: "rec-ghost-stay", category: "hotel", name: "  ", priceNote: "Rs 500 per night" }),
  place({ id: "rec-rituel", category: "activity", serviceType: "massage", name: "Rituel Signature Harmony Spa (1 h 30)", priceNote: "Rs 1999 per person" }),
  place({ id: "rec-sunrise", category: "activity", serviceType: "hiking", name: "Sunrise hike from Anse aux Anglais", priceNote: "Rs 2,500 per person(Free transfer to starting point)" }),
  place({ id: "rec-ghost-1", category: "activity", serviceType: "hiking", name: "", depositAmount: 300 }),
  place({ id: "rec-ghost-2", category: "activity", serviceType: "hiking", name: "" }),
  // Priced only in its note, no deposit set: the Service went out with no Offer.
  place({ id: "rec-cocos", category: "activity", isTour: true, name: "Île aux Cocos Excursion with Les Inséparables", priceNote: "Rs 1999/Person " }),
  place({ id: "rec-balade", category: "activity", isTour: true, serviceType: "boat", name: "Balade en mer", priceNote: "Rs 700 per person", depositAmount: 700 }),
];

const SHEET = {
  zone1MaxKm: 6,
  zone2MaxKm: 13,
  oneWay: [113100, 146400, 179700],
  returnEach: [113100, 146400, 170000],
  includedPassengers: 1,
  extraPassengerFee: 20000,
  maxPricedPassengers: 6,
  nightMode: "manual",
  nightFromHour: 22,
  nightToHour: 4,
  bookable: true,
  places: [],
} as unknown as TransferPricing;

function setView(o: { swift?: string; carFee?: number; carsOn?: boolean; airport?: TransferPricing | null } = {}) {
  const content = {
    ...DEFAULT_CONTENT,
    contact: { ...DEFAULT_CONTENT.contact, location: "Baie Aux Huîtres,Rodrigues" },
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true, deliveryFee: 0, depositPct: 25 },
      { id: "car", label: "Cars", enabled: o.carsOn ?? true, deliveryFee: o.carFee ?? 600, depositPct: 50 },
    ],
    fleet: fleet(o),
    recommended: { ...DEFAULT_CONTENT.recommended, enabled: true, items: PLACES },
  } as unknown as SiteContent;
  fx.view = {
    content,
    fleet: content.fleet.map((f) => ({ ...f, soldOutToday: false })),
    ratings: {},
    recentBookings: {},
    reviews: [],
    businessWhatsApp: "+23058355588",
  };
  fx.airport = o.airport === undefined ? SHEET : o.airport;
  return content;
}

// ── Reading what was rendered ───────────────────────────────────────────────

const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
/** The words a visitor (or a crawler that runs no script) reads. */
const visible = (html: string) =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<!-- -->/g, "")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
type Node = Record<string, unknown>;
/** Every JSON-LD node on the page, @graph or not. */
const ld = (html: string): Node[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const p = JSON.parse(m[1]) as Node;
    return (p["@graph"] as Node[] | undefined) ?? [p];
  });
const ofType = (nodes: Node[], t: string) => nodes.filter((n) => n["@type"] === t);
/** Every Rs amount, as a number. \s covers the U+202F fr-FR grouping. */
const rsFigures = (s: string) =>
  [...s.matchAll(/Rs\s?(\d(?:[\d,\s]*\d)?)/g)].map((m) => Number(m[1].replace(/\D/g, "")));

const browse = async () => import("@/app/browse/[category]/page");
async function renderBrowse(category: string) {
  const mod = await browse();
  return renderToStaticMarkup(
    (await mod.default({ params: Promise.resolve({ category }) })) as ReactElement,
  );
}
async function browseMeta(category: string) {
  const mod = await browse();
  return mod.generateMetadata({ params: Promise.resolve({ category }) });
}

beforeEach(() => {
  setView();
});

// ── /browse/getting-around (C1, C2, C5, C13) ────────────────────────────────

describe("/browse/getting-around", () => {
  it("quotes the from-prices the category pages show, and no other Rs figure", async () => {
    const t = visible(await renderBrowse("getting-around"));
    expect(t).toContain("A car is from Rs 1,899 a day and a scooter from Rs 799");
    // Every Rs amount on the page is the fleet's, the published scooter rate
    // (SCOOTER_RATES.threePlus) or the price sheet's.
    const allowed = new Set([1899, 799, 1131, 1464, 1797]);
    const figures = rsFigures(t);
    expect(figures.length).toBeGreaterThanOrEqual(5);
    expect(figures.filter((n) => !allowed.has(n))).toEqual([]);
  });

  it("follows the fleet when the owner reprices, instead of keeping a typed figure", async () => {
    setView({ swift: "Rs 1,799" });
    const t = visible(await renderBrowse("getting-around"));
    expect(t).toContain("A car is from Rs 1,799 a day");
    expect(t).not.toContain("1,899");
  });

  it("names no car price while cars are switched off", async () => {
    setView({ carsOn: false });
    const t = visible(await renderBrowse("getting-around"));
    expect(t).toContain("A scooter is from Rs 799 a day");
    expect(t).not.toMatch(/A car is from/);
  });

  it("gives the two-part taxi answer, zone fares read from the sheet", async () => {
    const t = visible(await renderBrowse("getting-around"));
    expect(t).toContain(
      "Airport transfers from Plaine Corail have fixed fares by zone, measured by road: Rs 1,131 up to 6 km, Rs 1,464 over 6 and under 13 km, and Rs 1,797 for 13 km and over, one way for one passenger in the daytime.",
    );
    expect(t).toContain("For any other ride, a driver quotes a fare and you accept it before anything is booked.");
    expect(t).toContain("Either way, you pay the driver.");
    expect(t).not.toMatch(/no fixed price/i);
  });

  it("says how many passengers the fare covers from the sheet, not from memory", async () => {
    setView({ airport: { ...SHEET, includedPassengers: 2 } });
    expect(visible(await renderBrowse("getting-around"))).toContain("one way for up to 2 passengers in the daytime");
  });

  it("names no fare at all when the price list cannot be read", async () => {
    setView({ airport: null });
    const t = visible(await renderBrowse("getting-around"));
    expect(t).toContain("fixed fares by zone, measured by road, listed on the airport transfers page");
    expect(rsFigures(t).filter((n) => ![1899, 799].includes(n))).toEqual([]);
  });

  it("links /transfers, and the French guide as the blog's twin — not this page's", async () => {
    const html = await renderBrowse("getting-around");
    expect(html).toContain('href="/transfers"');
    expect(html).toContain('href="/blog/how-to-get-around-rodrigues"');
    const fr = html.match(/<a[^>]*href="\/fr\/se-deplacer-a-rodrigues"[^>]*>([^<]*)<\/a>/);
    expect(fr?.[1]).toBe("Se déplacer à Rodrigues, le guide en français");
    expect(visible(html)).not.toContain("cette page en français");
  });
});

// ── /browse/car (C4, C5, C18, T13, T18) ─────────────────────────────────────

describe("/browse/car", () => {
  it("says who rents, from where and how to pay, from the contact line and the fee", async () => {
    const t = visible(await renderBrowse("car"));
    expect(t).toContain(
      "Roule Rodrigues rents cars from Baie Aux Huîtres on Rodrigues: once we confirm your dates, you pay online by bank transfer, MCB Juice or PayPal, or in cash in person when we agree it.",
    );
    // Cars carry a Rs 600 fee, so nothing about their delivery is free.
    expect(t).not.toMatch(/delivered free|delivery is free/i);
  });

  it("calls car delivery free only when its fee is 0 AND no car's note conditions it", async () => {
    // Fee 0, but the Swift's own note makes free delivery depend on the
    // length of the rental (C20): not free, on any surface.
    setView({ carFee: 0 });
    expect(visible(await renderBrowse("car"))).not.toMatch(/delivered free|delivery is free/i);
    setView({ carFee: 0, swift: "Rs 1899(Free delivery fee)" });
    expect(visible(await renderBrowse("car"))).toContain("Delivery is included either way.");
  });

  it("links the intro and the airport passage to /transfers", async () => {
    const html = await renderBrowse("car");
    const links = [...html.matchAll(/<a[^>]*href="\/transfers"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(links).toEqual(["airport transfer", "airport transfer"]);
    expect(visible(html)).toContain("Rather not drive on arrival? Book an airport transfer instead.");
  });

  it("prints what car hire costs, per model, from the helper the checkout prices with", async () => {
    const html = await renderBrowse("car");
    const t = visible(html);
    expect(html).toMatch(/<h2[^>]*>What car hire costs on Rodrigues<\/h2>/);
    const content = fx.view as { content: SiteContent };
    for (const [name, price] of [
      ["Suzuki Swift (Latest Gen)", SWIFT_PRICE],
      ["Toyota Hilux", "Rs 2,899"],
    ]) {
      const tiers = costTiers({ price, category: "car" }, content.content.vehicleCategories);
      const row = tiers.map((x) => `Rs ${x.rental.toLocaleString("en-US")}`).join(" ");
      expect(t).toContain(`${name} ${row}`);
    }
    expect(t).toContain("Suzuki Swift (Latest Gen) Rs 1,899 Rs 5,697 Rs 13,293");
    // The draft has no price, so no row.
    expect(t).not.toContain("New Cars");
  });

  it("keeps the table's prices on one line each, so four columns fit a phone", async () => {
    const html = await renderBrowse("car");
    const cells = [...html.matchAll(/<td class="([^"]*)">Rs /g)].map((m) => m[1]);
    expect(cells.length).toBe(6);
    expect(cells.every((c) => c.includes("whitespace-nowrap"))).toBe(true);
    expect(html).toMatch(/<div class="[^"]*overflow-x-auto[^"]*"><table/);
  });

  it("prints the security deposit as the owner wrote it, apart from the part-payment", async () => {
    const html = await renderBrowse("car");
    const deposit = (DEFAULT_CONTENT.faq?.items ?? []).find((f) => f.id === "deposit")!.answer;
    // Its own paragraph: run on after "the deposit is shown before you
    // confirm", Rs 5,000 read as the price of confirming a booking.
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => decode(m[1]));
    expect(paragraphs).toContain(deposit);
    const footnote = paragraphs.find((p) => p.startsWith("Rental only"))!;
    expect(footnote).toContain("part-payment that confirms your booking");
    expect(footnote).not.toContain("5,000");
  });

  it("answers the airport and mainland searches without naming anybody else", async () => {
    const html = await renderBrowse("car");
    const t = visible(html);
    expect(html).toMatch(/<h2[^>]*>Collecting your car at Plaine Corail airport<\/h2>/);
    expect(t).toContain(
      "We bring the car to Plaine Corail airport when you land, the same way we deliver it to a guest house. Delivery is Rs 600 either way.",
    );
    expect(t).toContain("we deliver the car to where you are staying the next day");
    expect(t).toContain(
      "Booking from Mauritius? Roule Rodrigues is on Rodrigues itself, in Baie Aux Huîtres, and delivers to Plaine Corail airport.",
    );
    expect(t).not.toMatch(/soleiro/i);
  });

  it("lists each model once, with its own page's url (T13)", async () => {
    const list = ofType(ld(await renderBrowse("car")), "ItemList")[0];
    expect(list.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Suzuki Swift (Latest Gen)", url: `${SITE_URL}/browse/car/suzuki-swift-latest-gen` },
      { "@type": "ListItem", position: 2, name: "Toyota Hilux", url: `${SITE_URL}/browse/car/toyota-hilux` },
    ]);
  });
});

// ── T18: the FAQPage answers are the words on the page ─────────────────────

describe("rental FAQ markup matches the visible answers (T18)", () => {
  const faqOf = (html: string) =>
    (ofType(ld(html), "FAQPage")[0].mainEntity as { name: string; acceptedAnswer: { text: string } }[]);

  for (const category of ["car", "scooter"]) {
    it(`/browse/${category}: every question and whole answer is in the HTML`, async () => {
      const html = await renderBrowse(category);
      const t = visible(html);
      const faq = faqOf(html);
      expect(faq.length).toBeGreaterThanOrEqual(5);
      for (const q of faq) {
        expect(t).toContain(q.name);
        expect(t).toContain(q.acceptedAnswer.text.replace(/\s+/g, " ").trim());
      }
    });
  }

  it("the insurance answer the audit measured is whole, inside a collapsed <details>", async () => {
    const html = await renderBrowse("car");
    const insurance = (DEFAULT_CONTENT.faq?.items ?? []).find((f) => f.id === "insurance")!.answer;
    const details = [...html.matchAll(/<details[\s\S]*?<\/details>/g)].map((m) => visible(m[0]));
    expect(details.some((d) => d.includes(insurance))).toBe(true);
    // Collapsed: no `open` attribute is served.
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  it("the vehicle page too", async () => {
    const mod = await import("@/app/browse/[category]/[vehicle]/page");
    const html = renderToStaticMarkup(
      (await mod.default({ params: Promise.resolve({ category: "car", vehicle: "toyota-hilux" }) })) as ReactElement,
    );
    const t = visible(html);
    for (const q of faqOf(html)) expect(t).toContain(q.acceptedAnswer.text.replace(/\s+/g, " ").trim());
  });
});

// ── /browse/scooter (C4, T13) ───────────────────────────────────────────────

describe("/browse/scooter", () => {
  it("lists the twin AVENIS units once, each model with its url", async () => {
    const list = ofType(ld(await renderBrowse("scooter")), "ItemList")[0];
    const items = list.itemListElement as { name: string; url: string }[];
    expect(items.map((i) => i.name)).toEqual(["BURGMAN 125cc", "AVENIS 125cc"]);
    expect(items.map((i) => i.url)).toEqual([
      `${SITE_URL}/browse/scooter/burgman-125cc`,
      `${SITE_URL}/browse/scooter/avenis-125cc`,
    ]);
  });

  it("says scooter delivery is free because its fee is 0, and prints no car table", async () => {
    const t = visible(await renderBrowse("scooter"));
    expect(t).toContain("with helmets and delivery to your guest house included");
    expect(t).toContain("Roule Rodrigues rents scooters from Baie Aux Huîtres on Rodrigues:");
    expect(t).not.toContain("What car hire costs");
  });
});

// ── Stays, activities, tours: the place graph (T2, T13) ─────────────────────

describe("the place listings' markup", () => {
  const priceOf = (n: Node) =>
    ((n.offers ?? n.makesOffer) as { price?: number } | undefined)?.price ?? null;

  it("activities: two named listings, priced from their notes, none of the four blank rows", async () => {
    const nodes = ld(await renderBrowse("activities"));
    const services = ofType(nodes, "Service");
    expect(services.map((s) => [s.name, priceOf(s)])).toEqual([
      ["Rituel Signature Harmony Spa (1 h 30)", 1999],
      ["Sunrise hike from Anse aux Anglais", 2500],
    ]);
    const list = ofType(nodes, "ItemList")[0].itemListElement as { name: string; url?: string }[];
    expect(list.map((i) => i.name)).toEqual(services.map((s) => s.name));
    expect(list.every((i) => i.url?.startsWith(`${SITE_URL}/`))).toBe(true);
    expect(new Set(list.map((i) => i.url)).size).toBe(list.length);
  });

  it("tours: Île aux Cocos carries its price although it has no deposit", async () => {
    const services = ofType(ld(await renderBrowse("tours")), "Service");
    expect(services.map((s) => [s.name, priceOf(s)])).toEqual([
      ["Île aux Cocos Excursion with Les Inséparables", 1999],
      ["Balade en mer", 700],
    ]);
  });

  it("the 'what it costs' sections quote the range on the cards, the blank row excluded", async () => {
    const stays = await renderBrowse("stays");
    const tours = await renderBrowse("tours");
    // The blank stay is Rs 500 in the fixture; it must not become "from".
    expect(visible(stays)).toContain("Nightly prices on this page start around Rs 1,000 and run to about Rs 2,990");
    // Typed, this said "Rs 700 to Rs 1,000" beside the Rs 1,999 Île aux Cocos card.
    expect(visible(tours)).toContain("Trips on this page run from about Rs 700 to Rs 1,999 per person");
    // Three note sections on each, cost first — then one more since the
    // architecture review of 2026-09-30: the "Where to go" links under the
    // stays (item 1) and the FAQ under the tours (item 2). Named, so a fourth
    // NOTE could not slip in under a bare count.
    const h2s = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => decode(m[1]));
    expect(h2s(stays)).toHaveLength(4);
    expect(h2s(stays)[3]).toBe("Where to go");
    expect(h2s(tours)).toHaveLength(4);
    expect(h2s(tours)[3]).toBe("Tours and boat trips — common questions");
    for (const html of [stays, tours]) expect(html.match(/<h2[ >]/g)?.length).toBe(4);
  });

  it("stays: Cathartica priced from its note, the blank row nowhere", async () => {
    const html = await renderBrowse("stays");
    const stays = ofType(ld(html), "LodgingBusiness");
    expect(stays.map((s) => [s.name, priceOf(s)])).toEqual([
      ["Lakaze Mama", 1000],
      ["Cathartica", 2990],
    ]);
    expect(ofType(ld(html), "ItemList")[0].numberOfItems).toBe(2);
  });
});

// ── Titles and descriptions (T5, T7, C19) ───────────────────────────────────

describe("category titles and descriptions", () => {
  const len = (s: unknown) => Array.from(String(s)).length;
  const EXPECT: Record<string, number | null> = {
    scooter: 799,
    car: 1899,
    stays: 1000,
    activities: 1999,
    tours: 700,
    "getting-around": null,
  };

  for (const [category, from] of Object.entries(EXPECT)) {
    it(`/browse/${category}: ≤60 / ≤155, and the price inside the snippet`, async () => {
      const m = await browseMeta(category);
      expect(len(m.title), String(m.title)).toBeLessThanOrEqual(60);
      expect(len(m.description), String(m.description)).toBeLessThanOrEqual(155);
      if (from) {
        expect(m.title).toContain(`from Rs ${from.toLocaleString("en-US")}`);
        expect(m.description).toContain(`From Rs ${from.toLocaleString("en-US")}.`);
      }
    });
  }

  it("still fits with five-figure prices everywhere", async () => {
    setView({ swift: "Rs 12,345" });
    const view = fx.view as { content: SiteContent; fleet: { price: string; category?: string }[] };
    for (const f of view.fleet) if (f.price) f.price = f.category === "car" ? "Rs 12,345" : "Rs 10,999";
    view.content.recommended.items = PLACES.map((p) => ({ ...p, priceNote: "Rs 11,000 per person", depositAmount: undefined })) as never;
    for (const category of Object.keys(EXPECT)) {
      const m = await browseMeta(category);
      expect(len(m.title), String(m.title)).toBeLessThanOrEqual(60);
      expect(len(m.description), String(m.description)).toBeLessThanOrEqual(155);
      // A scooter quotes the published rate (SCOOTER_RATES), whatever its
      // price box says; everything else follows the data.
      if (EXPECT[category])
        expect(m.description).toMatch(category === "scooter" ? /From Rs 799\.$/ : /From Rs 1\d,\d{3}\.$/);
    }
  });

  it("free delivery follows the fee: scooters yes, cars not", async () => {
    expect((await browseMeta("scooter")).description).toContain("delivered free to your guest house");
    expect((await browseMeta("car")).description).not.toMatch(/free/i);
  });

  it("/browse/activities no longer takes /experiences' title or promises kitesurfing", async () => {
    const m = await browseMeta("activities");
    expect(m.title).toBe("Activities in Rodrigues from Rs 1,999 | Roule Rodrigues");
    expect(String(m.title)).not.toMatch(/Things to Do/i);
    expect(m.description).not.toMatch(/kitesurf|snorkel|hiking|island tours/i);
    // Nothing else changed about the page's address: no redirect, no canonical elsewhere.
    expect(String(m.alternates?.canonical)).toBe(`${SITE_URL}/browse/activities`);
  });

  it("the nameless stay cannot become the stays page's 'from' price", async () => {
    expect((await browseMeta("stays")).title).toContain("from Rs 1,000");
  });
});

describe("the vehicle page (T5, C18)", () => {
  const vmod = () => import("@/app/browse/[category]/[vehicle]/page");

  it("title from vehicleMetaTitle, description main's vehicleMetaDescription", async () => {
    const m = await (await vmod()).generateMetadata({
      params: Promise.resolve({ category: "car", vehicle: "suzuki-swift-latest-gen" }),
    });
    expect(m.title).toBe("Suzuki Swift (Latest Gen) rental — Rs 1,899/day, Rodrigues");
    expect(m.title).toBe(vehicleMetaTitle("Suzuki Swift (Latest Gen)", "car", 1899));
    expect(m.description).toBe(
      vehicleMetaDescription({ name: "Suzuki Swift (Latest Gen)", from: 1899, specs: ["Automatic", "5 Seats"], included: ["Insurance"] }),
    );
  });

  it("prints the same three figures /browse/car prints for that model", async () => {
    const html = renderToStaticMarkup(
      (await (await vmod()).default({
        params: Promise.resolve({ category: "car", vehicle: "suzuki-swift-latest-gen" }),
      })) as ReactElement,
    );
    const t = visible(html);
    for (const f of ["1 day Rs 1,899", "3 days Rs 5,697", "1 week Rs 13,293"]) expect(t).toContain(f);
  });
});

// ── The French rental and stay pages (T2, C17, C20) ─────────────────────────

describe("the French pages", () => {
  const PAGES: Record<string, () => Promise<{ default: () => Promise<ReactElement> }>> = {
    "hebergement-rodrigues": () => import("@/app/fr/hebergement-rodrigues/page"),
    "location-voiture-rodrigues": () => import("@/app/fr/location-voiture-rodrigues/page"),
    "location-scooter-rodrigues": () => import("@/app/fr/location-scooter-rodrigues/page"),
  };
  const render = async (path: string) => renderToStaticMarkup(await (await PAGES[path]()).default());

  it("hébergement: priced from the notes, French descriptions, no blank row", async () => {
    const html = await render("hebergement-rodrigues");
    const stays = ofType(ld(html), "LodgingBusiness");
    expect(stays.map((s) => [s.name, (s.makesOffer as { price: number }).price, s.description])).toEqual([
      ["Lakaze Mama", 1000, "Une maison au bord de la mer."],
      // No French description: the English one rather than none.
      ["Cathartica", 2990, "Self-catering."],
    ]);
  });

  it("hébergement: the 'dès' price ignores the blank row", async () => {
    const mod = await import("@/app/fr/hebergement-rodrigues/page");
    // fr-FR groups with a narrow no-break space, as the page's own rs() does.
    expect((await mod.generateMetadata()).title).toBe(
      `Hébergement à Rodrigues dès Rs ${(1000).toLocaleString("fr-FR")}/nuit | Roule Rodrigues`,
    );
  });

  it("voiture: 'sans supplément de livraison' only when the car fee is 0", async () => {
    expect(visible(await render("location-voiture-rodrigues"))).not.toContain("sans supplément de livraison");
    // Fee 0 is not enough while the Swift's note conditions delivery (C20).
    setView({ carFee: 0 });
    expect(visible(await render("location-voiture-rodrigues"))).not.toContain("sans supplément de livraison");
    setView({ carFee: 0, swift: "Rs 1899(Free delivery fee)" });
    expect(visible(await render("location-voiture-rodrigues"))).toContain("sans supplément de livraison");
  });

  it("voiture: counts the cars that can be rented, not the draft", async () => {
    const nodes = ld(await render("location-voiture-rodrigues"));
    const offer = nodes.map((n) => n.offers as { offerCount?: number } | undefined).find((o) => o?.offerCount);
    expect(offer?.offerCount).toBe(2);
  });

  it("scooter: main's description, kept inside 155 characters", async () => {
    const mod = await import("@/app/fr/location-scooter-rodrigues/page");
    const d = String((await mod.generateMetadata()).description);
    expect(d).toBe(
      "Louez un scooter à Rodrigues dès Rs 799 par jour. Casque et assurance inclus, livraison à votre hôtel, sans durée minimale. Réservez en ligne.",
    );
  });

  for (const path of ["hebergement-rodrigues", "location-voiture-rodrigues", "location-scooter-rodrigues"]) {
    it(`${path}: the brand is written unaccented (C17)`, async () => {
      expect(visible(await render(path))).not.toContain("Roulé Rodrigues");
    });
  }
});

describe("the English category pages write the brand unaccented (C17)", () => {
  for (const category of ["car", "scooter", "stays", "activities", "tours", "getting-around"]) {
    it(`/browse/${category}`, async () => {
      expect(visible(await renderBrowse(category))).not.toContain("Roulé Rodrigues");
    });
  }
});
