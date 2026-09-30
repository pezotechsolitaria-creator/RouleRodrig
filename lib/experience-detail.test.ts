import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecommendedPlace } from "@/lib/defaults";
import {
  EXPERIENCES,
  experienceFaq,
  howBookingWorks,
  IN_PERSON_SENTENCE,
  placeFacts,
} from "./experiences";

// ── EXPERIENCE PAGES: WHAT THEY SAY, WHAT THEY PUBLISH ──────────────────────
// SEO audit 2026-09-29: C6 (thin detail pages, "What it includes" holding
// what to bring), T6 (meta descriptions sliced at 155), T7 (the category price
// cut off the snippet), T13 (the Experiences crumb), C16/T4 (an empty vertical
// indexed as a soft 404), C2 (the taxi "fixed fare").
//
// The fixtures are shaped like the live rows (read-only SELECT, 29 Sep 2026):
// the placeholder "Optional" meeting point, a capacity of 1 beside maxGuests 8,
// depositAmount set on three listings and absent on the rest.

const fixtures = vi.hoisted(() => {
  const base = { id: "", category: "activity", image: "/x.jpg", bookable: true } as const;
  const items = [
    {
      ...base,
      id: "rec-cocos",
      name: "Île aux Cocos Excursion with Les Inséparables",
      priceNote: "Rs 1999/Person ",
      capacity: 36,
      description:
        "🏝️ Excursion à l'Île aux Coco – 1 999 Rs par personne\n\nLe prix comprend :\n\n* Transport en bateau\n* Ticket d'entrée sur l'île\n* Repas\n* Boissons\n* Guide sur l'île\n* Visite du musée\n\nDépart : Pointe du Diable à 9h00",
    },
    {
      ...base,
      id: "rec-balade",
      name: "Balade en mer",
      serviceType: "boat",
      priceNote: "Rs 700 per person",
      depositAmount: 700,
      providerName: "Skipper Arnaud",
      meetingPoint: "Rivière Banane (1st Beach)",
      maxGuests: 8,
      capacity: 8,
      included: ["Boat"],
      highlights: ["Bring a hat and Sunglasses"],
      description: "",
    },
    {
      ...base,
      id: "rec-plongee",
      name: "Plongée en apnée/Aquarium Rivière Banane",
      serviceType: "boat",
      priceNote: "Rs 1000 per person",
      depositAmount: 1000,
      providerName: "Captain Arnaud",
      maxGuests: 10,
      capacity: 10,
      highlights: ["Clear waters", "colourful fish", "coral and amazing marine life"],
      description: "Free equipment",
    },
    {
      ...base,
      id: "rec-rituel",
      name: "Rituel Signature Harmony Spa (1 h 30)",
      serviceType: "massage",
      priceNote: "Rs 1999 per person",
      providerName: "Therapist Maryanne",
      meetingPoint: "Optional",
      durationMinutes: 90,
      capacity: 4,
      languages: ["English", "French", "Kreol"],
      included: ["Oils", "towels and Consultation"],
      description: "A signature ritual.",
    },
    {
      ...base,
      id: "rec-sunrise",
      name: "Sunrise hike from Anse aux Anglais",
      serviceType: "hiking",
      priceNote: "Rs 2,500 per person(Free transfer to starting point)",
      providerName: "Filine",
      meetingPoint: "Anse aux Anglais Resto Parking",
      durationMinutes: 240,
      maxGuests: 8,
      capacity: 1,
      languages: ["English", "French", "Creole"],
      included: ["Transfer to starting point", "Local food bites(gato coco/gato patate)"],
      highlights: ["Bring a hat", "water bottle"],
      description: "📍 Start: Anse aux Anglais\n📍 Finish: Mourouk",
    },
  ];
  // Flipped by the failed-read test: getContent() never throws on a failed
  // read, it answers DEFAULT_CONTENT, and that is what reaches the page.
  return { items, fellBack: false };
});

