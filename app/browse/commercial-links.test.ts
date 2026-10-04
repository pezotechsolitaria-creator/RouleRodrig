import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";
import { IN_PERSON_SENTENCE } from "@/lib/experiences";
import { listingFaq, listingPlaces } from "@/lib/experiences-faq";
import { SITE_URL } from "@/lib/site";

// ── THE MONEY PAGES LINK BACK, AND THE TRIPS PAGES ANSWER (architecture
// review 2026-09-30, items 1 and 2) ─────────────────────────────────────────
//
// Rendered, not grepped: the real category page against a content row shaped
// like the live one — the harness of app/browse/browse-pages-render.test.ts.
//
//   1. /browse/scooter, /browse/car and /browse/stays end with a "Where to go"
//      block into the guides, BELOW the booking flow.
//   2. /browse/tours and /browse/activities carry a visible FAQ built from
//      their own cards, and FAQPage markup that says exactly what it says —
//      never the rental conditions those pages were cleared of.

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
  default: (p: { href: string; children?: ReactNode; className?: string }) =>
    createElement("a", { href: p.href, className: p.className }, p.children),
}));
vi.mock("@/components/nav/LangLink", () => ({
  default: (p: { href: string; children?: ReactNode }) => createElement("a", { href: p.href }, p.children),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/BrowseTabs", () => ({ default: () => null }));
vi.mock("@/components/TrustBar", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
vi.mock("@/components/Fleet", () => ({
  default: (p: { title: string }) => createElement("section", null, createElement("h1", null, p.title)),
}));
// The booking form, marked so the test can say what comes after it.
vi.mock("@/components/BookingSection", () => ({
  default: () => createElement("form", { id: "booking" }),
}));
vi.mock("@/components/RecommendedPlaces", () => ({
  default: (p: { content: { items: { id: string; name: string }[] } }) =>
    createElement("ul", { id: "cards" }, p.content.items.map((i) => createElement("li", { key: i.id }, i.name))),
}));

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

const place = (o: { id: string } & Record<string, unknown>) => ({ image: "/p.jpg", description: "", ...o });
// Figures deliberately not the live ones, so a remembered price cannot pass.
const PLACES = [
  place({ id: "rec-lakaze", category: "hotel", name: "Lakaze Mama", priceNote: "Rs 1,000 per night" }),
  place({ id: "rec-rituel", category: "activity", serviceType: "massage", name: "Rituel test", priceNote: "Rs 1,919 per person" }),
  place({ id: "rec-hike", category: "activity", serviceType: "hiking", name: "Sunrise test", priceNote: "Rs 2,727 per person" }),
  // Nameless, with a deposit: it renders nowhere, so it must not switch the
  // cash sentence on for the activities page.
  place({ id: "rec-ghost", category: "activity", serviceType: "hiking", name: " ", depositAmount: 300 }),
  place({ id: "rec-cocos", category: "activity", isTour: true, name: "Île aux Cocos Excursion with Les Inséparables", priceNote: "Rs 1313/Person " }),
  place({ id: "rec-balade", category: "activity", isTour: true, serviceType: "boat", name: "Balade test", priceNote: "Rs 717 per person", depositAmount: 717 }),
];

function setView(items: unknown[] = PLACES) {
  const content = {
    ...DEFAULT_CONTENT,
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true, deliveryFee: 0, depositPct: 25 },
      { id: "car", label: "Cars", enabled: true, deliveryFee: 600, depositPct: 50 },
    ],
    fleet: [
      vehicle("burgman", "BURGMAN 125cc", "Rs 777", "scooter"),
      vehicle("swift", "Suzuki Swift", "Rs 1,888", "car"),
    ],
    recommended: { ...DEFAULT_CONTENT.recommended, enabled: true, items },
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
const faqPages = (html: string) => ld(html).filter((n) => n["@type"] === "FAQPage");
/** The links inside the section headed `heading`, in order. */
function linksUnder(html: string, heading: string): string[] {
  const at = html.indexOf(`>${heading}</h2>`);
  if (at < 0) return [];
  const end = html.indexOf("</section>", at);
  return [...html.slice(at, end).matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
}

async function render(category: string) {
  const mod = await import("@/app/browse/[category]/page");
  return renderToStaticMarkup(
    (await mod.default({ params: Promise.resolve({ category }) })) as ReactElement,
  );
}

// ── 1. Where to go ──────────────────────────────────────────────────────────

describe("the rental pages hand a renter on to the guides (item 1)", () => {
  for (const category of ["scooter", "car"]) {
    it(`/browse/${category}: routes, beaches, viewpoints and the map`, async () => {
      const html = await render(category);
      expect(linksUnder(html, "Where to go")).toEqual([
        "/guide/routes",
        "/guide/beaches",
        "/guide/viewpoints",
        "/map",
      ]);
    });

    it(`/browse/${category}: below the booking form, never above it`, async () => {
      const html = await render(category);
      const form = html.indexOf('<form id="booking">');
      const block = html.indexOf(">Where to go</h2>");
      expect(form).toBeGreaterThan(-1);
      expect(block).toBeGreaterThan(form);
      // The last section on the page: after the cost table and airport
      // passage on the car page too.
      expect(html.slice(block)).not.toMatch(/<h2/);
    });
  }

  it("each link is a 44px target", async () => {
    const html = await render("scooter");
    const at = html.indexOf(">Where to go</h2>");
    const classes = [...html.slice(at, html.indexOf("</section>", at)).matchAll(/<a href="[^"]+" class="([^"]*)"/g)].map((m) => m[1]);
    expect(classes).toHaveLength(4);
    for (const c of classes) expect(c).toContain("min-h-11");
  });

  it("/browse/stays: the island guide and the beaches, after the listings and notes", async () => {
    const html = await render("stays");
    expect(linksUnder(html, "Where to go")).toEqual(["/guide/rodrigues", "/guide/beaches"]);
    expect(html.indexOf(">Where to go</h2>")).toBeGreaterThan(html.indexOf('<ul id="cards">'));
    // Stays get no FAQ: that needs the owner's wording, never the rental one.
    expect(faqPages(html)).toEqual([]);
  });

  it("the tours and activities pages carry no Where to go block", async () => {
    for (const c of ["tours", "activities"]) expect(linksUnder(await render(c), "Where to go")).toEqual([]);
  });

  it("types no count and no price into a label", async () => {
    for (const c of ["scooter", "car", "stays"]) {
      const html = await render(c);
      const at = html.indexOf(">Where to go</h2>");
      const labels = visible(html.slice(at, html.indexOf("</section>", at)));
      expect(labels).not.toMatch(/\d/);
    }
  });
});

// ── 2. The trips and activities FAQ ─────────────────────────────────────────

describe("/browse/tours answers from its own cards (item 2)", () => {
  it("shows the questions and publishes exactly those, word for word", async () => {
    const html = await render("tours");
    const t = visible(html);
    const pages = faqPages(html);
    expect(pages).toHaveLength(1);
    expect(pages[0]["@id"]).toBe(`${SITE_URL}/browse/tours#faq`);
    const qa = pages[0].mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(qa.map((q) => q.name)).toEqual([
      "How much does an experience cost?",
      "Do I pay straight away when I book?",
      "Can I visit Île aux Cocos?",
    ]);
    for (const q of qa) {
      expect(t).toContain(q.name);
      expect(t).toContain(q.acceptedAnswer.text);
    }
    expect(t).toContain("Tours and boat trips — common questions");
  });

  it("prices the range off the cards on this page, naming each end", async () => {
    const t = visible(await render("tours"));
    expect(t).toContain(
      "from Rs 717 (Balade test) to Rs 1,313 (Île aux Cocos Excursion with Les Inséparables)",
    );
    // Nothing from the activities page leaks in.
    expect(t).not.toContain("2,727");
  });

  it("offers cash because a trip here has an amount the form can take", async () => {
    expect(visible(await render("tours"))).toContain(IN_PERSON_SENTENCE);
  });

  it("is never the rental conditions, the hub's head question or its therapists answer", async () => {
    const html = await render("tours");
    expect(visible(html)).not.toMatch(/licen[cs]e|minimum age|insurance|therapist/i);
    const names = (faqPages(html)[0].mainEntity as { name: string }[]).map((q) => q.name);
    expect(names).not.toContain("What is there to do on Rodrigues?");
    expect(names).not.toContain("Who runs the trips?");
  });

  it("asks about Île aux Cocos only while the excursion is on the page", async () => {
    setView(PLACES.filter((p) => p.id !== "rec-cocos"));
    const names = (faqPages(await render("tours"))[0].mainEntity as { name: string }[]).map((q) => q.name);
    expect(names).not.toContain("Can I visit Île aux Cocos?");
  });
});

describe("/browse/activities answers from its own cards (item 2)", () => {
  it("prices its own two listings, with no cash sentence and no Cocos question", async () => {
    const html = await render("activities");
    const t = visible(html);
    expect(t).toContain("from Rs 1,919 (Rituel test) to Rs 2,727 (Sunrise test)");
    // Neither named activity has an amount to take; the nameless row that
    // does renders nowhere and must not count.
    expect(t).not.toContain(IN_PERSON_SENTENCE);
    const names = (faqPages(html)[0].mainEntity as { name: string }[]).map((q) => q.name);
    expect(names).toEqual(["How much does an experience cost?", "Do I pay straight away when I book?"]);
    expect(t).toContain("Activities in Rodrigues — common questions");
  });

  it("says one price as one price when one listing is priced", () => {
    const faq = listingFaq("en", {
      places: listingPlaces([{ name: "Solo", priceNote: "Rs 900 per person" }, { name: "Unpriced" }]),
      cocosListed: false,
    });
    expect(faq[0].answer).toContain("— Rs 900 (Solo).");
    expect(faq[0].answer).not.toMatch(/from Rs 900.*to Rs 900/);
  });

  it("leaves the cost question out when nothing is priced", () => {
    const faq = listingFaq("en", { places: listingPlaces([{ name: "x" }]), cocosListed: false });
    expect(faq.map((f) => f.question)).toEqual(["Do I pay straight away when I book?"]);
  });

  it("has the same questions in French, and Kreol reads the French", () => {
    const input = { places: listingPlaces([{ name: "Balade", priceNote: "Rs 717", depositAmount: 717 }]), cocosListed: true };
    const fr = listingFaq("fr", input);
    expect(fr.map((f) => f.question)).toEqual([
      "Combien coûte une activité ?",
      "Faut-il payer immédiatement à la réservation ?",
      "Peut-on visiter l'Île aux Cocos ?",
    ]);
    expect(fr[1].answer).toContain("payer sur place, en espèces");
    expect(listingFaq("cr", input)).toEqual(fr);
  });
});
