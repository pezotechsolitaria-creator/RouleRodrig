import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchPlaces } from "./places";

// ── THE FIXED ENDS MUST STAY RESOLVABLE, AND STAY ENGLISH ───────────────────
//
// An airport or ferry booking fills one end of the journey in for you. The
// string that does it is passed to searchPlaces() to look up real COORDINATES,
// and quote_ride() refuses with `need_locations` unless both ends carry lat and
// lng. So that string is a SEARCH KEY, not a label.
//
// This test exists because the mistake was actually made. While wiring the
// three languages in, an automated pass replaced these two literals with
// dictionary lookups — turning the key into "Erport Plaine Corail" in Kreol,
// which matches nothing in places.ts. Nothing would have thrown. The picker
// would have shown a place, the booking would have gone through, and every
// airport and ferry ride would have quietly become unpriceable, in two
// languages out of three, with no error anywhere.
//
// TypeScript cannot catch it: both sides are strings. So this does.

const ROOT = join(__dirname, "..", "..");
const SRC = readFileSync(
  join(ROOT, "app", "taxi", "book", "BookRide.tsx"),
  "utf8",
);

/** The keys as the component actually declares them, read from its source. */
function declaredKeys(): Record<string, string> {
  const block = SRC.match(
    /const FIXED_END_KEY: Partial<Record<RideService, string>> = \{([\s\S]*?)\};/,
  );
  if (!block) return {};
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/(\w+):\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

describe("the fixed ends of an airport or ferry booking", () => {
  const keys = declaredKeys();

  it("still declares them as plain string literals", () => {
    // If this fails, someone has made them dynamic — which is the whole bug.
    expect(
      Object.keys(keys).sort(),
      "FIXED_END_KEY is no longer two literal strings",
    ).toEqual(["airport", "ferry"]);
  });

  it("resolves each one to a real place", () => {
    for (const [service, key] of Object.entries(keys)) {
      const hit = searchPlaces(key)[0];
      expect(
        hit,
        `${service}: "${key}" matches no place in places.ts`,
      ).toBeTruthy();
    }
  });

  it("resolves each one to a place that HAS COORDINATES", () => {
    // The part that matters. A place with a null lat/lng resolves fine and then
    // cannot be priced, which is a silent failure rather than a loud one.
    for (const [service, key] of Object.entries(keys)) {
      const hit = searchPlaces(key)[0];
      expect(typeof hit?.lat, `${service}: "${key}" has no latitude`).toBe(
        "number",
      );
      expect(typeof hit?.lng, `${service}: "${key}" has no longitude`).toBe(
        "number",
      );
    }
  });

  it("keeps them out of the translation dictionary's reach", () => {
    // Belt and braces: the literals must not have been swapped for `c.` lookups.
    const block = SRC.match(/const FIXED_END_KEY[\s\S]*?\};/)?.[0] ?? "";
    expect(
      /\bc\./.test(block),
      "FIXED_END_KEY reads from the copy dictionary — it must not",
    ).toBe(false);
  });
});
