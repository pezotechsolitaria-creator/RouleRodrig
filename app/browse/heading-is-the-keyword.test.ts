import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE STRONGEST HEADING ON A COMMERCIAL PAGE WAS A NAV CRUMB ──────────────
//
// /browse/stays rendered:
//
//   <h1>Accommodations</h1>                     <- the nav label
//   <h2>Where to Stay in Rodrigues</h2>         <- the actual subject
//
// The keyword heading had been written months earlier and sat one level too
// low, under a word nobody types. The META entry for stays records what that
// cost: indexed, and zero impressions for any accommodation query in 90 days.
//
// This exact fault was found and fixed for the VEHICLE categories — the comment
// above `header()` describes it in those words — and the place branch was never
// given the same treatment. /browse/tours had it too.
//
// Verified by rendering, not by reading: /browse/stays now serves exactly one
// <h1>, "Where to Stay in Rodrigues".

const PAGE = readFileSync(join(process.cwd(), "app/browse/[category]/page.tsx"), "utf8");
const PLACES = readFileSync(join(process.cwd(), "components/RecommendedPlaces.tsx"), "utf8");

describe("a category page's h1 is its subject, not its nav label", () => {
  it("never renders the bare label as an h1", () => {
    // header()'s second argument defaults to "h1". Every caller that has a real
    // keyword heading elsewhere on the page must pass "span".
    const bareCalls = [...PAGE.matchAll(/\{header\(([^)]*)\)\}/g)]
      .map((m) => m[1].trim())
      .filter((args) => !args.includes('"span"'));

    expect(
      bareCalls,
      "these render their argument as the page <h1>. A label like " +
        '"Accommodations" or "Cars" is a nav crumb, not the subject:\n' +
        bareCalls.join("\n"),
    ).toEqual([]);
  });

  it("promotes the place heading to h1 through RecommendedPlaces", () => {
    expect(PAGE).toMatch(/<RecommendedPlaces\s+titleAs="h1"/);
  });

  it("keeps the vehicle branches as they were", () => {
    // These were already correct. The regression to guard against is somebody
    // "simplifying" them back to the default.
    expect(PAGE).toMatch(/VEHICLE_COPY\[vcat\.id\]\?\.heading \?\? vcat\.label/);
  });

  it("still has a heading when a place category is empty", () => {
    // The empty state carries its own <h1>; passing "span" above must not have
    // left that branch headless.
    expect(PAGE).toMatch(/\{place\.heading \?\? place\.label\}/);
  });
});

describe("RecommendedPlaces owns a configurable heading level", () => {
  it("defaults to h2, because usually it is a section inside a page", () => {
    expect(PLACES).toMatch(/titleAs: TitleTag = "h2"/);
    expect(PLACES).toMatch(/titleAs\?: "h1" \| "h2"/);
  });

  it("renders the chosen tag rather than a hardcoded h2", () => {
    expect(PLACES).toMatch(/<TitleTag className=/);
    expect(PLACES).toMatch(/<\/TitleTag>/);
  });
});
