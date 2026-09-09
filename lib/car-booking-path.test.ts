import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const VEHICLE = read("app", "browse", "[category]", "[vehicle]", "page.tsx");
const BOOKING = read("components", "BookingSection.tsx");
const FLEET = read("components", "Fleet.tsx");

// ── THE BOOK BUTTON THREW THE CUSTOMER INTO AN EMPTY FORM ──────────────────
//
// rr:prefill-booking is a CustomEvent on `window`, so it only reaches a form
// in the SAME document. Every "Book the Toyota Hilux" button linked to
// /browse/car#booking — a different page — so a customer who had already
// picked a car arrived at "Choose a vehicle…" with no price. The link's own
// comment claimed it pre-filled from the hash; nothing ever read the hash.
describe("the chosen vehicle survives the trip to the booking form", () => {
  it("both Book controls carry the vehicle id", () => {
    // Only the links that land on the form — the canonical is built from the
    // same prefix and must NOT gain a parameter.
    const booking = [
      ...VEHICLE.matchAll(/`\/browse\/\$\{category\}([^`]*)#booking`/g),
    ].map((m) => m[1]);
    expect(booking).toHaveLength(2); // the inline button and the sticky bar
    for (const l of booking) expect(l).toBe("?v=${item.id}");
  });

  it("does not put the parameter on the canonical", () => {
    // /browse/car/suzuki-swift must stay the one address for that vehicle.
    expect(VEHICLE).toContain(
      "const url = `${SITE_URL}/browse/${category}/${vehicleSlug(item)}`",
    );
  });

  it("keeps the fragment last so the scroll to #booking still fires", () => {
    // ?v=…#booking, never #booking?v=… — the latter makes the parameter part
    // of the fragment and it never reaches location.search.
    for (const m of VEHICLE.matchAll(/\/browse\/\$\{category\}\?v=[^`]*`/g)) {
      expect(m[0].trim().endsWith("#booking`")).toBe(true);
    }
  });

  it("the form reads it on mount", () => {
    expect(strip(BOOKING)).toContain(
      'new URLSearchParams(window.location.search).get("v")',
    );
  });

  it("does not de-opt a prerendered route to read it", () => {
    // useSearchParams would make every visit dynamic for a parameter that is
    // absent on almost all of them.
    expect(strip(BOOKING)).not.toContain("useSearchParams");
  });

  it("ignores an id the dropdown cannot show", () => {
    // A stale link would otherwise select a value with no matching <option>,
    // which renders as blank — worse than the empty state it replaced.
    expect(strip(BOOKING)).toMatch(/scooters\.some\(\(s\) => s\.id === v\)/);
  });
});

// ── FOUR FULL-VIEWPORT PHOTOS PRELOADED, ONE ON SCREEN ─────────────────────
//
// `loading={i === 0 ? ...}` looked right, but `i` is the photo index inside
// ONE card's carousel — so every card's first photo was eager, and Next put a
// <link rel="preload" as="image"> in the head for each at 100vw.
describe("only the image above the fold is eager", () => {
  it("keys the eager attribute on the card, not the carousel slide", () => {
    expect(strip(FLEET)).toContain(
      'loading={cardIndex === 0 && i === 0 ? "eager" : "lazy"}',
    );
    expect(strip(FLEET)).not.toContain('loading={i === 0 ? "eager" : "lazy"}');
  });

  it("passes the grid index down", () => {
    expect(strip(FLEET)).toContain("cardIndex={i}");
  });
});

// ── THE MOST-REPEATED SENTENCE ON THE SITE SOLD ONLY SCOOTERS ──────────────
//
// The footer runs on ~75 of 77 pages, including all four car pages, and read
// "Premium scooter rentals on the most beautiful island in the Indian Ocean."
describe("the footer names both things the owner rents", () => {
  const I18N = read("lib", "i18n.ts");
  const taglines = [...I18N.matchAll(/tagline:\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]);

  it("has one per language", () => {
    expect(taglines).toHaveLength(3);
  });

  it("never names scooters without naming cars", () => {
    for (const t of taglines) {
      const scooter = /scooter|skooter/i.test(t);
      const car = /\bcars?\b|voiture|loto/i.test(t);
      expect(scooter && !car).toBe(false);
    }
  });

  it("leaves the homepage hero alone", () => {
    // content.json:9 is the subheadline on the one page that actually ranks
    // for scooters. It is deliberately NOT part of this change.
    expect(read("lib", "i18n.ts")).not.toContain(
      "Premium scooter rentals on the most beautiful island",
    );
  });
});
