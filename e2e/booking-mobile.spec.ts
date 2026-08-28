import { test, expect, devices } from "@playwright/test";

// ── THE BOOKING SCREEN, AT THE WIDTH PEOPLE ACTUALLY BOOK FROM ──────────────
//
// The mobile price bar shipped `aria-hidden="true"` and `pointer-events-none`
// on its whole container, which made the only thumb-reachable thing on the
// booking screen a picture of a price. On the one flow with proven revenue, on
// the device tourists use, there was nothing to press — and nothing could have
// caught it, because playwright.config.ts declared a single Desktop Chrome
// project and this site had never been rendered at phone width in CI.
//
// These assert the two properties that regression would silently break: the bar
// appears once a price exists, and its button really submits the form it is
// detached from (it lives in a portal on document.body and reaches the form
// through form="rr-booking-form").

test.use({ ...devices["Pixel 7"] });

test.describe("booking on a phone", () => {
  test("the price bar is not present before a price exists", async ({ page }) => {
    await page.goto("/browse/scooter");
    // No vehicle and no dates chosen, so there is nothing to price and the bar
    // must not be occupying the bottom of a small screen.
    await expect(page.locator('button[form="rr-booking-form"]')).toHaveCount(0);
  });

  test("the bar's button is tappable, focusable and submits the form", async ({ page }) => {
    await page.goto("/browse/scooter#booking");

    // Choose the first real vehicle. The <select> is the first field of the
    // form and the one that unlocks pricing.
    const vehicle = page.locator("#rr-booking-form select").first();
    await expect(vehicle).toBeVisible();
    const value = await vehicle
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    test.skip(!value, "No bookable vehicle in this environment");
    await vehicle.selectOption(value!);

    // Pick a date so priceBreakdown() has days to work with. The calendar
    // renders enabled day buttons; the first one that is not disabled is the
    // earliest bookable day.
    const day = page
      .locator("#rr-booking-form button:not([disabled])")
      .filter({ hasText: /^\d{1,2}$/ })
      .first();
    if (await day.count()) await day.click();

    const bar = page.locator('button[form="rr-booking-form"]');
    await expect(bar).toBeVisible();

    // The whole point: it must accept a tap. A pointer-events-none ancestor
    // makes this fail, which is exactly the bug that shipped.
    await expect(bar).toBeEnabled();
    await bar.focus();
    await expect(bar).toBeFocused();

    // Submitting with the rest of the form empty must surface the form's own
    // validation rather than doing nothing — proving the button is really wired
    // to the form across the portal boundary.
    await bar.click();
    await expect(page.locator("#rr-booking-form")).toBeVisible();
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 10_000 });
  });

  test("the figures are hidden from screen readers, the button is not", async ({ page }) => {
    await page.goto("/browse/scooter#booking");
    const vehicle = page.locator("#rr-booking-form select").first();
    const value = await vehicle
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    test.skip(!value, "No bookable vehicle in this environment");
    await vehicle.selectOption(value!);
    const day = page
      .locator("#rr-booking-form button:not([disabled])")
      .filter({ hasText: /^\d{1,2}$/ })
      .first();
    if (await day.count()) await day.click();

    const bar = page.locator('button[form="rr-booking-form"]');
    await expect(bar).toBeVisible();
    // The duplicated total/deposit are announced by the summary <dl>; repeating
    // them would be noise. The control must stay reachable.
    const hiddenFigures = page.locator('[aria-hidden="true"]', {
      has: page.locator("text=/Rs/"),
    });
    expect(await hiddenFigures.count()).toBeGreaterThan(0);
    await expect(bar).not.toHaveAttribute("aria-hidden", "true");
  });
});
