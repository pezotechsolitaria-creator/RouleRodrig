import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONTENT } from "./defaults";

// ── THE PROFILE AND THE WEBSITE ARE ONE BUSINESS ────────────────────────────
//
// A claimed Google Business Profile that nothing links to is an island of its
// own — the same fault the French pages had, in a different place. `sameAs` is
// what tells Google, and every AI engine reading the page, that the site and
// the Maps listing are the SAME entity rather than two with a similar name.
// On an island where businesses share surnames, that is not a safe inference
// for a machine to make unaided.
//
// The URL is owner-supplied in /admin and empty by default, deliberately: a
// guessed Maps link points sameAs at somebody else's business, which is worse
// than no link. Every other identity field in this file is empty for the same
// reason.

const PAGE = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
const ADMIN = readFileSync(join(process.cwd(), "app/admin/AdminDashboard.tsx"), "utf8");

describe("the profile URL is owner-supplied, never guessed", () => {
  it("ships empty", () => {
    expect(DEFAULT_CONTENT.social.google).toBe("");
  });

  it("is editable in admin with instructions for finding it", () => {
    expect(ADMIN).toContain("GOOGLE BUSINESS PROFILE URL");
    expect(ADMIN).toMatch(/setSocial\(\{ google: v \}\)/);
    // The owner has to know where to get it, or the field stays blank.
    expect(ADMIN).toMatch(/Share/);
  });
});

describe("it reaches the structured data", () => {
  it("goes into sameAs on the homepage graph", () => {
    expect(PAGE).toMatch(/const sameAs = \[\s*\n\s*content\.social\.google,/);
  });

  it("drops out cleanly when it is blank", () => {
    // filter(Boolean) on a trimmed string: an empty field must not emit "" into
    // sameAs, which would be an invalid URL in the markup.
    expect(PAGE).toMatch(/\.filter\(\(u\): u is string => Boolean\(u && u\.trim\(\)\)\)/);
  });

  it("also becomes hasMap, and only when set", () => {
    expect(PAGE).toMatch(/content\.social\.google\?\.trim\(\)\s*\n?\s*\? \{ hasMap:/);
  });
});

describe("what it deliberately still does not claim", () => {
  it("does not reintroduce invented coordinates", () => {
    // `geo` was removed on purpose: it carried Port Mathurin's point for a
    // business the same block says is in Baie aux Huîtres, and a precise point
    // contradicting the stated locality is worse than none. hasMap points at
    // the profile instead, so the listing stays the single source of truth for
    // where this business is.
    const business = PAGE.slice(PAGE.indexOf('addressLocality: addressLocality'));
    expect(business.slice(0, 2000)).not.toMatch(/geo:\s*\{/);
  });
});
