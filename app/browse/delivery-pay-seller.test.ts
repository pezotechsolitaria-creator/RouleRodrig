import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";
import { STAY_PAY } from "@/lib/browse-copy";
import { SITE_URL } from "@/lib/site";

// ── WHAT THE REVIEW OF THE 2026-09-29 SEO WORK FOUND, RENDERED ─────────────
//
// Six confirmed findings on the /browse and /fr rental and stay pages, each
// pinned against what the real server components print — not a grep of their
// source, which would match the comment explaining the fix:
//
//   C20  "free" car delivery beside the Swift's own conditional note
//   T9   #business pointed at, never defined, on tours / activities / FR car
//   C19  the activities <h1> still said /experiences' "Things to Do"
//   C4   /browse/stays and its French FAQ said nothing about paying in cash
//   C4   the who/where/pay sentence repeated the delivery, after the CTA
//
// Same harness shape as app/browse/browse-pages-render.test.ts: the data read
// is replaced, the client chrome is inert, the page code is real.

const fx = vi.hoisted(() => ({ view: null as unknown }));

vi.mock("@/lib/site-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/site-data")>()),
  getFleetView: async () => fx.view,
}));
vi.mock("@/lib/rides/fares", () => ({
  readTransferFares: async () => ({ airport: null, ferry: null }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode }) => createElement("a", { href: p.href }, p.children),
}));
vi.mock("@/components/nav/LangLink", () => ({
  default: (p: { href: string; children?: ReactNode }) => createElement("a", { href: p.href }, p.children),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/BrowseTabs", () => ({ default: () => null }));
vi.mock("@/components/TrustBar", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/PageLanguage", () => ({ default: () => null }));
vi.mock("@/components/nav/HubBacklink", () => ({ default: () => null }));
vi.mock("@/components/BookingSection", () => ({ default: () => null }));
// The fleet grid: its heading, its one-sentence subline, and the intro
// paragraph it is handed (rendered below the cards).
vi.mock("@/components/Fleet", () => ({
  default: (p: { title: string; subtitle?: ReactNode; intro?: ReactNode }) =>
    createElement(
      "section",
      null,
      createElement("h1", null, p.title),
      createElement("p", { id: "subline" }, p.subtitle),
      createElement("p", { id: "intro" }, p.intro),
    ),
}));
// The listing grid: the <h1> it is handed (titleAs="h1"), its French twin as
// an attribute, and the names.
vi.mock("@/components/RecommendedPlaces", () => ({
  default: (p: { content: { title: string; titleFr?: string; items: { id: string; name: string }[] } }) =>
    createElement(
      "section",
      null,
      createElement("h1", { "data-fr": p.content.titleFr }, p.content.title),
      createElement("ul", null, p.content.items.map((i) => createElement("li", { key: i.id }, i.name))),
    ),
}));

// ── The fixture: the live shape where it matters ────────────────────────────

const SWIFT = "Rs 1899(Book for more than 2 days to get free delivery!!)";

const vehicle = (id: string, name: string, price: string, category: string) => ({
  id,
  name,
  price,
  category,
  badge: "",
  tagline: "",
  description: "",
  image: `/${id}.jpg`,
  unit: "/day",
  available: true,
  specs: ["Automatic"],
  included: ["Insurance"],
});

const place = (o: Record<string, unknown>) => ({ image: "/p.jpg", description: "", ...o });
const PLACES = [
  place({ id: "rec-lakaze", category: "hotel", name: "Lakaze Mama", priceNote: "Rs 1,000 per night" }),
  place({ id: "rec-rituel", category: "activity", name: "Rituel Signature Harmony Spa (1 h 30)", priceNote: "Rs 1999 per person" }),
  place({ id: "rec-cocos", category: "activity", isTour: true, name: "Île aux Cocos Excursion with Les Inséparables", priceNote: "Rs 1999/Person " }),
  place({ id: "rec-balade", category: "activity", isTour: true, name: "Balade en mer", priceNote: "Rs 700 per person", depositAmount: 700 }),
];

/** Live, 30 Sept: car delivery fee 0, the Swift's conditional note, the other
 *  cars "(Free delivery fee)", scooters "(free delivery)". */
function setView(o: { carFee?: number; swift?: string } = {}) {
  const content = {
    ...DEFAULT_CONTENT,
    contact: { ...DEFAULT_CONTENT.contact, location: "Baie Aux Huîtres,Rodrigues" },
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true, deliveryFee: 0, depositPct: 25 },
      { id: "car", label: "Cars", enabled: true, deliveryFee: o.carFee ?? 0, depositPct: 50 },
    ],
    fleet: [
      vehicle("burgman", "BURGMAN 125cc", "Rs 699(free delivery)", "scooter"),
      vehicle("avenis", "AVENIS 125cc", "Rs 699", "scooter"),
      vehicle("swift", "Suzuki Swift (Latest Gen)", o.swift ?? SWIFT, "car"),
      vehicle("hilux", "Toyota Hilux", "Rs 2,899(Free delivery fee)", "car"),
      vehicle("draft", "New Cars", "", "car"),
    ],
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
}

beforeEach(() => setView());

// ── Reading what was rendered ───────────────────────────────────────────────

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const visible = (html: string) =>
  decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
type Node = Record<string, unknown>;
const ld = (html: string): Node[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const p = JSON.parse(m[1]) as Node;
    return (p["@graph"] as Node[] | undefined) ?? [p];
  });
/** The intro paragraph the fleet grid was handed, as text. */
const intro = (html: string) => visible(html.match(/<p id="intro">([\s\S]*?)<\/p>/)?.[1] ?? "");

async function renderBrowse(category: string) {
  const mod = await import("@/app/browse/[category]/page");
  return renderToStaticMarkup((await mod.default({ params: Promise.resolve({ category }) })) as ReactElement);
}
async function browseDescription(category: string) {
  const mod = await import("@/app/browse/[category]/page");
  return String((await mod.generateMetadata({ params: Promise.resolve({ category }) })).description);
}
async function renderFr(path: "location-voiture-rodrigues" | "hebergement-rodrigues") {
  const mod =
    path === "location-voiture-rodrigues"
      ? await import("@/app/fr/location-voiture-rodrigues/page")
      : await import("@/app/fr/hebergement-rodrigues/page");
  return renderToStaticMarkup(await mod.default());
}

const FREE = /delivered free|delivery is free|free either way/i;

// ── C20: ONE ANSWER TO "IS CAR DELIVERY FREE?" ──────────────────────────────

describe("car delivery is called free only when the owner's notes agree (C20)", () => {
  it("live shape — fee 0, the Swift's conditional note — no page and no snippet says free", async () => {
    const car = await renderBrowse("car");
    expect(visible(car)).not.toMatch(FREE);
    // The airport passage keeps its facts and drops only the charge.
    expect(visible(car)).toContain(
      "We bring the car to Plaine Corail airport when you land, the same way we deliver it to a guest house.",
    );
    expect(await browseDescription("car")).not.toMatch(/free/i);
    expect(visible(await renderFr("location-voiture-rodrigues"))).not.toContain("sans supplément de livraison");
  });

  it("once the Swift's note is unconditional, every surface says free together", async () => {
    setView({ swift: "Rs 1899(Free delivery fee)" });
    expect(visible(await renderBrowse("car"))).toContain("Delivery is included either way.");
    expect(await browseDescription("car")).toContain("delivered free to your guest house");
    expect(visible(await renderFr("location-voiture-rodrigues"))).toContain("sans supplément de livraison");
  });

  it("a car fee is stated, never called free", async () => {
    setView({ carFee: 600, swift: "Rs 1899(Free delivery fee)" });
    const t = visible(await renderBrowse("car"));
    expect(t).toContain("Delivery is Rs 600 either way.");
    expect(t).not.toMatch(FREE);
  });
});

// ── C4 / presentation: the who-where-pay sentence inside the intro ──────────

describe("the who / where / pay sentence sits in the intro, before the call to action", () => {
  it("/browse/scooter: says delivery is included once, then who and how to pay, then what to do", async () => {
    const html = await renderBrowse("scooter");
    const p = intro(html);
    expect(p).toContain(
      "We hand over in person, with real advice on the roads and the places worth riding to. Roule Rodrigues rents scooters from Baie Aux Huîtres on Rodrigues: once we confirm your dates, you pay online by bank transfer, MCB Juice or PayPal, or in cash in person when we agree it. Pick a scooter below and book your dates online.",
    );
    expect(p.match(/delivery to your guest house included/g)).toHaveLength(1);
    expect(visible(html)).not.toContain("delivered free");
    expect(visible(html)).not.toContain("to where you are staying");
  });

  it("/browse/car: the same sentence, before its call to action", async () => {
    const p = intro(await renderBrowse("car"));
    expect(p).toContain(
      "Book an airport transfer instead. Roule Rodrigues rents cars from Baie Aux Huîtres on Rodrigues: once we confirm your dates, you pay online by bank transfer, MCB Juice or PayPal, or in cash in person when we agree it. Choose a car below and book your dates online.",
    );
  });
});

// ── T9: every #business pointer has its node on the same page ──────────────

describe("the seller every node points at is defined on the page that points (T9)", () => {
  const BUSINESS = `${SITE_URL}/#business`;
  /** Every object in the markup that is only a pointer to #business. */
  const pointers = (v: unknown): number =>
    Array.isArray(v)
      ? v.reduce<number>((n, x) => n + pointers(x), 0)
      : v && typeof v === "object"
        ? (Object.keys(v).length === 1 && (v as Node)["@id"] === BUSINESS ? 1 : 0) +
          Object.values(v).reduce<number>((n, x) => n + pointers(x), 0)
        : 0;
  const defined = (nodes: Node[]) =>
    nodes.filter((n) => n["@id"] === BUSINESS && n["@type"] && n.name === "Roule Rodrigues");

  const PAGES: Record<string, () => Promise<string>> = {
    "/browse/tours": () => renderBrowse("tours"),
    "/browse/activities": () => renderBrowse("activities"),
    "/fr/location-voiture-rodrigues": () => renderFr("location-voiture-rodrigues"),
  };

  for (const [path, render] of Object.entries(PAGES)) {
    it(`${path}: points at #business, and defines it once`, async () => {
      const nodes = ld(await render());
      expect(pointers(nodes)).toBeGreaterThan(0);
      expect(defined(nodes)).toHaveLength(1);
    });
  }

  it("/browse/stays: nothing points at the seller, so no AutoRental node is added", async () => {
    const nodes = ld(await renderBrowse("stays"));
    expect(pointers(nodes)).toBe(0);
    expect(nodes.filter((n) => n["@type"] === "AutoRental")).toEqual([]);
  });
});

// ── C19: the activities <h1> matches its retitle ────────────────────────────

describe("/browse/activities no longer heads itself with /experiences' term (C19)", () => {
  it("the <h1> says what the page is, in both languages", async () => {
    const html = await renderBrowse("activities");
    const h1 = html.match(/<h1 data-fr="([^"]*)">([^<]*)<\/h1>/);
    expect(h1?.[2]).toBe("Activities in Rodrigues");
    expect(decode(h1?.[1] ?? "")).toBe("Activités à Rodrigues");
    expect(visible(html)).not.toMatch(/Things to Do/i);
  });
});

// ── C4: how a stay is paid, cash included ───────────────────────────────────

describe("the stay pages say how to pay (C4)", () => {
  it("/browse/stays: the pay sentence, cash as a request, still three sections", async () => {
    const html = await renderBrowse("stays");
    const t = visible(html);
    expect(t).toContain(STAY_PAY.en);
    expect(t).toContain("You can also ask to pay in person, in cash");
    // Three note sections — the pay sentence did not become a fourth — and,
    // since the architecture review of 2026-09-30 (item 1), the "Where to go"
    // links after them, the page's last h2.
    const h2s = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => decode(m[1]));
    expect(h2s).toHaveLength(4);
    expect(h2s[3]).toBe("Where to go");
  });

  it("/fr/hebergement-rodrigues: the 'Paie-t-on' answer offers cash, visibly and in its FAQPage", async () => {
    const html = await renderFr("hebergement-rodrigues");
    const cash = "Vous pouvez aussi demander à payer sur place, en espèces";
    expect(visible(html)).toContain(cash);
    const faq = ld(html).find((n) => n["@type"] === "FAQPage");
    const answer = (faq?.mainEntity as { name: string; acceptedAnswer: { text: string } }[]).find((q) =>
      q.name.startsWith("Paie-t-on"),
    );
    expect(answer?.acceptedAnswer.text).toContain(cash);
  });
});
