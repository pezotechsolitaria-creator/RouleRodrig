import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT, type RecommendedPlace, type SiteContent } from "@/lib/defaults";
import { SHEET } from "@/test/transfer-sheet.fixture";
import { BLOG_POSTS } from "@/lib/blog";
import { GUIDE_PAGES } from "@/lib/nav/hubs";
import {
  blogFaq,
  RODRIGUAN_FOOD_FAQ,
  rodriguesGuideFaq,
} from "@/lib/page-faqs";
import { buildLlmsFullTxt, buildLlmsTxt, unreadLlmsData, type LlmsData } from "./llms-txt";

// ── llms-full.txt CARRIES THE GUIDE AND BLOG FAQs (architecture review
// 2026-09-30, item 8) ────────────────────────────────────────────────────────
//
// The file is "every FAQ the site renders", and four sets were missing: the
// island guide's knowledge questions, Île aux Cocos, Rodriguan food and the
// blog's question sections. They now come from lib/page-faqs.ts, the module
// the pages render them from (lib/page-faqs.test.ts holds the pages to it).
//
// Built from a fixture whose figures are not the live ones. The rule the file
// already lives by holds for these too: a typed Rs figure is a remembered one,
// so an answer carrying one is dropped, and the only figure these sections may
// print is the Île aux Cocos listing's own price.

const U = "https://roulerodrig.com";

const place = (p: Partial<RecommendedPlace>) =>
  ({ description: "", image: "/x.jpg", ...p }) as RecommendedPlace;

const COCOS = place({
  id: "c1",
  category: "activity",
  name: "Île aux Cocos Excursion with Les Inséparables",
  priceNote: "Rs 1313/Person ",
});

function data(items: RecommendedPlace[]): LlmsData {
  const content: SiteContent = {
    ...DEFAULT_CONTENT,
    fleet: [{ ...DEFAULT_CONTENT.fleet[0], id: "t", category: "scooter", price: "Rs 777" }],
    recommended: { ...DEFAULT_CONTENT.recommended, enabled: true, items },
    mapLocations: [],
  };
  return { siteUrl: U, content, fares: { airport: SHEET, ferry: null }, food: null, eventsOnSale: false };
}

const FULL = buildLlmsFullTxt(data([COCOS]));

/** The body of the `## title` section, up to the next one. */
function section(txt: string, title: string): string {
  const at = txt.indexOf(`\n## ${title}\n`);
  if (at < 0) return "";
  const next = txt.indexOf("\n## ", at + 1);
  return txt.slice(at, next < 0 ? undefined : next);
}
/** A guide's section title: its name on the /guide hub, without a count. */
const titleOf = (href: string) =>
  GUIDE_PAGES.find((g) => g.href === href)!.title.replace(/^(Les|The) \d+ /, "$1 ");
const questions = (body: string) => [...body.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
const figures = (s: string) =>
  [...s.matchAll(/Rs\s?(\d{1,3}(?:[ ,  ]\d{3})+|\d+)/g)].map((m) => Number(m[1].replace(/\D/g, "")));

describe("the island guide's questions", () => {
  const body = section(FULL, titleOf("/guide/rodrigues"));

  it("sit under the page that shows them", () => {
    expect(body).toContain(`Source: ${U}/guide/rodrigues`);
  });

  it("are every question on the page whose answer carries no typed price", () => {
    const kept = rodriguesGuideFaq().filter((f) => !/Rs\s?\d/.test(f.a));
    expect(questions(body)).toEqual(kept.map((f) => f.q));
    for (const f of kept) expect(body).toContain(f.a);
  });

  it("leave out the budget estimate: its rupees are a remembered figure", () => {
    const budget = rodriguesGuideFaq().find((f) => f.q === "How much does a trip to Rodrigues cost?")!;
    expect(budget.a).toMatch(/Rs\s?\d/);
    expect(FULL).not.toContain(budget.a);
    expect(FULL).not.toContain("### How much does a trip to Rodrigues cost?");
  });
});

describe("the Île aux Cocos questions", () => {
  it("quote the listing's own price, the one figure they may print", () => {
    const body = section(FULL, titleOf("/guide/ile-aux-cocos"));
    expect(body).toContain(`Source: ${U}/guide/ile-aux-cocos`);
    expect(questions(body)).toHaveLength(6);
    expect(body).toContain("is Rs 1,313 per person.");
    expect(figures(body)).toEqual([1313]);
  });

  it("still answer the cost question, with no figure, when the listing is gone", () => {
    const body = section(buildLlmsFullTxt(data([])), titleOf("/guide/ile-aux-cocos"));
    expect(questions(body)).toContain("How much does the Île aux Cocos excursion cost?");
    expect(figures(body)).toEqual([]);
  });
});

describe("the Rodriguan food questions", () => {
  it("are all six, under /guide/rodriguan-food", () => {
    const body = section(FULL, titleOf("/guide/rodriguan-food"));
    expect(body).toContain(`Source: ${U}/guide/rodriguan-food`);
    expect(questions(body)).toEqual(RODRIGUAN_FOOD_FAQ.map((f) => f.q));
  });
});

describe("the blog's question sections", () => {
  for (const post of BLOG_POSTS) {
    const faq = blogFaq(post);
    it(`${post.slug}: ${faq.length ? "its questions, under its own URL" : "no section, having no questions"}`, () => {
      const body = section(FULL, post.title);
      if (!faq.length) {
        expect(body).toBe("");
        return;
      }
      expect(body).toContain(`Source: ${U}/blog/${post.slug}`);
      expect(questions(body)).toEqual(faq.filter((f) => !/Rs\s?\d/.test(f.a)).map((f) => f.q));
    });
  }
});

describe("where they go, and what a failed read leaves", () => {
  it("after the English experiences, before the French sections", () => {
    const exp = FULL.indexOf("\n## Experiences\n");
    const guide = FULL.indexOf(`\n## ${titleOf("/guide/rodrigues")}\n`);
    const fr = FULL.indexOf("\n## Le taxi à Rodrigues (en français)\n");
    expect(exp).toBeGreaterThan(-1);
    expect(guide).toBeGreaterThan(exp);
    expect(fr).toBeGreaterThan(guide);
  });

  it("an unread content row still carries the guides, and still no figure", () => {
    const full = buildLlmsFullTxt(unreadLlmsData(U));
    expect(section(full, titleOf("/guide/rodriguan-food"))).not.toBe("");
    expect(section(full, titleOf("/guide/ile-aux-cocos"))).not.toBe("");
    expect(figures(full)).toEqual([]);
  });
});

describe("llms.txt names /browse/activities by its own title", () => {
  it("'Activities in Rodrigues', no longer /experiences' 'Things to do'", () => {
    const txt = buildLlmsTxt(data([COCOS]));
    const line = txt.split("\n").find((l) => l.includes(`](${U}/browse/activities)`)) ?? "";
    expect(line.startsWith("- [Activities in Rodrigues]")).toBe(true);
    expect(txt).not.toMatch(/\[Things to do\]/);
  });
});
