import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";

// ── THE VEHICLE PAGE, PER CATEGORY (architecture review 2026-09-30) ─────────
//
// Items 1-3 of the rentals-kind wave, read off what the real server component
// prints — not a grep of its source:
//
//   1. an EQUIPMENT category (a kayak) shows no licence, fuel, mileage, car
//      deposit or helmet, its FAQPage carries only what the panel renders, and
//      its schema node is a Product with the same rental Offer;
//   2. the page names its own category ("All kayaks", not "All scooters"), and
//      a vehicle in a PAUSED category is OutOfStock with no Book control;
//   3. twin units (two AVENIS rows, one URL): "Fully booked" only when every
//      twin is out, and the Book link names a free one.
//
// And the pin that makes all of it safe to ship: a category with no rentalKind
// (every live one) renders exactly what it rendered before.

const fx = vi.hoisted(() => ({ view: null as unknown }));

vi.mock("@/lib/site-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/site-data")>()),
  getFleetView: async () => fx.view,
}));
// Client chrome and Next internals the assertions are not about.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode; className?: string }) =>
    createElement("a", { href: p.href, className: p.className }, p.children),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
// VehicleActionBar is NOT mocked: its button is a Book link, and "no Book
// button" has to include the sticky one.

// The owner's live FAQ wording (site_content, 29 Sep 2026). DEFAULT_CONTENT's
// delivery question still says "the scooter", which is not what ships.
const LIVE_FAQ = [
  { id: "license", question: "Do I need a driving licence?", answer: "Yes — a valid driving licence matching your vehicle (car or motorcycle) is required, and you must bring it at pickup. An international permit is recommended if your licence is not in the Latin alphabet." },
  { id: "age", question: "What is the minimum age to rent?", answer: "You must be at least 18 years old and hold a valid licence to rent and drive." },
  { id: "helmet", question: "Do scooters come with a helmet?", answer: "Yes. For every scooter rental a helmet is included free for each rider, plus a second for a passenger — wearing one is mandatory by law on Rodrigues. Cars are delivered fully road-ready." },
  { id: "insurance", question: "Is insurance included?", answer: "Basic third-party insurance is included with every rental. Please drive responsibly and follow local road rules — full terms are shared at pickup." },
  { id: "delivery", question: "Can you deliver the vehicle to my hotel?", answer: "Yes — we can deliver to and collect from your hotel or guesthouse anywhere on the island. Just let us know your location when you book." },
  { id: "fuel", question: "What about fuel?", answer: "Your vehicle is delivered ready to go. We simply ask that you return it with a similar fuel level, or we settle the small difference." },
  { id: "breakdown", question: "What happens if the vehicle breaks down?", answer: "Call or WhatsApp us any time — we offer support and, if needed, a replacement vehicle so your trip is never interrupted." },
  { id: "deposit", question: "Do you take a deposit?", answer: "A security deposit of Rs 5,000 applies to car rentals. It is separate from the part-payment that confirms your booking online, and full terms are shared at pickup." },
  { id: "mileage", question: "Is there a mileage limit?", answer: "No. There is no mileage limit on our rentals, so you can drive as much of the island as you like." },
  { id: "faq-min-duration", question: "Is there a minimum rental duration?", answer: "No. You can rent for a single day if that is all you need. There is no three-day minimum and no long-stay requirement, so you can book exactly the dates you want." },
];

type Row = { id: string; name: string; price: string; category: string; available?: boolean; soldOutToday?: boolean };
const row = (o: Row) => ({
  badge: "",
  tagline: "",
  description: "",
  image: `/${o.id}.jpg`,
  unit: "/day",
  available: true,
  soldOutToday: false,
  specs: [],
  included: [],
  ...o,
});

