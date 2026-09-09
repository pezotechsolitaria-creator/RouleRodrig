import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecommendedPlace } from "@/lib/defaults";
import {
  placeSlug,
  hasOwnPage,
  findPlaceBySlug,
  placePageHref,
  placesWithOwnPage,
} from "./place-slug";
import { priceFromNote, placePrice, placeDeposit, GUIDE_FOR_PLACE } from "./place-detail";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const place = (p: Partial<RecommendedPlace>): RecommendedPlace =>
  ({ id: "x", name: "x", category: "activity", ...p }) as RecommendedPlace;

// Real catalogue entries, copied from production on 2026-09-09.
const COCOS = place({
  id: "rec-1784585562167",
  name: "Île aux Cocos Excursion with Les Inséparables",
  isTour: true,
  priceNote: "Rs 2000/Person ",
  depositAmount: 1000,
});
const STAY = place({ id: "svc-1", name: "Lakaze Mama", category: "hotel" });

// ── ONE EXPERIENCE, ONE URL ─────────────────────────────────────────────────
//
// Île aux Cocos is the thing most visitors to Rodrigues search for, and it had
// no address: `/browse/tours?place=rec-1784585562167`, a query parameter on a
// listing, which canonicals to the listing. Nothing to rank, nothing to paste
// into WhatsApp, nothing an assistant could cite.
describe("an experience's slug", () => {
  it("folds accents instead of percent-encoding them", () => {
    // Without NFD the Î and the é survive as %C3%8E — not a URL anybody pastes.
    expect(placeSlug(COCOS)).toBe("ile-aux-cocos-excursion-with-les-inseparables");
  });

  it("comes from the name, not the id", () => {
    // rec-1784585562167 is a timestamp: it tells a reader nothing and looks
    // like tracking. It would have been worse than the query parameter.
    expect(placeSlug(COCOS)).not.toContain("rec-");
  });

  it("cuts a very long name on a word boundary", () => {
    const s = placeSlug(place({ name: "A".repeat(20) + " " + "B".repeat(80) }));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });

  it("is empty for a nameless listing rather than a bare dash", () => {
    expect(placeSlug(place({ name: "   " }))).toBe("");
  });
});

describe("which places get a page", () => {
  it("gives one to an activity", () => {
    expect(hasOwnPage(COCOS)).toBe(true);
    expect(placePageHref(COCOS)).toBe(
      "/experiences/ile-aux-cocos-excursion-with-les-inseparables",
    );
  });

  it("does not give one to a stay or a restaurant", () => {
    // /browse/stays and /food are their listings. Putting a guest house at an
    // /experiences/ address would say it is an experience.
    expect(hasOwnPage(STAY)).toBe(false);
    expect(hasOwnPage(place({ category: "restaurant", name: "Chez Banane" }))).toBe(false);
  });

  it("never lets a place shadow a listing route", () => {
    // /experiences/boat is the sea-trips page and cannot also be one charter.
    expect(hasOwnPage(place({ name: "Boat" }))).toBe(false);
    expect(hasOwnPage(place({ name: "Massage" }))).toBe(false);
  });

  it("gives a page to an experience that is not bookable online", () => {
    // It still has a phone number and a real existence.
    expect(hasOwnPage(place({ name: "Kite lesson", bookable: false }))).toBe(true);
  });

  it("resolves a slug back to exactly one place", () => {
    const items = [COCOS, STAY, place({ id: "b", name: "Balade en mer" })];
    expect(findPlaceBySlug(items, placeSlug(COCOS))?.id).toBe("rec-1784585562167");
    expect(findPlaceBySlug(items, "balade-en-mer")?.id).toBe("b");
    expect(findPlaceBySlug(items, "nothing-here")).toBeUndefined();
    expect(placesWithOwnPage(items)).toHaveLength(2);
  });
});

// ── THE PRICE, NOT THE DEPOSIT ──────────────────────────────────────────────
//
// experienceLd is fed depositAmount, because fromPriceOf() reads it. On Île aux
// Cocos that is Rs 1,000 against a priceNote of "Rs 2000/Person" — so the
// site's most-searched product published HALF its real price as a schema.org
// Offer while the page beside it showed the full one.
describe("what an experience costs", () => {
  it("takes the price from the owner's note, not the deposit", () => {
    expect(placePrice(COCOS)).toBe(2000);
    expect(placeDeposit(COCOS)).toBe(1000);
  });

  it("reads money the way a human types it", () => {
    expect(priceFromNote("Rs 2000/Person ")).toBe(2000);
    expect(priceFromNote("Rs 2,990 per night")).toBe(2990);
    expect(priceFromNote("Rs 1 200")).toBe(1200);
    expect(priceFromNote("from Rs 2500 per night (for one person)")).toBe(2500);
  });

  it("returns null rather than zero when no price is stated", () => {
    // A place with no price must not publish an Offer of nothing.
    expect(priceFromNote("Ask us")).toBeNull();
    expect(priceFromNote(null)).toBeNull();
    expect(placePrice(place({ name: "x" }))).toBeNull();
  });

  it("falls back to the deposit when the note cannot be parsed", () => {
    expect(placePrice(place({ name: "x", priceNote: "on request", depositAmount: 700 }))).toBe(700);
  });
});

describe("the guide cross-link", () => {
  it("points Île aux Cocos at the guide that already covers it", () => {
    // ~4,000 characters of real writing with TouristAttraction schema. Two
    // pages saying the same thing compete; only one can win.
    expect(GUIDE_FOR_PLACE(COCOS)?.href).toBe("/guide/ile-aux-cocos");
  });

  it("offers nothing when no guide page exists", () => {
    expect(GUIDE_FOR_PLACE(place({ name: "Balade en mer" }))).toBeNull();
  });
});

describe("the pages are reachable and listed", () => {
  it("every card links to them", () => {
    // A URL nothing links to does not rank, and every card routes through
    // placeHref.
    expect(read("lib", "place-href.ts")).toContain("if (hasOwnPage(p)) return placePageHref(p);");
  });

  it("the sitemap lists them", () => {
    expect(read("app", "sitemap.ts")).toContain("placesWithOwnPage(content.recommended.items)");
  });

  it("the route prerenders them", () => {
    const src = read("app", "experiences", "[type]", "page.tsx");
    expect(src).toContain("placesWithOwnPage(content.recommended.items).map");
    expect(src).toContain("findPlaceBySlug(content.recommended.items, type)");
  });

  it("a service listing still wins its own name", () => {
    const src = read("app", "experiences", "[type]", "page.tsx");
    // copyFor() runs first; only a non-service segment falls through.
    expect(src).toMatch(/const copy = copyFor\(type\);[\s\S]{0,900}if \(!copy\) \{/);
  });
});
