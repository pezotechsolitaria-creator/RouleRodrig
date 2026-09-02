import { test, expect } from "@playwright/test";

// ── Navigation logic audit (2026-08-08) ─────────────────────────────────────
// Two invariants, born from a real complaint ("some go back buttons are
// illogical", "too many clicks to see the other shops again"):
//
//  1. BACK GOES ONE LEVEL UP. A child page's in-page back affordance points at
//     its parent, not at home or an unrelated page. The marketplace chain is
//     asserted target-by-target.
//  2. NO DEAD LINKS. Every internal href reachable from the public pages
//     resolves under 400. A link that 404s is a dead end no design survives.

const STORE = "/shop/m4-test-shop-ffa411a9";
const PRODUCT = `${STORE}/m4-test-product`;

// page → the href its back affordance must carry
const BACK_CHAIN: [string, string][] = [
  ["/shop", "/"],
  [STORE, "/shop"],
  [PRODUCT, STORE],
  ["/cart", "/shop"],
  ["/login", "/"],
  // Changed deliberately when the back arrows stopped being links to "/".
  // /merchant/login is reached from the recruitment page that sells the idea
  // of listing a scooter, and that is where somebody with no history belongs —
  // "/" was never a considered parent here, it was the hardcoded default every
  // one of these controls carried.
  ["/merchant/login", "/list-your-scooter"],
];

// The two marketplace legs point at a SEEDED fixture shop, and that shop is
// currently stores.is_test = true + status = 'draft' — deliberately hidden, so
// the pages 404 and there is no back link to find. That is the data being
// correct, not the navigation being broken, so these legs skip with the reason
// stated instead of failing every run and training everyone to ignore red.
//
// Re-check rather than hardcode: the moment the shop is published again, these
// assertions come back on their own.
// Visibility is decided from the DIRECTORY, not from the shop page's status
// code. A hidden shop still answers 200 — the page is a client-rendered shell —
// so res.ok() proved nothing. Whether /shop links to it is the real signal, and
// it is a different page making a different assertion, so this is not the
// tautology of asking the page under test whether it works.
async function fixtureShopIsListed(pw: import("@playwright/test").Page) {
  await pw.goto("/shop");
  return (await pw.locator(`a[href="${STORE}"]`).count()) > 0;
}

test.describe("back affordances go exactly one level up", () => {
  for (const [page, parent] of BACK_CHAIN) {
    test(`${page} → ${parent}`, async ({ page: pw }) => {
      if (page.startsWith(STORE)) {
        test.skip(!(await fixtureShopIsListed(pw)), `${STORE} is not listed on /shop (is_test/draft fixture shop)`);
      }
      await pw.goto(page);
      // ── TWO SHAPES OF THE SAME AFFORDANCE ────────────────────────────────
      // It used to be only an anchor carrying the parent's href. Pages now
      // use <BackLink>, which goes to the real previous page when there is
      // one and to a declared fallback when there is not — a button, with no
      // href to find.
      //
      // Matching ONLY an anchor made this test lie in both directions: it
      // failed on /login and /merchant/login, where the anchor had gone, and
      // it passed vacuously on /cart, where the back control is a button and
      // the anchor it found was an unrelated "Browse products" tile that
      // happens to point at /shop.
      //
      // So look for the control that actually claims the parent, in either
      // shape, and require exactly that.
      const back = pw
        .locator(`a[href="${parent}"], [data-back-fallback="${parent}"]`)
        .first();
      await expect(back, `${page} must offer a way back to ${parent}`).toBeVisible();
    });
  }
});

const PUBLIC_PAGES = [
  "/",
  "/shop",
  STORE,
  PRODUCT,
  "/cart",
  "/login",
  "/explore",
  "/food",
  "/taxi",
  "/faq",
  "/more",
  "/emergency",
  "/blog",
  "/guide/rodrigues",
  "/guide/beaches",
  "/trip-planner",
  "/manage-booking",
  "/legal/terms",
  "/list-your-scooter",
];

// Never crawl into actions or externally-gated areas.
const SKIP = /^(\/api|\/admin|\/auth|\/merchant\/(?!login))/;

test("no public page links to a broken route", async ({ page, request }) => {
  test.setTimeout(240_000);
  const checked = new Map<string, number>();
  const failures: string[] = [];

  for (const path of PUBLIC_PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} itself must load`).toBeLessThan(400);

    const hrefs = await page.$$eval("a[href^='/']", (as) =>
      [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || ""))],
    );
    for (const href of hrefs) {
      const clean = href.split("#")[0].split("?")[0];
      if (!clean || SKIP.test(clean) || checked.has(clean)) continue;
      const r = await request.get(clean, { maxRedirects: 5 });
      checked.set(clean, r.status());
      if (r.status() >= 400) failures.push(`${clean} → ${r.status()} (linked from ${path})`);
    }
  }

  expect(failures, `broken internal links:\n${failures.join("\n")}`).toHaveLength(0);
});

test("every non-home public page has an escape hatch", async ({ page }) => {
  test.setTimeout(120_000); // 18 sequential page visits
  for (const path of PUBLIC_PAGES.filter((p) => p !== "/")) {
    await page.goto(path);
    // At least one internal link that leads OFF this page (a back link, the
    // header logo, or the bottom nav) — a page with none is a dead end.
    const escape = page.locator("a[href^='/']").first();
    await expect(escape, `${path} has no way out`).toBeVisible();
  }
});
