import { test, expect } from "@playwright/test";

// Minimal smoke tests — prove the app renders and the key journeys are wired.
test("homepage loads and shows the brand", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Roule Rodrigues/i);
});

test("explore page renders things to do", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("bottom nav does not mark Explore active on a browse page", async ({ page }) => {
  await page.goto("/browse/scooter");
  const explore = page.locator('nav[aria-label="Primary"] a[href="/explore"]');
  await expect(explore).toHaveCount(1);
  await expect(explore).not.toHaveAttribute("aria-current", "page");
});
