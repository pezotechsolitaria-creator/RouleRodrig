import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecommendedPlace } from "@/lib/defaults";
import { GUIDE_FOR_PLACE, guidesForListing } from "@/lib/place-detail";
import { gettingThere } from "@/lib/experiences";

// ── EXPERIENCES ↔ GUIDES, AND HOW TO REACH THE MEETING POINT (architecture
// review 2026-09-30, item 3) ────────────────────────────────────────────────
//
// The real route — app/experiences/[type]/page.tsx — rendering both kinds of
// page it serves, against listings shaped like the live rows (read-only SELECT,
// 29 Sep 2026): the boat trip meeting at "Rivière Banane (1st Beach)", the
// sunrise hike whose price includes the transfer, the massage whose meeting
// point is the admin placeholder "Optional", Île aux Cocos with none set.

const fx = vi.hoisted(() => ({
  items: [] as unknown[],
  carsOn: true,
  carPrice: "Rs 1,888",
}));

vi.mock("@/lib/site-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/site-data")>()),
  getFleetView: async () => ({
    content: {
      recommended: { enabled: true, items: fx.items },
      branding: {},
      rideRoutes: [],
      events: [],
      vehicleCategories: [
        { id: "scooter", label: "Scooters", enabled: true },
        { id: "car", label: "Cars", enabled: fx.carsOn },
      ],
    },
    fleet: [
      { id: "s1", name: "Scooter", category: "scooter", price: "Rs 777" },
      { id: "c1", name: "Car", category: "car", price: fx.carPrice },
    ],
    businessWhatsApp: "+23058355588",
  }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode; className?: string }) =>
    createElement("a", { href: p.href, className: p.className }, p.children),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/experiences/PlaceBookingButton", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("@/components/experiences/ExperienceMarket", () => ({ default: () => null }));

const base = { category: "activity", image: "/x.jpg", description: "", bookable: true };
const BALADE = {
  ...base,
  id: "rec-balade",
  name: "Balade en mer",
  serviceType: "boat",
  priceNote: "Rs 717 per person",
  depositAmount: 717,
  meetingPoint: "Rivière Banane (1st Beach)",
};
const SUNRISE = {
  ...base,
  id: "rec-sunrise",
  name: "Sunrise hike from Anse aux Anglais",
  serviceType: "hiking",
  priceNote: "Rs 2,727 per person(Free transfer to starting point)",
  meetingPoint: "Anse aux Anglais Resto Parking",
  included: ["Transfer to starting point", "Local food bites"],
};
const RITUEL = {
  ...base,
  id: "rec-rituel",
  name: "Rituel test",
  serviceType: "massage",
  priceNote: "Rs 1,919 per person",
  meetingPoint: "Optional",
};
const COCOS = {
  ...base,
  id: "rec-cocos",
  name: "Île aux Cocos Excursion with Les Inséparables",
  isTour: true,
  priceNote: "Rs 1313/Person ",
};

beforeEach(() => {
  fx.items = [BALADE, SUNRISE, RITUEL, COCOS];
  fx.carsOn = true;
  fx.carPrice = "Rs 1,888";
});

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

async function page(type: string) {
  const mod = await import("@/app/experiences/[type]/page");
  return renderToStaticMarkup(
    (await mod.default({ params: Promise.resolve({ type }) })) as ReactElement,
  );
}

