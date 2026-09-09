import { test, expect, type Page } from "@playwright/test";

// ── THE CAR PAGE WAS A 404 FOR AS LONG AS NOBODY LOOKED ─────────────────────
//
// Found 2026-09-09 while starting an SEO pass. https://roulerodrig.com/browse/car
// answered **HTTP 200**, with the correct <title> ("Car Rental in Rodrigues
// Island, Mauritius | Roule Rodrigues") — and a body reading:
//
//     ERROR 404 · Lost on the island? · This page doesn't exist.
//
// A soft 404, which is the worst shape of this bug: the status says fine, the
// title says fine, and only the rendered body says otherwise. Meanwhile the
// homepage's "Cars → Explore" tile linked to it, /sitemap.xml submitted it to
// Google, and the French car page, the viewpoints guide and two blog posts all
// pointed at it.
//
// The cause was one boolean — `vehicleCategories[car].enabled` was false in
// site_content, while five cars sat in the fleet — and the page's
// `notFound()` fired on a category the rest of the site was advertising.
//
// NOTHING WOULD HAVE CAUGHT IT. Not tsc, not the unit suite, not a status-code
// check, not a title check. Only rendering the page and reading it. So that is
// what this does, on the two pages the business actually sells from.
//
// Runs against whatever E2E_BASE_URL / E2E_PORT points at, so it works locally
// and against production.

const MONEY_PAGES = ["/browse/scooter", "/browse/car"] as const;

async function body(page: Page): Promise<string> {
  const main = page.locator("main").first();
  const text = (await main.count())
    ? await main.innerText()
    : await page.locator("body").innerText();
  return text.replace(/\s+/g, " ").trim();
}

test.use({ viewport: { width: 375, height: 812 } });

for (const path of MONEY_PAGES) {
  test(`${path} is a real page, not a soft 404`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} did not answer 200`).toBe(200);

    // Give the client render a moment: the failure mode here was SSR shell +
    // a client-rendered 404, which a DOM-only assertion would have missed.
    await page.waitForTimeout(2500);
    const text = await body(page);

    expect(text, `${path} rendered the 404 page under a 200`).not.toMatch(
      /Lost on the island|This page doesn't exist/i,
    );
  });

  test(`${path} has a heading and a price`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // An H1 is what a category page IS. /browse/car had none at all.
    const h1 = page.locator("h1").first();
    await expect(h1, `${path} has no h1`).toBeVisible();
    expect((await h1.innerText()).trim().length).toBeGreaterThan(3);

    // And the price is the whole transactional point. The August audit's
    // finding was "money pages thin with no prices in rendered text", and a
    // searcher on "car rental Rodrigues" who lands on a page with no number
    // leaves. Rendered text, not JSON-LD — a price only a crawler can see does
    // not sell anything.
    const text = await body(page);
    expect(text, `${path} shows no price to a visitor`).toMatch(/Rs\s?[0-9]/);
  });
}

test("the homepage does not link to a dead category", async ({ page }) => {
  // The link that made the 404 expensive rather than merely wrong: it was on
  // the homepage, so Google followed it from the strongest page on the site.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const hrefs = await page
    .locator('a[href^="/browse/"]')
    .evaluateAll((els) =>
      Array.from(new Set(els.map((e) => e.getAttribute("href") ?? ""))),
    );
  expect(hrefs.length, "no browse links on the homepage at all").toBeGreaterThan(0);

  for (const href of hrefs) {
    const res = await page.request.get(href);
    expect(res.status(), `${href} is linked from the homepage`).toBe(200);
    // A status check ALONE would have passed all through this bug: the soft
    // 404 answered 200. So read what the page actually says as well.
    expect(
      await res.text(),
      `${href} is linked from the homepage and renders the 404 page`,
    ).not.toMatch(/This page doesn't exist/i);
  }
});
