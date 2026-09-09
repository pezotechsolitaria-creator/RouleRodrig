import { test, expect } from "@playwright/test";

// ── THE PRICE WAS 1.4 SCREENS DOWN ──────────────────────────────────────────
//
// Measured on /browse/car/suzuki-swift-latest-gen at 393x852 (iPhone 15 Pro):
//
//   page height       3,816px = 4.5 screens
//   first price       y = 1,180
//   booking CTA       none above the fold; the only one at the very bottom
//   WhatsApp          y = 2,393
//
// A renter opens a car page to answer two questions — what does it cost, and
// how do I get it — and both needed scrolling.
//
// These assertions are geometric on purpose. A test that only asked whether a
// price EXISTS on the page passed the whole time it sat below the fold.

const VEHICLE = "/browse/car/suzuki-swift-latest-gen";
const FOLD = 852;

test.use({ viewport: { width: 393, height: FOLD } });

test("price and booking are reachable without scrolling", async ({ page }) => {
  await page.goto(VEHICLE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const bar = page.locator("a", { hasText: /^(Book|Check dates)$/ }).last();
  await expect(bar, "no sticky booking control").toBeVisible();

  const box = await bar.boundingBox();
  expect(box, "the booking control has no box").not.toBeNull();
  // Within the first screen WITHOUT having scrolled: the bar is fixed, so its
  // viewport-relative top is what a thumb can reach on load.
  expect(
    box!.y,
    "the booking control is below the fold on load",
  ).toBeLessThan(FOLD);
  // And a real touch target, not a 30px link.
  expect(box!.height, "touch target under 44px").toBeGreaterThanOrEqual(44);

  expect(await page.evaluate(() => window.scrollY), "the page auto-scrolled").toBe(0);
});

test("the price rides along with it", async ({ page }) => {
  await page.goto(VEHICLE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Scroll to the very bottom — the price must still be on screen, which is
  // the whole point of a sticky bar rather than a hero price.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);

  const priceInBar = page.locator("p", { hasText: /Rs\s?[0-9]/ }).last();
  await expect(priceInBar, "the price scrolled away").toBeInViewport();
});

test("it does not cover the tab bar", async ({ page }) => {
  // The bar sits ABOVE the tabs using BottomNav's own arithmetic. A flat 76px
  // would sit on top of them on a phone with a home indicator.
  await page.goto(VEHICLE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const nav = page.getByRole("navigation").last();
  const bar = page.locator("a", { hasText: /^(Book|Check dates)$/ }).last();
  const navBox = await nav.boundingBox();
  const barBox = await bar.boundingBox();
  if (!navBox) test.skip(true, "no tab bar at this width");
  expect(
    barBox!.y + barBox!.height,
    "the action bar overlaps the tab bar",
  ).toBeLessThanOrEqual(navBox!.y + 2);
});

test("only one FLOATING WhatsApp button", async ({ page }) => {
  // The floating FAB is suppressed here because the bar carries WhatsApp; two
  // of them 40px apart is a worse screen, not a better one.
  //
  // Counting every wa.me link on the page was the wrong rule and this test
  // caught me writing it: the footer's "Follow us on WhatsApp" is a social
  // link, a different thing from a booking CTA, and it belongs there. What
  // must not happen twice is a PINNED one.
  await page.goto(VEHICLE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const pinned = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="wa.me"]')].filter((a) => {
      let n: HTMLElement | null = a as HTMLElement;
      while (n) {
        if (getComputedStyle(n).position === "fixed") return true;
        n = n.parentElement;
      }
      return false;
    }).length,
  );
  expect(pinned, "two floating WhatsApp buttons on one screen").toBe(1);
});