/** The hrefs inside the "Getting there" section, in order. */
function gettingThereLinks(html: string): string[] | null {
  const at = html.indexOf(">Getting there</h2>");
  if (at < 0) return null;
  return [...html.slice(at, html.indexOf("</section>", at)).matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
}

describe("an experience page says how to reach its meeting point", () => {
  it("the boat trip: where you meet, then a scooter, a car or the airport transfer", async () => {
    const html = await page("balade-en-mer");
    expect(text(html)).toContain(
      "You meet at Rivière Banane (1st Beach). Need wheels to get there, or coming straight from the airport?",
    );
    expect(gettingThereLinks(html)).toEqual(["/browse/scooter", "/browse/car", "/transfers"]);
    expect(text(html)).toContain("Rent a scooter");
    expect(text(html)).toContain("Rent a car");
  });

  it("offers only what can be rented today: no car while cars are switched off or unpriced", async () => {
    fx.carsOn = false;
    expect(gettingThereLinks(await page("balade-en-mer"))).toEqual(["/browse/scooter", "/transfers"]);
    fx.carsOn = true;
    fx.carPrice = "";
    expect(gettingThereLinks(await page("balade-en-mer"))).toEqual(["/browse/scooter", "/transfers"]);
  });

  it("says nothing about getting there when the price already includes the transfer", async () => {
    expect(gettingThereLinks(await page("sunrise-hike-from-anse-aux-anglais"))).toBeNull();
  });

  it("says nothing for a placeholder meeting point, or none at all", async () => {
    expect(gettingThereLinks(await page("rituel-test"))).toBeNull();
    expect(gettingThereLinks(await page("ile-aux-cocos-excursion-with-les-inseparables"))).toBeNull();
  });

  it("never on a chauffeur, the customer's own place, or a pick-up", () => {
    const wheels = [{ href: "/browse/scooter", noun: "scooter" }];
    expect(gettingThere({ serviceType: "chauffeur", meetingPoint: "Port Mathurin" }, wheels)).toBeNull();
    expect(gettingThere({ meetingPoint: "At your hotel" }, wheels)).toBeNull();
    expect(gettingThere({ meetingPoint: "Jetty", included: ["Hotel pick-up"] }, wheels)).toBeNull();
    expect(gettingThere({ meetingPoint: "Port Sud-Est jetty" }, wheels)).toEqual({
      meet: "Port Sud-Est jetty",
      wheels,
    });
  });
});

describe("experiences link the guide that genuinely covers them", () => {
  it("a hiking listing opens the hiking guide, described as the hiking guide", async () => {
    const html = await page("sunrise-hike-from-anse-aux-anglais");
    expect(html).toContain('href="/guide/hiking"');
    expect(text(html)).toContain("Read the hiking guide");
    expect(text(html)).toContain("The island's walking trails, with distance, climb, time and what to carry.");
    // Not the Île aux Cocos line, which describes a different page.
    expect(text(html)).not.toContain("what you will see");
  });

  it("Île aux Cocos keeps its own guide and its own line", async () => {
    const html = await page("ile-aux-cocos-excursion-with-les-inseparables");
    expect(html).toContain('href="/guide/ile-aux-cocos"');
    expect(text(html)).toContain("What it is, when to go and what you will see.");
  });

  it("the boat trip and the massage get no guide: none covers them", async () => {
    for (const slug of ["balade-en-mer", "rituel-test"]) {
      expect(await page(slug)).not.toMatch(/href="\/guide\//);
    }
  });

  it("goes by the owner's tag, and only while the row is an activity", () => {
    const p = (o: Partial<RecommendedPlace>) => ({ name: "x", ...o }) as RecommendedPlace;
    expect(GUIDE_FOR_PLACE(p({ name: "Hike the ridge" }))).toBeNull();
    expect(GUIDE_FOR_PLACE(p({ serviceType: "hiking", category: "hotel" }))).toBeNull();
    expect(GUIDE_FOR_PLACE(p({ serviceType: "hiking", category: "activity" }))?.href).toBe("/guide/hiking");
  });

  it("the hiking page links the hiking guide, with or without a guide listed", async () => {
    expect(await page("hiking")).toContain('href="/guide/hiking"');
    fx.items = [];
    expect(await page("hiking")).toContain('href="/guide/hiking"');
    expect(guidesForListing([], "hiking").map((g) => g.href)).toEqual(["/guide/hiking"]);
  });

  it("the sea-trips page links a place guide only for a listing it holds", async () => {
    expect(await page("boat")).not.toMatch(/href="\/guide\//);
    fx.items = [BALADE, { ...COCOS, serviceType: "boat" }];
    expect(await page("boat")).toContain('href="/guide/ile-aux-cocos"');
  });
});
