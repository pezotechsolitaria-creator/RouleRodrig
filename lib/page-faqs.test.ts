import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT, type RecommendedPlace } from "@/lib/defaults";
import { BLOG_POSTS } from "@/lib/blog";
import { RODRIGUES_KNOWLEDGE } from "@/lib/rodrigues-knowledge";
import { ileAuxCocosBooking } from "@/lib/ile-aux-cocos-listing";
import { SITE_URL } from "@/lib/site";
import {
  blogFaq,
  cocosFaq,
  KNOWLEDGE_TITLES,
  RODRIGUAN_FOOD_FAQ,
  rodriguesGuideFaq,
  type PageFaq,
} from "./page-faqs";

// ── THE MODULE SAYS WHAT THE PAGES SAY (architecture review 2026-09-30,
// items 6 and 8) ─────────────────────────────────────────────────────────────
//
// lib/page-faqs.ts exists so /llms-full.txt can quote the guide and blog FAQs
// in the pages' own words. That is only true while the pages and the module
// agree, so this renders each real page and reads its FAQPage back: the day a
// question changes on a page and not here (or here and not on the page), this
// fails — whichever side moved.
//
// The blog posts also carry the #organization node their byline points at.

const state = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => ({
    ...DEFAULT_CONTENT,
    recommended: { ...DEFAULT_CONTENT.recommended, items: state.items },
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: Record<string, unknown>) =>
    createElement("a", { href, className }, children as never),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
for (const m of [
  "@/components/AppPageHeader",
  "@/components/nav/HubBacklink",
  "@/components/Navbar",
  "@/components/ScrollProgress",
  "@/components/AskTiRouleButton",
]) {
  vi.doMock(m, () => ({ default: () => null }));
}

const COCOS = {
  id: "rec-cocos",
  category: "activity",
  name: "Île aux Cocos Excursion with Les Inséparables",
  description: "",
  image: "/x.jpg",
  priceNote: "Rs 1313/Person ",
} as RecommendedPlace;

beforeEach(() => {
  state.items = [];
});

type Node = Record<string, unknown>;
const nodes = (html: string): Node[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const p = JSON.parse(m[1]) as Node;
    return (p["@graph"] as Node[] | undefined) ?? [p];
  });
/** The page's FAQPage, as {q, a}, in its order. */
const faqOf = (html: string): PageFaq[] => {
  const page = nodes(html).find((n) => n["@type"] === "FAQPage");
  return ((page?.mainEntity ?? []) as { name: string; acceptedAnswer: { text: string } }[]).map(
    (q) => ({ q: q.name, a: q.acceptedAnswer.text }),
  );
};
const visible = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const renderPage = async (load: () => Promise<{ default: () => Promise<unknown> }>) =>
  renderToStaticMarkup((await (await load()).default()) as ReactElement);

describe("the island guide's questions", () => {
  it("are the ones /guide/rodrigues publishes and shows", async () => {
    const html = await renderPage(() => import("@/app/guide/rodrigues/page"));
    const faq = rodriguesGuideFaq();
    expect(faqOf(html)).toEqual(faq);
    const t = visible(html);
    for (const f of faq) {
      expect(t).toContain(f.q);
      expect(t).toContain(f.a);
    }
  });

  it("have a written title for every knowledge entry, never a slug", () => {
    for (const k of RODRIGUES_KNOWLEDGE) expect(KNOWLEDGE_TITLES[k.id], k.id).toBeTruthy();
  });
});

describe("the Île aux Cocos questions", () => {
  for (const [label, items] of [
    ["with the excursion listed", [COCOS]],
    ["with no listing", []],
  ] as const) {
    it(`are the ones /guide/ile-aux-cocos publishes and shows, ${label}`, async () => {
      state.items = [...items];
      const html = await renderPage(() => import("@/app/guide/ile-aux-cocos/page"));
      const faq = cocosFaq(ileAuxCocosBooking([...items]));
      expect(faqOf(html)).toEqual(faq);
      const t = visible(html);
      for (const f of faq) expect(t).toContain(f.a);
    });
  }

  it("quote the listing's price, and no price without one", () => {
    const priced = cocosFaq(ileAuxCocosBooking([COCOS])).map((f) => f.a).join(" ");
    expect(priced).toContain(
      "The trip listed on Roule Rodrigues, Île aux Cocos Excursion with Les Inséparables, is Rs 1,313 per person.",
    );
    expect(cocosFaq(ileAuxCocosBooking([])).map((f) => f.a).join(" ")).not.toMatch(/Rs\s?\d/);
  });
});

describe("the Rodriguan food questions", () => {
  it("are the ones /guide/rodriguan-food publishes and shows", async () => {
    const html = await renderPage(() => import("@/app/guide/rodriguan-food/page"));
    expect(faqOf(html)).toEqual(RODRIGUAN_FOOD_FAQ);
    const t = visible(html);
    for (const f of RODRIGUAN_FOOD_FAQ) expect(t).toContain(f.a);
  });
});

describe("the blog posts", () => {
  const render = async (slug: string) => {
    const { default: Post } = await import("@/app/blog/[slug]/page");
    return renderToStaticMarkup((await Post({ params: Promise.resolve({ slug }) })) as ReactElement);
  };

  for (const post of BLOG_POSTS) {
    it(`${post.slug}: publishes exactly the question sections it shows`, async () => {
      const html = await render(post.slug);
      const faq = blogFaq(post);
      expect(faqOf(html)).toEqual(faq);
      const t = visible(html);
      for (const f of faq) expect(t).toContain(f.q);
    });

    it(`${post.slug}: defines the organisation its byline and publisher point at (item 6)`, async () => {
      const graph = nodes(await render(post.slug));
      const org = graph.find((n) => n["@type"] === "Organization");
      expect(org?.["@id"]).toBe(`${SITE_URL}/#organization`);
      expect(org?.name).toBe("Roule Rodrigues");
      const article = graph.find((n) => n["@type"] === "BlogPosting")!;
      const ids = new Set(graph.map((n) => n["@id"]));
      expect(ids.has((article.author as Node)["@id"])).toBe(true);
      expect(ids.has((article.publisher as Node)["@id"])).toBe(true);
      // Still the organisation: a named person needs the owner's consent.
      expect(JSON.stringify(graph)).not.toMatch(/"@type":"Person"/);
    });
  }

  it("at least one post has questions and one has none, so both branches ran", () => {
    expect(BLOG_POSTS.some((p) => blogFaq(p).length > 0)).toBe(true);
    expect(BLOG_POSTS.some((p) => blogFaq(p).length === 0)).toBe(true);
  });
});
