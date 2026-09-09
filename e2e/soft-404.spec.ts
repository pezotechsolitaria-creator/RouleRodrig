import { test, expect } from "@playwright/test";

// ── EVERY INVALID URL UNDER /browse AND /shop ANSWERED 200 ──────────────────
//
// Measured on production, 2026-09-09:
//
//   /this-page-does-not-exist-xyz        404   correct
//   /browse/nonsense                     200   "This page doesn't exist"
//   /browse/car/not-a-car                200   "This page doesn't exist"
//   /shop/definitely-not-a-store         200   "This page doesn't exist"
//   /shop/roule-test-shop/not-a-product  200   "This page doesn't exist"
//   /events/not-an-event                 404   correct
//   /guide/not-a-guide                   404   correct
//
// A soft 404: the status says the page is fine and only the body disagrees.
// Google treats these as a quality signal against the whole section, and they
// waste crawl budget on URLs that will never rank — on the two namespaces this
// business sells from.
//
// THE CAUSE was a `loading.tsx` in each of those segments. It opens a streaming
// Suspense boundary, so Next commits the 200 before the page body runs;
// `notFound()` can then only swap the UI, never the status. The three
// namespaces that behaved correctly were exactly the three with no loading.tsx.
//
// Proven by deleting the files and re-testing, which is what this pins. The
// merchant console keeps its skeleton: it is auth-gated and noindex, so there
// is no SEO cost there to pay a perceived-performance price for.

const SHOULD_404 = [
  "/browse/nonsense",
  "/browse/car/not-a-car",
  "/browse/scooter/not-a-scooter",
  "/shop/definitely-not-a-store",
  "/shop/roule-test-shop/not-a-product",
  // The three that were already right — they must stay right.
  "/events/not-an-event",
  "/guide/not-a-guide",
  "/this-page-does-not-exist-xyz",
];

// Pages that must keep answering 200. Deleting a loading.tsx must not take a
// real page down with it, and "everything 404s now" would also pass a
// carelessly written version of the test above.
const SHOULD_200 = ["/browse/car", "/browse/scooter", "/shop", "/"];

test.describe("no soft 404s on the indexable namespaces", () => {
  for (const path of SHOULD_404) {
    test(`${path} answers 404`, async ({ page }) => {
      const res = await page.request.get(path);
      expect(
        res.status(),
        `${path} answers ${res.status()} — a soft 404 if the body says otherwise`,
      ).toBe(404);
    });
  }

  for (const path of SHOULD_200) {
    test(`${path} still answers 200`, async ({ page }) => {
      const res = await page.request.get(path);
      expect(res.status(), `${path} broke`).toBe(200);
    });
  }
});
