import { describe, it, expect } from "vitest";
import { DEFAULT_CONTENT, type RecommendedPlace, type SiteContent } from "@/lib/defaults";
import { SHEET } from "@/test/transfer-sheet.fixture";
import { EXPERIENCES, howBookingWorks } from "@/lib/experiences";
import { FR_PAGES } from "@/lib/nav/hubs";
import { placePageHref, placesWithOwnPage } from "@/lib/place-slug";
import { buildLlmsTxt, type LlmsData } from "./llms-txt";
import { hubBlurb, liveFromPrice, namedStays } from "./live-prices";

// ── WHAT llms.txt SAYS ABOUT A LISTING, CHECKED AGAINST WHAT THE SITE DOES ───
// (SEO audit 2026-09-29 C4, C8, T2, T15; fixer pass of 30 Sept)
//
// Built from a fixture shaped like site_content, with figures that are not the
// live ones. Four things it pins:
//  - a listing with a price NOTE and no depositAmount (Île aux Cocos, the spa
//    ritual, the sunrise hike, live) is marked request only, because the form
//    takes no payment for it and its own page says "we tell you";
//  - each experience category line carries main's checked description, not
//    the subtitle that names big-game fishing, sunsets and hotel visits;
//  - the /browse/stays line uses the page's own wording;
//  - a nameless hotel row, which renders nowhere, never becomes the "from"
//    price of the /fr hub or of llms.txt.

const U = "https://roulerodrig.com";

const place = (p: Partial<RecommendedPlace>) =>
  ({ description: "", image: "/x.jpg", ...p }) as RecommendedPlace;

const ITEMS: RecommendedPlace[] = [
  place({ id: "h1", category: "hotel", name: "Test Lodge", priceNote: "Rs 1,357 per night" }),
  // A blank draft row, priced under every real stay: renders nowhere.
  place({ id: "h0", category: "hotel", name: "  ", priceNote: "Rs 500 per night" }),
  // The Île aux Cocos shape: a price note, no amount to charge.
  place({ id: "c1", category: "activity", name: "Île aux Cocos Excursion with Les Inséparables", priceNote: "Rs 1313/Person " }),
  place({ id: "b1", category: "activity", serviceType: "boat", name: "Balade test", priceNote: "Rs 717 per person", depositAmount: 717 }),
  place({ id: "m1", category: "activity", serviceType: "massage", name: "Rituel test", priceNote: "Rs 1,919 per person" }),
  place({ id: "f1", category: "activity", serviceType: "fishing", name: "Peche test", priceNote: "Rs 737 per person", depositAmount: 737 }),
  place({ id: "k1", category: "activity", serviceType: "hiking", name: "Randonnee test", priceNote: "Rs 2,727 per person" }),
  // No note and no amount: nothing to print as a price.
  place({ id: "x1", category: "activity", name: "Sans prix test" }),
];

const CONTENT: SiteContent = {
  ...DEFAULT_CONTENT,
  fleet: [{ ...DEFAULT_CONTENT.fleet[0], id: "t-scoot", category: "scooter", price: "Rs 777" }],
  recommended: { ...DEFAULT_CONTENT.recommended, enabled: true, items: ITEMS },
  mapLocations: [],
};

const DATA: LlmsData = {
  siteUrl: U,
  content: CONTENT,
  fares: { airport: SHEET, ferry: null },
  food: null,
  eventsOnSale: false,
};

const TXT = buildLlmsTxt(DATA);
const lineFor = (path: string) => TXT.split("\n").find((l) => l.includes(`](${U}${path})`)) ?? "";

