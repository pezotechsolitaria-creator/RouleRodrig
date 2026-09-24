import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SITE_NAME } from "./site";

// ── THE SITE WAS PUBLISHING TWO BRANDS ──────────────────────────────────────
//
// A crawl of all 77 sitemap URLs on 24 Sep 2026 found 39 page titles reading
// "Roule Rodrigues" and 9 reading "Roulé Rodrigues". Nothing owned the string,
// so it had been hand-typed in 35 places and drifted.
//
// Unaccented is canonical, and not as a matter of taste: it is how the Google
// Business Profile is registered and what lib/schema.ts already publishes in
// the Organization node. A title that disagrees with the business's own listing
// splits the very entity that sameAs and hasMap were added to consolidate.
//
// The accented form is still welcome in VISIBLE prose — it reads better and it
// is how the island writes it. This guard covers titles and structured data
// only.

const SCHEMA = readFileSync(join(process.cwd(), "lib/schema.ts"), "utf8");

function pageFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pageFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("one brand, one spelling", () => {
  it("has a single owner for the string", () => {
    expect(SITE_NAME).toBe("Roule Rodrigues");
  });

  it("matches what the Organization schema publishes", () => {
    // These two disagreeing is the entity split, in its purest form.
    expect(SCHEMA).toContain(`name: "${SITE_NAME}"`);
  });

  it("no page title carries the accented form", () => {
    const offenders: string[] = [];
    for (const file of pageFiles(join(process.cwd(), "app"))) {
      // Push notifications are not a search surface and keep the accent
      // deliberately — it is what the owner sees on their own phone.
      if (file.includes(join("api", "admin", "push"))) continue;

      const src = readFileSync(file, "utf8");
      src.split(/\r?\n/).forEach((line, i) => {
        if (!/\bRoulé Rodrigues\b/.test(line)) return;
        if (!/^\s*(title|metaTitle)\s*:/.test(line) && !/\|\s*Roulé Rodrigues`/.test(line)) return;
        offenders.push(`${file.replace(process.cwd(), "")}:${i + 1}`);
      });
    }
    expect(
      offenders,
      "these publish a second brand spelling in a page title, splitting the " +
        "entity from the Google Business Profile:\n" + offenders.join("\n"),
    ).toEqual([]);
  });

  it("the experiences template uses the constant, not a literal", () => {
    // It generates the title for six indexed pages, so a literal here is six
    // titles wrong at once — which is exactly how this happened.
    const src = readFileSync(
      join(process.cwd(), "app/experiences/[type]/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/\| \$\{SITE_NAME\}`/);
    expect(src).not.toMatch(/\| Roulé Rodrigues`/);
  });
});