function setView(
  o: {
    fleet?: Row[];
    carKind?: "motor" | "equipment";
    kayakKind?: "motor" | "equipment";
  } = {},
) {
  const fleet = (
    o.fleet ?? [
      { id: "burgman", name: "BURGMAN 125cc", price: "Rs 699(free delivery)", category: "scooter" },
      { id: "avenis-1", name: "AVENIS 125cc", price: "Rs 699", category: "scooter" },
      { id: "avenis-2", name: "AVENIS 125cc", price: "Rs 699", category: "scooter" },
      { id: "hilux", name: "Toyota Hilux", price: "Rs 2,899", category: "car" },
      { id: "kayak-1", name: "Sit-on-top Kayak", price: "Rs 800", category: "kayak" },
      { id: "cb", name: "Honda CB 125", price: "Rs 900", category: "motorbike" },
    ]
  ).map(row);
  const content = {
    ...DEFAULT_CONTENT,
    faq: { ...DEFAULT_CONTENT.faq, items: LIVE_FAQ },
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true, deliveryFee: 0 },
      { id: "car", label: "Cars", enabled: true, deliveryFee: 0, ...(o.carKind ? { rentalKind: o.carKind } : {}) },
      { id: "kayak", label: "Kayaks", enabled: true, rentalKind: o.kayakKind ?? "equipment" },
      // Paused, the way the owner paused Cars on 2026-09-09.
      { id: "motorbike", label: "Motorbikes", enabled: false },
    ],
    fleet,
  } as unknown as SiteContent;
  fx.view = {
    content,
    fleet,
    ratings: {},
    recentBookings: {},
    reviews: [],
    businessWhatsApp: "+23058355588",
  };
}

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** What a visitor reads: no script, no tags. */
const visible = (html: string) =>
  decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ");
type Node = Record<string, unknown>;
const ld = (html: string): Node[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const p = JSON.parse(m[1]) as Node;
    return (p["@graph"] as Node[] | undefined) ?? [p];
  });
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => decode(m[1]));
/** The links that land on the booking form with a vehicle chosen. */
const bookLinks = (html: string) => hrefs(html).filter((h) => h.includes("#booking"));

const page = () => import("@/app/browse/[category]/[vehicle]/page");
async function render(category: string, vehicle: string) {
  const mod = await page();
  return renderToStaticMarkup(
    (await mod.default({ params: Promise.resolve({ category, vehicle }) })) as ReactElement,
  );
}
const offerOf = (html: string) => {
  const node = ld(html).find((n) => (n.offers as Node | undefined)?.["@type"] === "Offer");
  return { node, offer: node?.offers as Node | undefined };
};

beforeEach(() => setView());

// ── 1. equipment ────────────────────────────────────────────────────────────

