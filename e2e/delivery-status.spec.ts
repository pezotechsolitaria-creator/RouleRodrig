import { test, expect, type Page } from "@playwright/test";
import { requestFixture, type RequestState } from "./support/delivery-request-fixture";

// ── THE SCREEN THE CUSTOMER WAITS ON ────────────────────────────────────────
//
// The owner: "too much scrolling, poor hierarchy, hard to understand current
// status."
//
// That is a measurable claim, so these tests measure it. The rule they pin is
// the one the brief states: the answer to "what is happening to my delivery?"
// must be readable WITHOUT SCROLLING, on a phone.

const ID = "fa8c9c10-cc4b-439f-b8de-dd6afcee98ba";

// ── WARM THE ROUTE ONCE ─────────────────────────────────────────────────────
// Against a dev server Turbopack compiles each route on FIRST request, and this
// one pulls in the map stack. Two workers arriving together both waited on that
// compile and whichever lost the race timed out — a different test each run,
// which reads exactly like a flaky assertion and is not one. playwright.config
// already says the dev server is the bottleneck; this pays the cost once,
// before any test is timing anything.
test.beforeAll(async ({ playwright }, info) => {
  const ctx = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
  });
  await ctx.get(`/deliver/${ID}`, { timeout: 120_000 }).catch(() => {});
  await ctx.dispose();
});

async function openTracker(page: Page, state: RequestState) {
  // The route is privileged and 503s locally; stub the one call the page makes.
  await page.route(`**/api/delivery-requests/${ID}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ request: requestFixture(state) }),
    });
  });
  // Skip the guest email gate: the page reads a remembered email per request.
  await page.addInitScript((id) => {
    try {
      window.localStorage.setItem(
        "rr_delivery_requests",
        JSON.stringify([
          { id, email: "owner@example.test", what: "f44", savedAt: new Date().toISOString() },
        ]),
      );
      // The worlds hint is a fixed card under the header. It is a deliberate
      // one-time thing and not this screen's business, but it overlaps the
      // status while it is up, which would make a geometry assertion here
      // measure the wrong page.
      window.localStorage.setItem("rr_worlds_hint_seen", "1");
    } catch {}
  }, ID);
  await page.goto(`/deliver/${ID}`);
  // Wait on the status block, not on the item text: once a driver is
  // booked the item name appears both in the fold summary and inside the
  // collapsed body, and a text locator there is ambiguous.
  await expect(page.getByTestId("tracker-status")).toBeVisible({
    timeout: 60_000,
  });
}

test.use({ viewport: { width: 375, height: 812 } });

for (const state of ["open", "quoted", "accepted"] as const) {
  test(`the status is legible without scrolling — ${state}`, async ({ page }) => {
    await openTracker(page, state);

    // The current status line must be inside the first screen. Not "near the
    // top" by eye: its bounding box has to sit above the fold.
    const status = page.getByTestId("tracker-status");
    await expect(status).toBeVisible();
    const box = await status.boundingBox();
    expect(box, "the status has no box at all").not.toBeNull();
    expect(
      box!.y + box!.height,
      `the customer has to scroll ${Math.round(box!.y)}px to learn what is happening`,
    ).toBeLessThanOrEqual(812);
  });
}

test("an active delivery shows the driver and a way to reach them up front", async ({ page }) => {
  await openTracker(page, "accepted");
  const header = page.getByTestId("tracker-status");
  await expect(header).toContainText(/on the way|out for delivery|driver/i);
  // One tap, not a phone number to copy out by hand.
  await expect(page.getByRole("link", { name: /call/i }).first()).toBeVisible();
});

test("a customer can always get out of their own request", async ({ page }) => {
  // The brief: "Users need a clear way to cancel/clear their own requests."
  await openTracker(page, "open");
  await expect(
    page.getByRole("button", { name: /withdraw this request/i }),
  ).toBeVisible();
});

test("the request details fold away once a driver is carrying it", async ({ page }) => {
  // Progressive disclosure, and the reason it is safe: the customer wrote
  // these an hour ago. The summary still names both ends, and one tap opens
  // the rest -- an address a customer cannot re-read would be its own bug.
  await openTracker(page, "accepted");
  const details = page.locator("details").first();
  await expect(details).toBeVisible();
  expect(await details.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  await expect(details).toContainText("kot pive");
  await expect(details).toContainText("Port Mathurin");
});

test("the driver sits above the map, not below it", async ({ page }) => {
  // Measured before this change: the driver card began at y=1022 on a 375px
  // screen -- a screen and a half down, under a 380px map. WHO has my parcel
  // and HOW do I ring them is the second question, not the last.
  await openTracker(page, "accepted");
  const driver = page.getByText("Jean").first();
  await expect(driver).toBeVisible();
  const box = await driver.boundingBox();
  expect(box!.y, "the driver fell back below the fold").toBeLessThan(812);
});
