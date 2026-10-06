import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";

// ── AN EQUIPMENT CATEGORY'S OWN PAGE (architecture review 2026-09-30,
// rentalKind fix-up) ─────────────────────────────────────────────────────────
//
// rentalKind reached the per-vehicle page (app/browse/vehicle-page-category
// .test.ts) but not /browse/<category>, the page with the booking form: an
// equipment category still listed a licence, fuel, mileage and the Rs 5,000
// car deposit beside the form and in its FAQPage, and its trust bar promised
// "Helmet included" and "Free scooter delivery". Rendered here from the real
// category page, the real TrustBar and the real RentalConditions panel.
//
// And the pin that makes it safe: a category with no rentalKind (every live
// one) renders byte for byte what it did with rentalKind "motor".

const fx = vi.hoisted(() => ({ view: null as unknown, conditions: [] as { id: string }[][] }));

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
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));
vi.mock("@/components/BrowseTabs", () => ({ default: () => null }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/ScrollToTop", () => ({ default: () => null }));
// The fleet grid prints the heading and intro it is handed.
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
// The booking form: the panel it renders from `conditions`, exactly as
// BookingSection does (<RentalConditions items={conditions} />), with the
// REAL panel; the list it was handed is kept for the assertions.
vi.mock("@/components/BookingSection", async () => {
  const { default: RentalConditions } = await import("@/components/RentalConditions");
  return {
    default: (p: { conditions?: { id: string }[] }) => {
      fx.conditions.push(p.conditions ?? []);
      return p.conditions?.length ? createElement(RentalConditions, { items: p.conditions as never }) : null;
    },
  };
});
// TrustBar is NOT mocked: its items are what this is about.

// The owner's live FAQ wording (site_content, 29 Sep 2026), as in
// app/browse/vehicle-page-category.test.ts.
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

const row = (id: string, name: string, price: string, category: string) => ({
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
  soldOutToday: false,
  specs: [],
  included: [],
});

type Kind = "motor" | "equipment" | undefined;
function setView(o: { kayak?: Kind; scooter?: Kind; car?: Kind } = { kayak: "equipment" }) {
  const kind = (k: Kind) => (k ? { rentalKind: k } : {});
  const fleet = [
    row("burgman", "BURGMAN 125cc", "Rs 699(free delivery)", "scooter"),
    row("swift", "Suzuki Swift", "Rs 1,899", "car"),
    row("kayak-1", "Sit-on-top Kayak", "Rs 800", "kayak"),
  ];
  const content = {
    ...DEFAULT_CONTENT,
    faq: { ...DEFAULT_CONTENT.faq, items: LIVE_FAQ },
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true, deliveryFee: 0, ...kind(o.scooter) },
      { id: "car", label: "Cars", enabled: true, deliveryFee: 0, ...kind(o.car) },
      { id: "kayak", label: "Kayaks", enabled: true, deliveryFee: 0, ...kind(o.kayak) },
    ],
    fleet,
  } as unknown as SiteContent;
  fx.view = { content, fleet, ratings: {}, recentBookings: {}, reviews: [], businessWhatsApp: "+23058355588" };
}

beforeEach(() => {
  setView();
  fx.conditions = [];
});

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

async function render(category: string) {
  const mod = await import("@/app/browse/[category]/page");
  return renderToStaticMarkup(
    (await mod.default({ params: Promise.resolve({ category }) })) as ReactElement,
  );
}

const MOTOR_TERMS = /licen[cs]e|fuel|mileage|Rs 5,000|deposit|helmet|road rules|third-party|insurance|breaks down/i;

describe("/browse/kayak with rentalKind 'equipment'", () => {
  it("hands the booking form only the terms that hold for equipment", async () => {
    await render("kayak");
    expect(fx.conditions.at(-1)!.map((c) => c.id)).toEqual(["delivery", "faq-min-duration"]);
  });

  it("publishes an FAQPage of exactly those two questions, each one visible", async () => {
    const html = await render("kayak");
    const faq = ld(html).find((n) => n["@type"] === "FAQPage")!;
    const qa = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(qa.map((q) => q.name)).toEqual([
      "Can you deliver the vehicle to my hotel?",
      "Is there a minimum rental duration?",
    ]);
    const t = visible(html);
    for (const q of qa) {
      expect(t).toContain(q.name);
      expect(t).toContain(q.acceptedAnswer.text);
    }
    expect(JSON.stringify(faq)).not.toMatch(MOTOR_TERMS);
  });

  it("shows no licence, fuel, deposit, insurance or helmet anywhere a visitor reads", async () => {
    const t = visible(await render("kayak"));
    expect(t).not.toMatch(MOTOR_TERMS);
  });

  it("promises only what holds for any rental in its trust bar", async () => {
    const t = visible(await render("kayak"));
    expect(t).toContain("Delivered to your stay");
    expect(t).toContain("WhatsApp if you need us");
    expect(t).not.toMatch(/Insured|No mileage cap|Helmet included|Air conditioning/);
  });

  it("is a Product, the same type its own page gives it", async () => {
    const products = ld(await render("kayak")).filter((n) => n.name === "Sit-on-top Kayak");
    expect(products.map((n) => n["@type"])).toEqual(["Product"]);
  });

  it("is the motor page again the moment the kind is not 'equipment'", async () => {
    // Proves the kind is what switched the terms off, not the id "kayak".
    setView({ kayak: "motor" });
    const t = visible(await render("kayak"));
    expect(t).toContain("Do I need a driving licence?");
    expect(t).toContain("No mileage cap");
  });
});

describe("a category with no rentalKind renders exactly as before", () => {
  for (const category of ["scooter", "car"] as const) {
    it(`/browse/${category} is byte-for-byte the same page with rentalKind 'motor'`, async () => {
      setView({});
      const before = await render(category);
      setView({ [category]: "motor" });
      expect(await render(category)).toBe(before);
    });
  }

  // The trust row is the same four lines on a car and a scooter (owner brief,
  // 6 Oct 2026): each is true of both, so neither page can promise the other's.
  it("/browse/car keeps the car terms and the four-line trust row", async () => {
    setView({});
    const t = visible(await render("car"));
    expect(t).toContain("Do I need a driving licence?");
    expect(t).toContain("A security deposit of Rs 5,000 applies to car rentals.");
    expect(t).toContain("Insured");
    expect(t).toContain("No mileage cap");
    expect(t).not.toContain("Helmet included");
  });

  it("/browse/scooter keeps the helmet answer and the same trust row", async () => {
    setView({});
    const t = visible(await render("scooter"));
    expect(t).toContain("Do scooters come with a helmet?");
    expect(t).toContain("Delivered to your stay");
    expect(t).toContain("No mileage cap");
  });
});
