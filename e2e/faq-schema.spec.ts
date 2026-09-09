import { test, expect, type Page } from "@playwright/test";

// ── FAQPage MARKUP FOR EIGHT QUESTIONS THE PAGE NEVER SHOWED ────────────────
//
// Measured on the live car page, 2026-09-09: both rental pages carried FAQPage
// structured data with eight Question entries, and the question text matched
// NEITHER innerText NOR innerHTML. It was not hidden — it was absent. The panel
// rendered a short label ("Minimum age") plus the first sentence of the answer,
// and the question itself existed only inside the JSON-LD.
//
// Google's policy is that the Q&A must be present on the page carrying the
// markup. Invalid FAQ markup earns nothing at best and a manual action at
// worst, and this was on the two pages the business sells from.
//
// The rule this pins is simple and is the one that was broken: EVERY question
// in the schema is readable on the page. Not "the block exists" — a test that
// only asked whether FAQPage was emitted would have passed the whole time.

const RENTAL_PAGES = ["/browse/scooter", "/browse/car"] as const;

type Faq = {
  "@type": string;
  mainEntity?: { name: string; acceptedAnswer?: { text?: string } }[];
};

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  const out: Record<string, unknown>[] = [];
  for (const r of raw) {
    try {
      const parsed: unknown = JSON.parse(r);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const o of arr) out.push(o as Record<string, unknown>);
    } catch {
      // A block that will not parse is itself a failure worth surfacing, but
      // it belongs to the validity test below rather than being swallowed here.
      out.push({ __unparseable: r.slice(0, 80) });
    }
  }
  return out;
}

test.use({ viewport: { width: 375, height: 812 } });

for (const path of RENTAL_PAGES) {
  test(`${path}: every FAQ question in the schema is on the page`, async ({
    page,
  }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const blocks = await jsonLd(page);
    expect(
      blocks.some((b) => b.__unparseable),
      "a JSON-LD block does not parse",
    ).toBe(false);

    const faq = blocks.find((b) => b["@type"] === "FAQPage") as Faq | undefined;
    expect(faq, `${path} emits no FAQPage`).toBeTruthy();

    const questions = faq?.mainEntity ?? [];
    expect(questions.length, "FAQPage with no questions").toBeGreaterThan(0);

    // textContent, not innerText. The original bug was that the question text
    // was absent from the DOM ALTOGETHER — it matched neither innerText nor
    // innerHTML — so this still catches it. innerText additionally depends on
    // layout, and measured against this page it disagreed with
    // getBoundingClientRect (30x153, visibility:visible, nothing display:none
    // in the ancestor chain) at 375px while agreeing at 1280px. An assertion
    // that flaky would get deleted the first time it cried wolf.
    const text = ((await page.locator("body").textContent()) ?? "").replace(
      /\s+/g,
      " ",
    );
    const missing = questions
      .map((q) => q.name)
      .filter((name) => !text.includes(name));

    expect(
      missing,
      `${path} claims questions it never renders: ${missing.join(" | ")}`,
    ).toEqual([]);

    // And the panel carrying them is really on the page, so "present in the
    // DOM" can never be satisfied by markup nobody can reach.
    const panel = page.getByText(questions[0].name, { exact: false }).first();
    await expect(panel, "the FAQ panel is not rendered").toBeVisible();
  });

  test(`${path}: vehicles carry a priced LeaseOut offer`, async ({ page }) => {
    // The rich-result payload for a rental page. Already correct when this was
    // written — pinned so it stays that way, because the price here and the
    // price in the grid come from the same fleet and must not drift apart.
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const blocks = await jsonLd(page);
    const graph = (blocks.find((b) => b["@graph"]) as
      | { "@graph": Record<string, unknown>[] }
      | undefined)?.["@graph"];
    expect(graph, `${path} emits no vehicle graph`).toBeTruthy();

    const vehicles = (graph ?? []).filter((n) =>
      ["Car", "Motorcycle", "Vehicle", "Product"].includes(String(n["@type"])),
    );
    expect(vehicles.length, "no vehicles in the graph").toBeGreaterThan(0);

    for (const v of vehicles) {
      const offer = v.offers as Record<string, unknown> | undefined;
      expect(offer, `${String(v.name)} has no offer`).toBeTruthy();
      expect(offer?.priceCurrency).toBe("MUR");
      // A rental is a lease, not a sale. Without this a Car + Offer reads as a
      // car for SALE at Rs 1,999, which is a very different rich result.
      expect(String(offer?.businessFunction)).toMatch(/LeaseOut/);
      expect(
        Number(offer?.price),
        `${String(v.name)} is offered at a non-positive price`,
      ).toBeGreaterThan(0);
    }
  });
}
