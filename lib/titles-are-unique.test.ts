import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOG_POSTS } from "./blog";

// ── TWO PAGES, ONE TITLE, ONE QUERY ─────────────────────────────────────────
//
// /browse/getting-around and /blog/how-to-get-around-rodrigues both served
//
//   How to Get Around Rodrigues Island | Roule Rodrigues
//
// word for word. Google picks one and suppresses the other, and the two pages
// spend their authority competing rather than compounding — the site bidding
// against itself for a query it should own outright.
//
// They are not the same page and never were: the blog post ANSWERS the
// question, the browse page LISTS taxis, car hire and scooter hire with prices.
// Informational intent and transactional intent, one title between them.
//
// Found by crawling all 87 sitemap URLs and grouping by <title>. That crawl is
// not something a unit test can do, so this guards the two places titles are
// actually written instead.

const CATEGORY_PAGE = readFileSync(
  join(process.cwd(), "app/browse/[category]/page.tsx"),
  "utf8",
);

/** The `title:` values in the META / PLACE_SLUGS maps. */
function categoryTitles(): string[] {
  return [...CATEGORY_PAGE.matchAll(/^\s{4}title: "([^"]+)",$/gm)].map((m) => m[1]);
}

/** Blog <title> values, minus the shared " | Roule Rodrigues" suffix. */
function blogTitles(): string[] {
  return BLOG_POSTS.map((p) => p.metaTitle.replace(/\s*\|\s*Roule Rodrigues\s*$/, "").trim());
}

describe("no two pages claim the same title", () => {
  it("a browse category never reuses a blog post's title", () => {
    const blog = new Set(blogTitles().map((t) => t.toLowerCase()));
    const clashes = categoryTitles().filter((t) => blog.has(t.toLowerCase()));

    expect(
      clashes,
      "these category titles are word-for-word a blog post's, so the two pages " +
        "compete for one query instead of covering two:\n" + clashes.join("\n"),
    ).toEqual([]);
  });

  it("the blog posts do not collide with each other", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const p of BLOG_POSTS) {
      const key = p.metaTitle.toLowerCase();
      if (seen.has(key)) dupes.push(`${p.metaTitle} — ${seen.get(key)} and ${p.slug}`);
      else seen.set(key, p.slug);
    }
    expect(dupes).toEqual([]);
  });

  it("the browse categories do not collide with each other", () => {
    const t = categoryTitles().map((x) => x.toLowerCase());
    expect(t.length).toBe(new Set(t).size);
  });
});

describe("getting-around took the transactional half", () => {
  it("no longer uses the blog's phrase", () => {
    expect(CATEGORY_PAGE).not.toMatch(/title: "How to Get Around Rodrigues Island"/);
  });

  it("names what the page actually lists", () => {
    expect(CATEGORY_PAGE).toContain('title: "Taxi, Car & Scooter Hire in Rodrigues"');
  });

  it("still fits a search result once the brand suffix is added", () => {
    // pageMeta() appends " | Roule Rodrigues" — 18 characters that have to be
    // budgeted for, which is how the 65-character titles on this site happened.
    const full = "Taxi, Car & Scooter Hire in Rodrigues | Roule Rodrigues";
    expect(full.length).toBeLessThanOrEqual(60);
  });

  it("leaves the blog post owning the question", () => {
    const post = BLOG_POSTS.find((p) => p.slug === "how-to-get-around-rodrigues");
    expect(post?.metaTitle).toContain("How to Get Around Rodrigues Island");
  });
});