vi.mock("@/lib/site-data", () => ({
  getFleetView: async () => ({
    content: fixtures.fellBack
      ? (await import("@/lib/defaults")).DEFAULT_CONTENT
      : {
          recommended: { enabled: true, items: fixtures.items },
          branding: {},
          rideRoutes: [],
          events: [],
        },
    businessWhatsApp: "+23058355588",
  }),
}));
// Client components and Next internals: not what these tests are about, and
// they need a browser or a router. Replaced with inert stand-ins.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) =>
    createElement("a", { href, className }, children as never),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/experiences/PlaceBookingButton", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/BackLink", () => ({ default: () => null }));
vi.mock("@/components/experiences/ExperienceMarket", () => ({ default: () => null }));

const place = (name: string) =>
  fixtures.items.find((p) => p.name.startsWith(name)) as unknown as RecommendedPlace;

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const ldOf = (html: string) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return JSON.parse(m![1]) as { "@graph": Record<string, unknown>[] };
};

describe("placeFacts — one line per field the owner filled in (C6)", () => {
  it("states who, where, how long, how many and which languages", () => {
    expect(placeFacts(place("Sunrise"))).toEqual([
      "With Filine",
      "Meet at Anse aux Anglais Resto Parking",
      "Duration 4h",
      // maxGuests (8), not capacity (1): the page used to say "Up to 1 people".
      "Up to 8 people",
      "Guided in English, French and Creole",
    ]);
  });

  it("skips a placeholder typed into the meeting point", () => {
    const facts = placeFacts(place("Rituel"));
    expect(facts.join(" | ")).not.toMatch(/Optional/);
    expect(facts).toContain("Duration 1h 30");
    // A therapist speaks a language; she does not guide in it.
    expect(facts).toContain("Speaks English, French and Kreol");
  });

  it("prints nothing for a field that is empty", () => {
    expect(placeFacts({})).toEqual([]);
    expect(placeFacts({ capacity: 1 })).toEqual(["For one person"]);
  });
});

describe("how booking works, and the pay answer (C4, C6)", () => {
  it("offers the cash request only where there is an amount to charge", () => {
    expect(howBookingWorks("Skipper Arnaud", true).join(" ")).toContain(IN_PERSON_SENTENCE);
    const unpriced = howBookingWorks("Filine", false).join(" ");
    expect(unpriced).not.toMatch(/pay/i);
    expect(unpriced).toContain("Filine");
  });

  it("words cash as a request, never a promise", () => {
    expect(IN_PERSON_SENTENCE).toMatch(/ask to pay in person, in cash/);
    expect(IN_PERSON_SENTENCE).toMatch(/whether you can/);
  });

  it("the category FAQ mentions cash only when a listing there can be paid online", () => {
    const pay = (items: object[]) =>
      experienceFaq(EXPERIENCES.boat, items as never).find((f) => /before it is confirmed/.test(f.q))!.a;
    expect(pay([place("Balade")])).toContain(IN_PERSON_SENTENCE);
    expect(pay([place("Rituel")])).not.toContain(IN_PERSON_SENTENCE);
    expect(pay([place("Balade")])).toMatch(/only once it is confirmed/);
  });
});

describe("the chauffeur empty state tells the two-part taxi truth (C2)", () => {
  it("no longer says a taxi goes anywhere for a fixed fare", () => {
    const body = EXPERIENCES.chauffeur.emptyBody;
    expect(body).not.toMatch(/anywhere on the island for a fixed fare/);
    expect(body).toMatch(/airport transfers have fixed fares by zone/);
    expect(body).toMatch(/driver quotes a fare that you accept before anything is booked/);
  });
});

