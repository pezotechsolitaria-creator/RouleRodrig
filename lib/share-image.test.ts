import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SHARE_IMAGE_URL, ogImages, twitterImages } from "./share-image";

// ── A BLANK CARD IS A SILENT FAILURE ────────────────────────────────────────
//
// Next.js does NOT deep-merge `openGraph`. A page exporting
// `openGraph: { title, description }` REPLACES the root layout's whole block,
// images included — so the page keeps its words and silently loses its
// picture. The build passes, the page renders, and the only symptom is a grey
// rectangle in somebody else's WhatsApp.
//
// Twelve public routes were in that state. This walks every one of them and
// fails if it happens again.

const ROOT = process.cwd();
const APP = join(ROOT, "app");

/** Routes nobody shares: signed-in consoles, callbacks, token landings. */
const PRIVATE = /[/\\](admin|merchant|kitchen|driver|driver-home|organizer|account|errands|auth|api)[/\\]/;

function metadataFiles(dir = APP, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      metadataFiles(full, out);
    } else if (/^(page|layout)\.tsx$/.test(entry)) {
      const rel = relative(ROOT, full).replace(/\\/g, "/");
      if (!PRIVATE.test(`/${rel}/`)) out.push(rel);
    }
  }
  return out;
}

const FILES = metadataFiles();

/** The body of the first `key: { ... }` object literal, brace-matched. */
function blockOf(src: string, key: string): string | null {
  const at = src.indexOf(`${key}:`);
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  // `twitter: { card: ... }` on one line still starts with a brace; a
  // `twitter: someVar` does not, and is not ours to judge.
  if (open < 0 || src.slice(at + key.length + 1, open).trim() !== "") return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return null;
}

describe("every shareable page has a picture on its card", () => {
  it("finds the public routes at all", () => {
    // A tripwire: an empty file list makes every assertion below vacuous,
    // which is how a walker with a wrong root reports success.
    expect(FILES.length).toBeGreaterThan(40);
    expect(FILES).toContain("app/page.tsx");
    expect(FILES).toContain("app/faq/page.tsx");
  });

  it("no openGraph block drops the image it inherited", () => {
    const blind = FILES.filter((f) => {
      const block = blockOf(readFileSync(join(ROOT, f), "utf8"), "openGraph");
      return block !== null && !block.includes("images");
    });
    expect(blind).toEqual([]);
  });

  it("no twitter block drops it either", () => {
    const blind = FILES.filter((f) => {
      const block = blockOf(readFileSync(join(ROOT, f), "utf8"), "twitter");
      return block !== null && !block.includes("images");
    });
    expect(blind).toEqual([]);
  });

  it("the ones that were blind now read the shared helper", () => {
    // Named, so a regression says which page went dark rather than just
    // "a page did".
    for (const f of [
      "app/about/page.tsx", "app/curated/page.tsx", "app/faq/page.tsx",
      "app/guide/page.tsx", "app/map/page.tsx", "app/trip-planner/page.tsx",
      "app/fr/page.tsx", "app/fr/taxi-rodrigues/page.tsx",
      "app/fr/hebergement-rodrigues/page.tsx", "app/fr/manger-a-rodrigues/page.tsx",
      "app/list-your-scooter/layout.tsx", "app/taxi/layout.tsx",
    ]) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).toContain("ogImages()");
    }
  });
});

describe("the card itself", () => {
  it("is an absolute URL, because a scraper has no page to resolve against", () => {
    expect(SHARE_IMAGE_URL).toMatch(/^https?:\/\//);
    expect(SHARE_IMAGE_URL).toMatch(/\.(jpg|jpeg|png)$/);
  });

  it("states its dimensions, so a scraper can crop without fetching first", () => {
    const [img] = ogImages();
    expect(img.width).toBe(1200);
    expect(img.height).toBe(630);
    expect(img.alt.length).toBeGreaterThan(20);
  });

  it("gives twitter the bare URL shape it wants", () => {
    expect(twitterImages()).toEqual([SHARE_IMAGE_URL]);
  });
});
