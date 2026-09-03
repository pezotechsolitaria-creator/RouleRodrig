import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecommendedPlace } from "./defaults";
import { PLACE_PARAM, placeAnchorId, placeHref, placeListingHref } from "./place-href";

// ── TAPPING A NAMED CARD SHOWED A DIFFERENT BUSINESS (M160) ─────────────────
//
// Reported twice in one message, and they were one bug wearing two faces:
//
//   "when i click on ile aux cocos it shows me rituel signature harmony spa"
//   "when i click on plongee en apnee it shows me balade en mer first"
//
// The catalogue, verbatim from site_content at the time:
//
//   Île aux Cocos Excursion …   serviceType null   isTour true   activity
//   Balade en mer               serviceType boat   isTour true   activity
//   Plongée en apnée/Aquarium…  serviceType boat   isTour true   activity
//   Rituel Signature Harmony…   serviceType massage isTour null  activity
//
// The hub built its href as `serviceType ? /experiences/<t> : /browse/activities`
// with NO isTour branch — the only one of four copies of this mapping missing
// it. So Île aux Cocos was sent to /browse/activities, whose filter is
// `category === "activity" && !p.isTour`. That page excludes tours by
// construction, so it could never list Île aux Cocos, and the single non-tour
// activity in the whole catalogue is the spa. The owner was shown the one
// listing that survived the filter.
//
// Plongée en apnée reached the right page and no further: /experiences/boat
// lists Balade en mer first because it is earlier in the catalogue, and
// nothing in the URL said which of the two had been tapped.

const ROOT = __dirname.replace(/lib$/, "");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const place = (p: Partial<RecommendedPlace>): RecommendedPlace =>
  ({ id: "x", name: "x", category: "activity", ...p }) as RecommendedPlace;

// The four listings that produced the report.
const COCOS = place({ id: "rec-1784585562167", name: "Île aux Cocos Excursion with Les Inséparables", isTour: true });
const BALADE = place({ id: "rec-1785681665552", name: "Balade en mer", serviceType: "boat", isTour: true });
const APNEE = place({ id: "svc-1786553123744", name: "Plongée en apnée/Aquarium Rivière Banane", serviceType: "boat", isTour: true });
const SPA = place({ id: "svc-1787026601307", name: "Rituel Signature Harmony Spa (1 h 30)", serviceType: "massage" });

describe("a tour goes to the tours page, not to the page that excludes tours", () => {
  it("sends Île aux Cocos to /browse/tours", () => {
    // The missing branch. /browse/activities filters `!p.isTour`, so this
    // listing could never appear there — which is the whole defect.
    expect(placeListingHref(COCOS)).toBe("/browse/tours");
    expect(placeHref(COCOS)).not.toContain("/browse/activities");
  });

  it("keeps a non-tour activity on /browse/activities", () => {
    expect(placeListingHref(place({ isTour: false }))).toBe("/browse/activities");
  });

  it("still puts category before everything else", () => {
    expect(placeListingHref(place({ category: "hotel" }))).toBe("/browse/stays");
    expect(placeListingHref(place({ category: "restaurant" }))).toBe("/food");
    expect(placeListingHref(SPA)).toBe("/experiences/massage");
  });
});

describe("the link names WHICH listing, not only which page", () => {
  it("carries the id, so two boat trips have two addresses", () => {
    expect(placeHref(BALADE)).toBe(`/experiences/boat?${PLACE_PARAM}=rec-1785681665552`);
    expect(placeHref(APNEE)).toBe(`/experiences/boat?${PLACE_PARAM}=svc-1786553123744`);
    expect(placeHref(BALADE)).not.toBe(placeHref(APNEE));
  });

  it("names Île aux Cocos on the page it actually lives on", () => {
    expect(placeHref(COCOS)).toBe(`/browse/tours?${PLACE_PARAM}=rec-1784585562167`);
  });

  it("escapes an id rather than pasting it into a query string", () => {
    expect(placeHref(place({ id: "a b&c" }))).toContain("a%20b%26c");
  });

  it("adds nothing to /food, which lists dishes and has no card to open", () => {
    expect(placeHref(place({ category: "restaurant" }))).toBe("/food");
  });
});

describe("both surfaces that hold a detail modal read the parameter", () => {
  const HOOK = strip(read("components", "usePlaceDeepLink.ts"));

  it("looks the id up and opens that place", () => {
    expect(HOOK).toContain("PLACE_PARAM");
    expect(HOOK).toContain("places.find((p) => p.id === wanted)");
    expect(HOOK).toContain("open(target)");
  });

  it("opens nothing when the id is not on the page", () => {
    // A stale or unpublished link must leave the listing alone rather than
    // open some other business, which is the failure being fixed.
    expect(HOOK).toContain("if (!target) return;");
  });

  for (const file of [
    ["components", "experiences", "ExperienceMarket.tsx"],
    ["components", "RecommendedPlaces.tsx"],
  ]) {
    it(`${file[file.length - 1]} calls the hook and anchors its cards`, () => {
      const src = strip(read(...file));
      expect(src).toContain("usePlaceDeepLink(");
      expect(src).toContain("setDetailPlace");
      // Without an id on the card the modal opens over the top of a list
      // scrolled somewhere else entirely.
      expect(src).toContain("placeAnchorId(");
    });
  }

  it("gives the card a stable, collision-free id", () => {
    expect(placeAnchorId("rec-1")).toBe("exp-place-rec-1");
  });
});

describe("nobody rebuilds the mapping by hand any more", () => {
  // It had been copied four times and they had already drifted; that drift IS
  // the bug. Every caller now imports the one function.
  const CALLERS = [
    ["components", "experiences", "ExperiencesHub.tsx"],
    ["app", "page.tsx"],
    ["app", "explore", "page.tsx"],
    ["lib", "world-docs", "resolve.ts"],
  ];

  for (const file of CALLERS) {
    it(`${file.join("/")} imports placeHref instead of re-deriving it`, () => {
      const src = strip(read(...file));
      expect(src).toContain("placeHref");
      expect(src).not.toContain('? "/browse/tours" : "/browse/activities"');
      expect(src).not.toMatch(/serviceType\s*\?\s*`\/experiences\/\$\{/);
    });
  }
});

describe("structured data stops pointing every listing at one URL", () => {
  it("gives each experience its own url", () => {
    const src = strip(read("app", "experiences", "[type]", "page.tsx"));
    expect(src).toContain("${SITE_URL}${placeHref(p)}");
    // The old form named two charters at one address.
    expect(src).not.toContain("url: `${SITE_URL}/experiences/${copy.slug}` }))");
  });

  it("does the same on the browse listings", () => {
    const src = strip(read("app", "browse", "[category]", "page.tsx"));
    expect(src).toContain("${SITE_URL}${placeHref(i)}");
  });
});
