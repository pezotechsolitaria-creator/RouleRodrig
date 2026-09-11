import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withoutHidden } from "./content";
import { DEFAULT_CONTENT, type SiteContent } from "./defaults";

// ── THE ONLY WAY TO TAKE A LISTING DOWN WAS TO DELETE IT ────────────────────
//
// Stays, restaurants, activities and tours had no hide control at all — the
// single button on the row was Remove. A guest house closing for a month, or a
// listing whose photos were not ready, had to be destroyed and retyped later.
//
// That is not hypothetical on this site: somebody once deleted real fleet
// inventory to resolve a URL collision, and it had to be recovered from a
// content history snapshot that happened to exist.
//
// Vehicles had `available`, which is a DIFFERENT thing and must stay different:
// an unavailable scooter still renders, dimmed and badged, because one that is
// out on hire today is back tomorrow. Hidden removes it from the site.
//
// The filter lives in getContent() — the one door the public site reads
// through, 61 call sites — rather than in each of them, because the failure
// mode of a missed call site is silent: a listing the owner believes is down,
// still live and still bookable.

function content(over: Partial<SiteContent>): SiteContent {
  return { ...DEFAULT_CONTENT, ...over } as SiteContent;
}

const place = (id: string, hidden?: boolean) =>
  ({
    id,
    category: "hotel" as const,
    name: id,
    description: "",
    image: "",
    ...(hidden === undefined ? {} : { hidden }),
  });

const vehicle = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    badge: "",
    name: id,
    tagline: "",
    description: "",
    image: "",
    price: "Rs 699",
    unit: "/ day",
    available: true,
    ...over,
  });

describe("withoutHidden", () => {
  it("removes a hidden place and keeps the rest", () => {
    const out = withoutHidden(
      content({
        recommended: {
          ...DEFAULT_CONTENT.recommended,
          items: [place("keep"), place("gone", true)] as never,
        },
      }),
    );
    expect(out.recommended.items.map((p) => p.id)).toEqual(["keep"]);
  });

  it("removes a hidden vehicle and keeps the rest", () => {
    const out = withoutHidden(
      content({ fleet: [vehicle("keep"), vehicle("gone", { hidden: true })] as never }),
    );
    expect(out.fleet.map((v) => v.id)).toEqual(["keep"]);
  });

  it("does NOT remove a merely unavailable vehicle", () => {
    // The whole distinction. Unavailable still renders — dimmed, badged — and
    // conflating the two would silently delete tomorrow's stock from the site.
    const out = withoutHidden(
      content({ fleet: [vehicle("out", { available: false })] as never }),
    );
    expect(out.fleet.map((v) => v.id)).toEqual(["out"]);
  });

  it("treats a missing flag as visible", () => {
    // Every existing row in production predates this field.
    const out = withoutHidden(
      content({
        recommended: { ...DEFAULT_CONTENT.recommended, items: [place("old")] as never },
        fleet: [vehicle("old")] as never,
      }),
    );
    expect(out.recommended.items).toHaveLength(1);
    expect(out.fleet).toHaveLength(1);
  });

  it("returns the SAME object when nothing is hidden", () => {
    // This runs on every public request. The common case must not allocate two
    // new arrays to change nothing.
    const c = content({
      recommended: { ...DEFAULT_CONTENT.recommended, items: [place("a")] as never },
      fleet: [vehicle("b")] as never,
    });
    expect(withoutHidden(c)).toBe(c);
  });

  it("survives content with neither list", () => {
    const c = content({ recommended: undefined as never, fleet: undefined as never });
    expect(() => withoutHidden(c)).not.toThrow();
  });
});

describe("the filter is on the public door, and only there", () => {
  const CONTENT = readFileSync(join(process.cwd(), "lib/content.ts"), "utf8");
  const code = CONTENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("covers BOTH return paths of getContent", () => {
    // getContent falls back to the uncached read when the cached one throws. A
    // database blip must not un-hide the owner's listings.
    const body = code.slice(code.indexOf("export async function getContent("));
    const returns = body.slice(0, body.indexOf("\n}")).match(/return /g) ?? [];
    const filtered = body.slice(0, body.indexOf("\n}")).match(/withoutHidden\(/g) ?? [];
    expect(filtered.length).toBe(returns.length);
  });

  it("leaves getContentWithStatus unfiltered, so /admin can un-hide", () => {
    const idx = code.indexOf("export async function getContentWithStatus");
    const body = code.slice(idx, idx + 1200);
    expect(body).not.toContain("withoutHidden");
  });
});

describe("a hidden listing stops taking bookings", () => {
  const ROUTE = readFileSync(
    join(process.cwd(), "app/api/place-bookings/route.ts"),
    "utf8",
  );
  const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("checks the flag when it looks the listing up", () => {
    // This route reads getContentWithStatus() deliberately — it must fail
    // closed on a content outage — so the getContent() filter does not cover
    // it. Without this, a hidden listing stays bookable to anyone holding a
    // stale page: the booking lands, the money is taken, and the owner finds
    // out when somebody turns up.
    expect(code).toMatch(/p\.id === place_id && !p\.hidden/);
  });
});