describe("the detail page renders what the listing holds (C6)", async () => {
  const { default: PlaceDetail } = await import("@/app/experiences/[type]/PlaceDetail");
  const render = (p: RecommendedPlace) =>
    renderToStaticMarkup(createElement(PlaceDetail, { place: p, businessWhatsApp: "+230" }) as ReactElement);

  it("shows what is included under its own heading, and the bring-list as Good to know", () => {
    const html = render(place("Sunrise"));
    const t = text(html);
    expect(t).toContain("What's included");
    expect(t).toContain("Transfer to starting point");
    expect(t).toContain("Good to know");
    expect(t).toContain("Bring a hat");
    expect(t).not.toContain("What it includes");
  });

  it("server-renders the facts", () => {
    const t = text(render(place("Sunrise")));
    for (const f of placeFacts(place("Sunrise"))) expect(t).toContain(f);
  });

  it("explains booking, with cash only where the form offers it, and links the refund policy", () => {
    const priced = render(place("Balade"));
    expect(text(priced)).toContain("How booking works");
    expect(text(priced)).toContain("We check the date with Skipper Arnaud.");
    expect(text(priced)).toContain(IN_PERSON_SENTENCE);
    expect(priced).toContain('href="/legal/refunds"');
    expect(text(render(place("Sunrise")))).not.toContain(IN_PERSON_SENTENCE);
  });

  it("publishes the operator and duration the category page publishes (T1, C6)", () => {
    const graph = ldOf(render(place("Rituel")))["@graph"];
    const service = graph.find((n) => n["@type"] === "Service")!;
    expect(service.provider).toEqual({ "@type": "Person", name: "Therapist Maryanne" });
    expect(service.timeRequired).toBe("PT90M");
  });
});

describe("the route's metadata and structured data", async () => {
  const mod = await import("@/app/experiences/[type]/page");
  const meta = (type: string) => mod.generateMetadata({ params: Promise.resolve({ type }) });

  it("an empty vertical asks not to be indexed, and still lets links count (C16/T4)", async () => {
    const m = await meta("chauffeur");
    expect(m.robots).toEqual({ index: false, follow: true });
    expect((await meta("boat")).robots).toBeUndefined();
  });

  // The page and app/sitemap.ts share one gate (recommendedCount): a failed
  // site_content read is unknown, not empty, so no vertical is noindexed by a
  // DB hiccup while the sitemap keeps submitting it.
  it("a failed content read noindexes nothing (C16/T4)", async () => {
    fixtures.fellBack = true;
    try {
      for (const type of ["boat", "massage", "fishing", "hiking", "chauffeur"]) {
        expect((await meta(type)).robots, type).toBeUndefined();
      }
    } finally {
      fixtures.fellBack = false;
    }
    // …and a known-empty vertical still is.
    expect((await meta("chauffeur")).robots).toEqual({ index: false, follow: true });
  });

  it("a priced vertical keeps its price inside 155 characters (T7)", async () => {
    const m = await meta("massage");
    expect(String(m.description).length).toBeLessThanOrEqual(155);
    expect(m.description).toContain("From Rs 1,999 per person.");
  });

  it("the Île aux Cocos title keeps the whole name and the price (T6)", async () => {
    const m = await meta("ile-aux-cocos-excursion-with-les-inseparables");
    expect(m.title).toBe("Île aux Cocos Excursion with Les Inséparables — Rs 1,999");
    expect(String(m.description).length).toBeLessThanOrEqual(155);
    // The canonical is untouched by any of this.
    expect(String(m.alternates?.canonical)).toMatch(
      /\/experiences\/ile-aux-cocos-excursion-with-les-inseparables$/,
    );
  });

  it("a short name keeps the island in its title", async () => {
    expect((await meta("balade-en-mer")).title).toBe("Balade en mer — Rs 700 in Rodrigues");
  });

  it("the category trail runs Home › Experiences › category, and the list links each page (T13)", async () => {
    const html = renderToStaticMarkup(
      (await mod.default({ params: Promise.resolve({ type: "boat" }) })) as ReactElement,
    );
    const graph = ldOf(html)["@graph"];
    const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList")!.itemListElement as {
      name: string;
    }[];
    expect(crumbs.map((c) => c.name)).toEqual(["Home", "Experiences", "Sea trips in Rodrigues"]);
    const list = graph.find((n) => n["@type"] === "ItemList")!.itemListElement as { url?: string }[];
    expect(list.length).toBe(2);
    expect(list.every((i) => /\/experiences\/[a-z0-9-]+$/.test(i.url ?? ""))).toBe(true);
  });
});
