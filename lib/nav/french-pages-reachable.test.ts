import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// ── THE FRENCH SIDE WAS A CLOSED ISLAND (M153) ──────────────────────────────
//
// Search Console URL Inspection, 2026-08-29:
//
//   /fr/location-voiture-rodrigues   URL is unknown to Google
//   /fr/hebergement-rodrigues        URL is unknown to Google
//   /fr/que-faire-a-rodrigues        URL is unknown to Google
//   /fr/se-deplacer-a-rodrigues      Discovered - currently not indexed
//
// Not a content problem. Those pages are BETTER than their English twins —
// 3,000 to 8,800 characters with FAQPage and real entity markup, against
// English pages serving 1,100. All eight were in the sitemap. All eight
// carried correct reciprocal hreflang.
//
// They were reachable only from EACH OTHER. The four whose English twin did
// not link them are exactly the four Google could not see, and lib/nav/
// reachable-pages.test.ts passed the whole time, because "linked from another
// French page" is still linked.
//
// hreflang is an annotation, not a crawl path. Being in a sitemap is a
// suggestion, not a crawl path. A link is a crawl path.
//
// What this costs: for "plage rodrigues" Google ranks /fr/plages-rodrigues at
// position 9 and the English /guide/beaches at 83 — for the same query. The
// French pages win whenever Google can find them.

const ROOT = join(__dirname, "..", "..");

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

const ALL = [
  ...sources(join(ROOT, "app")),
  ...sources(join(ROOT, "components")),
  ...sources(join(ROOT, "lib")),
];

/** Routes under app/fr — the French landing pages. */
const FRENCH_ROUTES = readdirSync(join(ROOT, "app", "fr")).filter((n) => {
  try {
    return statSync(join(ROOT, "app", "fr", n, "page.tsx")).isFile();
  } catch {
    return false;
  }
});

/** Files that are NOT themselves French pages, i.e. can be a door in. */
const NON_FRENCH = ALL.filter(
  (f) => !f.split(sep).join("/").includes("/app/fr/") && !f.endsWith(".test.ts"),
);

const linksIn = (slug: string) =>
  NON_FRENCH.filter((f) => readFileSync(f, "utf8").includes(`"/fr/${slug}"`));

describe("every French page has a door from the English side", () => {
  it("finds the French routes at all (tripwire against matching nothing)", () => {
    expect(FRENCH_ROUTES.length).toBeGreaterThanOrEqual(8);
    expect(NON_FRENCH.length).toBeGreaterThan(100);
  });

  it.each(FRENCH_ROUTES)("/fr/%s is linked from a non-French page", (slug) => {
    const doors = linksIn(slug).map((f) => f.split(sep).join("/").split("/app/")[1] ?? f);
    expect(
      doors.length,
      `/fr/${slug} is reachable only from other French pages. Google reported ` +
        `exactly this set as "unknown to Google". Add a link from its English ` +
        `twin — see components/FrenchTwinLink.tsx.`,
    ).toBeGreaterThan(0);
  });
});

describe("the doors point where hreflang says they should", () => {
  it("each French page declares an English twin", () => {
    for (const slug of FRENCH_ROUTES) {
      const src = readFileSync(join(ROOT, "app", "fr", slug, "page.tsx"), "utf8");
      // Quoted or not — this asserts the alternate EXISTS, not how it is
      // punctuated. A style difference failing a reachability guard sends the
      // next person hunting for a missing tag that is right there.
      expect(src, `/fr/${slug} declares no English alternate`).toMatch(
        /["']?en(-US)?["']?\s*:/,
      );
    }
  });

  it("no English page claims a French twin that does not exist", () => {
    // A one-way or dangling hreflang is silently ignored by Google, which is
    // the worst kind of broken: nothing reports it.
    const claimed = new Set<string>();
    for (const f of NON_FRENCH) {
      for (const m of readFileSync(f, "utf8").matchAll(/"\/fr\/([a-z-]+)"/g)) {
        claimed.add(m[1]);
      }
    }
    const dangling = [...claimed].filter((s) => !FRENCH_ROUTES.includes(s));
    expect(dangling, `these /fr/ URLs are linked but have no page`).toEqual([]);
  });
});