describe("a kayak page (rentalKind: equipment)", () => {
  it("shows no licence, fuel, mileage, car deposit, helmet or road rules", async () => {
    const t = visible(await render("kayak", "sit-on-top-kayak"));
    expect(t).not.toMatch(/licen[cs]e|fuel|mileage|Rs 5,000|helmet|road rules|third-party/i);
    // Nor any scooter wording, anywhere on the page.
    expect(t).not.toMatch(/scooter/i);
  });

  it("keeps the two terms that hold for equipment, whole, on the page", async () => {
    const t = visible(await render("kayak", "sit-on-top-kayak"));
    for (const id of ["delivery", "faq-min-duration"]) {
      const f = LIVE_FAQ.find((x) => x.id === id)!;
      expect(t).toContain(f.question);
      expect(t).toContain(f.answer);
    }
  });

  it("publishes an FAQPage of exactly those two questions, each one visible", async () => {
    const html = await render("kayak", "sit-on-top-kayak");
    const faq = ld(html).find((n) => n["@type"] === "FAQPage")!;
    const qs = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(qs.map((q) => q.name)).toEqual([
      "Can you deliver the vehicle to my hotel?",
      "Is there a minimum rental duration?",
    ]);
    const t = visible(html);
    for (const q of qs) {
      expect(t).toContain(q.name);
      expect(t).toContain(q.acceptedAnswer.text);
    }
  });

  it("is a Product, not a Car or Motorcycle, with the same per-day rental Offer", async () => {
    const { node, offer } = offerOf(await render("kayak", "sit-on-top-kayak"));
    expect(node?.["@type"]).toBe("Product");
    expect(offer).toMatchObject({
      price: 800,
      priceCurrency: "MUR",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      priceSpecification: { "@type": "UnitPriceSpecification", unitCode: "DAY", price: 800 },
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/browse/kayak/sit-on-top-kayak`,
    });
  });

  it("names its own category in the back link and the breadcrumb", async () => {
    const html = await render("kayak", "sit-on-top-kayak");
    expect(visible(html)).toContain("All kayaks");
    const crumbs = ld(html).find((n) => n["@type"] === "BreadcrumbList")!;
    const names = (crumbs.itemListElement as { name: string }[]).map((i) => i.name);
    expect(names).toEqual(["Home", "Kayaks", "Sit-on-top Kayak"]);
  });

  it("links the beaches, not the road routes", async () => {
    const links = hrefs(await render("kayak", "sit-on-top-kayak"));
    expect(links).toContain("/guide/beaches");
    expect(links).not.toContain("/guide/routes");
  });

  it("is still bookable, with the vehicle chosen", async () => {
    expect(bookLinks(await render("kayak", "sit-on-top-kayak"))).toEqual([
      "/browse/kayak?v=kayak-1#booking",
      "/browse/kayak?v=kayak-1#booking",
    ]);
  });
});

// ── 2. category-aware, and a paused category ────────────────────────────────

describe("a vehicle in a paused category", () => {
  it("tells Google it is out of stock", async () => {
    const { offer } = offerOf(await render("motorbike", "honda-cb-125"));
    expect(offer?.availability).toBe("https://schema.org/OutOfStock");
  });

  it("offers no Book control anywhere — inline or in the sticky bar", async () => {
    const html = await render("motorbike", "honda-cb-125");
    expect(bookLinks(html)).toEqual([]);
    expect(hrefs(html).some((h) => h.includes("?v="))).toBe(false);
    expect(visible(html)).not.toMatch(/Book the|Check dates/);
  });

  it("says it is not available, and gives the way out and a way to ask", async () => {
    const html = await render("motorbike", "honda-cb-125");
    const t = visible(html);
    expect(t).toContain("This Honda CB 125 is not available to rent at the moment.");
    expect(t).not.toContain("Fully booked");
    expect(t).toContain("See what else is available");
    expect(hrefs(html)).toContain("/browse/motorbike");
    expect(hrefs(html).some((h) => h.startsWith("https://wa.me/23058355588"))).toBe(true);
  });

  it("calls a motorbike a motorbike", async () => {
    const t = visible(await render("motorbike", "honda-cb-125"));
    expect(t).toContain("All motorbikes");
    expect(t).not.toMatch(/scooter/i);
  });

  it("goes back to bookable the moment the category is switched on", async () => {
    setView();
    const view = fx.view as { content: SiteContent };
    view.content.vehicleCategories.find((c) => c.id === "motorbike")!.enabled = true;
    const html = await render("motorbike", "honda-cb-125");
    expect(offerOf(html).offer?.availability).toBe("https://schema.org/InStock");
    expect(bookLinks(html)).toEqual([
      "/browse/motorbike?v=cb#booking",
      "/browse/motorbike?v=cb#booking",
    ]);
  });
});

// ── 3. twin units ───────────────────────────────────────────────────────────

describe("two AVENIS rows, one page", () => {
  const twins = (a: Partial<Row>, b: Partial<Row>) =>
    setView({
      fleet: [
        { id: "avenis-1", name: "AVENIS 125cc", price: "Rs 699", category: "scooter", ...a },
        { id: "avenis-2", name: "AVENIS 125cc", price: "Rs 699", category: "scooter", ...b },
      ],
    });

  it("is not 'fully booked' while the second unit is free, and books the free one", async () => {
    twins({ soldOutToday: true }, {});
    const html = await render("scooter", "avenis-125cc");
    expect(visible(html)).not.toContain("Fully booked");
    expect(bookLinks(html)).toEqual([
      "/browse/scooter?v=avenis-2#booking",
      "/browse/scooter?v=avenis-2#booking",
    ]);
    // The sticky bar offers "Book", not "Check dates".
    expect(visible(html)).not.toContain("Check dates");
  });

  it("finds the free twin from an old id link too", async () => {
    twins({ soldOutToday: true }, {});
    expect(bookLinks(await render("scooter", "avenis-1"))).toContain(
      "/browse/scooter?v=avenis-2#booking",
    );
  });

  it("says fully booked only when EVERY unit is out", async () => {
    twins({ soldOutToday: true }, { soldOutToday: true });
    const html = await render("scooter", "avenis-125cc");
    expect(visible(html)).toContain("Fully booked today");
    // Picking dates is still the right next step.
    expect(bookLinks(html)).toEqual([
      "/browse/scooter?v=avenis-1#booking",
      "/browse/scooter?v=avenis-1#booking",
    ]);
  });

  it("does not call the model withdrawn while one unit is still for hire", async () => {
    twins({ available: false }, {});
    const html = await render("scooter", "avenis-125cc");
    expect(visible(html)).not.toContain("not available to rent");
    expect(offerOf(html).offer?.availability).toBe("https://schema.org/InStock");
    expect(bookLinks(html)).toContain("/browse/scooter?v=avenis-2#booking");
  });

  it("keeps one canonical for both", async () => {
    twins({ soldOutToday: true }, {});
    const mod = await page();
    const m = await mod.generateMetadata({
      params: Promise.resolve({ category: "scooter", vehicle: "avenis-1" }),
    });
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/browse/scooter/avenis-125cc`);
  });
});

// ── the pin: no rentalKind is today's page ──────────────────────────────────

describe("a category with no rentalKind renders exactly as before", () => {
  it("is byte-for-byte the same page with rentalKind 'motor'", async () => {
    const before = await render("car", "toyota-hilux");
    setView({ carKind: "motor" });
    expect(await render("car", "toyota-hilux")).toBe(before);
  });

  it("the car page keeps its words, its terms and its Car node", async () => {
    const html = await render("car", "toyota-hilux");
    const t = visible(html);
    expect(t).toContain("All cars");
    expect(t).toContain("Do I need a driving licence?");
    expect(t).toContain("A security deposit of Rs 5,000 applies to car rentals.");
    expect(t).not.toContain("Do scooters come with a helmet?");
    expect(offerOf(html).node?.["@type"]).toBe("Car");
    expect(hrefs(html)).toContain("/blog/how-many-days-in-rodrigues");
  });

  it("the scooter page keeps its words, its terms and its Motorcycle node", async () => {
    const html = await render("scooter", "burgman-125cc");
    const t = visible(html);
    expect(t).toContain("All scooters");
    expect(t).toContain("Scooter routes");
    expect(t).toContain("Do scooters come with a helmet?");
    expect(t).not.toContain("Rs 5,000");
    expect(offerOf(html).node?.["@type"]).toBe("Motorcycle");
    const crumbs = ld(html).find((n) => n["@type"] === "BreadcrumbList")!;
    expect((crumbs.itemListElement as { name: string }[])[1].name).toBe("Scooters");
  });

  it("a kayak category marked 'motor' gets the motor terms back", async () => {
    // The kind, not the id, decides — so the switch is the owner's to flip.
    setView({ kayakKind: "motor" });
    expect(visible(await render("kayak", "sit-on-top-kayak"))).toContain(
      "Do I need a driving licence?",
    );
  });
});