describe("a listing the form takes no payment for says so (C4, C8)", () => {
  it("marks the Île aux Cocos shape request only, keeping the owner's note verbatim", () => {
    expect(lineFor("/experiences/ile-aux-cocos-excursion-with-les-inseparables")).toBe(
      `- [Île aux Cocos Excursion with Les Inséparables](${U}/experiences/ile-aux-cocos-excursion-with-les-inseparables): price: Rs 1313/Person (request only: nothing is paid on the site; once the date is confirmed, we tell you how to pay)`,
    );
    expect(lineFor("/experiences/rituel-test")).toContain("price: Rs 1,919 per person (request only");
  });

  it("does not mark a listing that has an amount to charge", () => {
    expect(lineFor("/experiences/balade-test")).toBe(`- [Balade test](${U}/experiences/balade-test): price: Rs 717 per person`);
    expect(lineFor("/experiences/peche-test")).not.toContain("request only");
  });

  it("says there is no price, rather than pointing at one the listing does not have", () => {
    const l = lineFor("/experiences/sans-prix-test");
    expect(l).toContain("no price listed (request only");
    expect(l).not.toContain("price on the listing");
  });

  it("marks exactly the listings whose own page tells them 'we tell you', not 'you pay online'", () => {
    // PlaceDetail passes Number(depositAmount) > 0 to howBookingWorks(); the
    // line and the page must describe the same flow for every listing.
    const listed = placesWithOwnPage(ITEMS);
    expect(listed.length).toBe(6);
    for (const p of listed) {
      const pageSaysPay = howBookingWorks("them", Number(p.depositAmount) > 0)[2].includes("you pay online");
      const l = lineFor(placePageHref(p));
      expect(l, p.name).not.toBe("");
      expect(l.includes("request only"), p.name).toBe(!pageSaysPay);
    }
  });

  it("points the pay rule at the marker, and still names the no-price case", () => {
    const pay = TXT.slice(TXT.indexOf("## How to pay"), TXT.indexOf("## Contact"));
    expect(pay).toContain("A listing with no price on it is a request only");
    expect(pay).toContain("any listing marked request only above, whatever price it shows");
    expect(pay).toContain("we reply with how to pay");
  });
});

describe("the category lines say what main checked against the listings (C8, T15)", () => {
  it("prints each description with the live from-price", () => {
    expect(lineFor("/experiences/fishing")).toBe(
      `- [${EXPERIENCES.fishing.title}](${U}/experiences/fishing): ${EXPERIENCES.fishing.description} From Rs 737.`,
    );
    expect(lineFor("/experiences/boat")).toBe(
      `- [${EXPERIENCES.boat.title}](${U}/experiences/boat): ${EXPERIENCES.boat.description} From Rs 717.`,
    );
    expect(lineFor("/experiences/massage")).toContain(`${EXPERIENCES.massage.description} From Rs 1,919.`);
    expect(lineFor("/experiences/hiking")).toContain(`${EXPERIENCES.hiking.description} From Rs 2,727.`);
  });

  it("offers no big-game fishing, sunset trip or hotel visit that no listing has", () => {
    for (const t of ["fishing", "boat", "massage", "hiking"] as const) {
      const l = lineFor(`/experiences/${t}`);
      expect(l, t).not.toBe("");
      expect(l, t).not.toMatch(/big game|sunset|at your hotel/i);
    }
  });

  it("describes the stays the way the stays page does", () => {
    const l = lineFor("/browse/stays");
    expect(l).toContain("guesthouses, self-catering houses and villas, from Rs 1,357 a night");
    expect(l).not.toMatch(/lodges/i);
  });
});

describe("a nameless hotel row sets no 'from' price anywhere (T2)", () => {
  it("is not a stay", () => {
    expect(namedStays(ITEMS).map((p) => p.id)).toEqual(["h1"]);
  });

  it("does not become the stays price in llms.txt", () => {
    expect(liveFromPrice(CONTENT, "stays")).toBe(1357);
    expect(lineFor("/browse/stays")).not.toContain("500");
  });

  it("does not become the /fr hub's 'dès' price, which llms.txt repeats", () => {
    const stays = FR_PAGES.find((p) => p.href === "/fr/hebergement-rodrigues")!;
    const fr = (n: number) => `Rs ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
    expect(hubBlurb(CONTENT, stays, fr)).toBe("Où dormir, dès Rs 1 357 la nuit.");
    expect(lineFor("/fr/hebergement-rodrigues")).toContain("dès Rs 1 357 la nuit");
    expect(lineFor("/fr/hebergement-rodrigues")).not.toContain("500");
  });

  it("with only the nameless row, prints no price rather than its price", () => {
    const ghostOnly = { ...CONTENT, recommended: { ...CONTENT.recommended, items: [ITEMS[1]] } };
    expect(liveFromPrice(ghostOnly, "stays")).toBeNull();
  });
});

describe("the /fr hub's taxi line finishes its sentence", () => {
  it("says confirmed before what, in the taxi FAQ's own words", () => {
    const taxi = FR_PAGES.find((p) => p.href === "/fr/taxi-rodrigues")!;
    expect(taxi.blurb).toBe("Transfert aéroport à tarif fixe par zone ; pour le reste, prix confirmé avant tout engagement.");
    expect(taxi.blurb).not.toMatch(/avant\.$/);
    expect(lineFor("/fr/taxi-rodrigues")).toContain("prix confirmé avant tout engagement. En français.");
  });
});
