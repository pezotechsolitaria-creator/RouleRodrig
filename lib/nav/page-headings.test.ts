import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// ── Four indexed pages had no <h1> at all ───────────────────────────────────
//
// Measured against the LIVE HTML, which is the only way it could have been
// found: /faq, /trip-planner, /map and /emergency each rendered their own
// title as a giant <h2> and shipped no h1 anywhere in the document.
//
// /faq is the instructive one. app/faq/page.tsx DOES contain an h1 — inside
// the branch that renders when there are no questions. So the source read
// correctly, grep found an h1, and every real visit served a page without one.
// A heading check that reads the source and not the output is a check that
// agrees with the bug.
//
// These are cheap, permanent on-page signals: one h1 naming the subject. They
// are asserted here because nothing else in the build can notice their absence
// — a page with no h1 type-checks, renders and looks completely normal.

/** Components that ARE their page, so their title must be the h1. */
const PAGE_TITLE_COMPONENTS = [
  "components/Faq.tsx",
  "components/MapSection.tsx",
  "components/TripPlanner.tsx",
];

describe("a page's own title is an h1", () => {
  for (const file of PAGE_TITLE_COMPONENTS) {
    it(`${file} leads with an h1`, () => {
      const src = read(file);
      // The page title is the one carrying the oversized clamp; find that
      // element and check its tag, rather than counting h1s anywhere.
      // Matched, not sliced at a fixed width: this repo checks out as CRLF, so
      // `src.slice(at, at + 4)` returned "<h1\r" and failed on a file that was
      // already correct.
      const m = src.match(/<(h[12])\b[\s\S]{0,200}?clamp\(3[24]px, 7vw/);
      expect(m, "the page-title heading moved — update this test").not.toBeNull();
      expect(m![1]).toBe("h1");
    });
  }

  it("/emergency states what it is", () => {
    // Its first heading used to be "Rodrigues Tourism Office", a section well
    // down the page. UsefulNumbers renders no heading of its own.
    const page = read("app/emergency/page.tsx");
    expect(page).toMatch(/<h1[\s\S]{0,200}Emergency/);
  });
});

describe("promoting them cannot create a second h1", () => {
  it("each of those components is used by exactly one route", () => {
    // The reason this was safe. If one of them is ever reused as a SECTION of
    // another page, that page gets two h1s and this test should stop it.
    const roots = ["app", "components"];
    for (const file of PAGE_TITLE_COMPONENTS) {
      const name = file.split("/").pop()!.replace(".tsx", "");
      const users: string[] = [];
      const walk = (dir: string) => {
        for (const entry of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
          const p = `${dir}/${entry.name}`;
          if (entry.isDirectory()) walk(p);
          else if (/\.tsx$/.test(entry.name) && p !== file && !/\.test\./.test(entry.name)) {
            if (new RegExp(`<${name}[\\s/>]`).test(read(p))) users.push(p);
          }
        }
      };
      roots.forEach(walk);
      expect(users, `${name} is rendered in more than one place: ${users.join(", ")}`).toHaveLength(1);
    }
  });
});
