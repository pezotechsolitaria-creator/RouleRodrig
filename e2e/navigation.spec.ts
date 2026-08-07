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
  ["/merchant/login", "/"],
];

test.describe("back affordances go exactly one level up", () => {
  for (const [page, parent] of BACK_CHAIN) {
    test(`${page} → ${parent}`, async ({ page: pw }) => {
      await pw.goto(page);
      // The back affordance is an in-page anchor to the parent — the sticky
      // header link on shop pages, the inline arrow link elsewhere.
      const back = pw.locator(`a[href="${parent}"]`).first();
      await expect(back, `${page} must link back to ${parent}`).toBeVisible();
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
