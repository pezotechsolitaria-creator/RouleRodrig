import { test, expect } from "@playwright/test";

// ── Install app button ───────────────────────────────────────────────────────
//
// This button shipped completely broken and nothing caught it. It did nothing
// on every platform, for as long as it was live: the modal was portalled to
// <body> inside an <AnimatePresence>, and framer-motion silently discards
// portals (isValidElement() is false for REACT_PORTAL_TYPE). No error, no
// warning — the component's state said "open" while it rendered nothing.
//
// So these tests assert the two things that were actually wrong, plus the
// failure mode a careless fix would introduce:
//
//   1. Clicking it opens a modal a user can see.
//   2. Closing it REMOVES the overlay. A modal that fades out but never
//      unmounts leaves an invisible `fixed inset-0` layer with
//      pointer-events:auto across the viewport, which swallows every
//      subsequent click on the page. That is worse than the original bug and
//      it is invisible to a screenshot, so it is asserted behaviourally: after
//      closing, an ordinary link must still be clickable.
//
// The static counterpart lives in test/animatepresence-portal.test.ts, which
// fails the build if the portal pattern is reintroduced.

const INSTALL = 'button[aria-label="Install the app"]';
const MODAL_TEXT = "Add it to your home screen";

test.describe("install app button", () => {
  test("opens a modal with installation steps", async ({ page }) => {
    await page.goto("/");

    const trigger = page.locator(INSTALL).first();
    await expect(trigger).toBeVisible();
    // Nothing on screen before the click.
    await expect(page.getByText(MODAL_TEXT)).toHaveCount(0);

    await trigger.click();

    await expect(page.getByText(MODAL_TEXT)).toBeVisible();
    // exact: the desktop instructions also quote “Install Roule Rodrigues”
    // inside step 2, so a loose match resolves to two elements.
    await expect(page.getByText("Install Roule Rodrigues", { exact: true })).toBeVisible();
    // Three numbered steps, whichever platform was detected.
    await expect(page.locator("ol li")).toHaveCount(3);
  });

  test("the X removes the modal entirely", async ({ page }) => {
    await page.goto("/");
    await page.locator(INSTALL).first().click();
    await expect(page.getByText(MODAL_TEXT)).toBeVisible();

    await page.locator('button[aria-label="Close"]').click();

    // Detached, not merely transparent.
    await expect(page.getByText(MODAL_TEXT)).toHaveCount(0);
  });

  test("clicking the backdrop closes it", async ({ page }) => {
    await page.goto("/");
    await page.locator(INSTALL).first().click();
    await expect(page.getByText(MODAL_TEXT)).toBeVisible();

    // Top-left corner is backdrop on every viewport — the panel is centred or
    // bottom-anchored, never in the corner.
    await page.mouse.click(5, 5);

    await expect(page.getByText(MODAL_TEXT)).toHaveCount(0);
  });

  test("reopens after being closed", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator(INSTALL).first();

    await trigger.click();
    await expect(page.getByText(MODAL_TEXT)).toBeVisible();
    await page.locator('button[aria-label="Close"]').click();
    await expect(page.getByText(MODAL_TEXT)).toHaveCount(0);

    await trigger.click();
    await expect(page.getByText(MODAL_TEXT)).toBeVisible();
  });

  test("leaves nothing covering the page after closing", async ({ page }) => {
    // The regression that matters most, and the one a screenshot cannot see.
    // An overlay that animates to opacity 0 but never unmounts still has
    // pointer-events:auto over the whole viewport, so every subsequent click
    // on the site is swallowed.
    //
    // Counted structurally rather than by clicking a link: the homepage has
    // five different <a href="/explore">, one of which is a 2x2px decorative
    // wrapper, so "click the first link" is a coin toss rather than a test.
    const fullViewportBlockers = () =>
      page.evaluate(() =>
        [...document.body.querySelectorAll("*")].filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed" || cs.pointerEvents === "none") return false;
          const r = el.getBoundingClientRect();
          return r.width >= window.innerWidth && r.height >= window.innerHeight;
        }).length,
      );

    await page.goto("/");
    await page.locator(INSTALL).first().click();
    await expect(page.getByText(MODAL_TEXT)).toBeVisible();

    // While open there IS one, which proves the check can see an overlay at all.
    expect(await fullViewportBlockers()).toBeGreaterThan(0);

    await page.locator('button[aria-label="Close"]').click();
    await expect(page.getByText(MODAL_TEXT)).toHaveCount(0);

    expect(await fullViewportBlockers()).toBe(0);

    // And the page really does still take a click.
    await page.locator(INSTALL).first().click();
    await expect(page.getByText(MODAL_TEXT)).toBeVisible();
  });
});
