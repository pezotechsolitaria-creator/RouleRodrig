import { test, expect } from "@playwright/test";

// ── THE REPORTED BUG: "IT WAS NOT LOADING THE PAGES" ────────────────────────
//
// Both navigation fallbacks in public/sw.js ended `|| cache.match(SHELL)`, and
// SHELL is "/". Any navigation whose fetch threw was answered with the CACHED
// HOMEPAGE under the requested URL, and Next then corrected the location to
// "/". A customer opening their delivery link landed on the front page.
//
// This drives the real service worker with the network genuinely cut, which is
// the only way to reach that branch. Against the code before the fix, the
// assertions below fail by finding the homepage.

const DEEP = "/deliver/fa8c9c10-cc4b-439f-b8de-dd6afcee98ba";

// Compile both routes once before anything is timed. Against a dev server
// Turbopack builds each route on first request, and this spec then cuts the
// network — a route that has never been compiled cannot be fetched at all, so
// the warmup is part of the setup, not a workaround for slowness.
test.beforeAll(async ({ playwright }, info) => {
  const ctx = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
  });
  for (const path of ["/", DEEP]) {
    await ctx.get(path, { timeout: 120_000 }).catch(() => {});
  }
  await ctx.dispose();
});

test("a deep link on a dead connection does not become the homepage", async ({
  page,
  context,
}) => {
  // 1. A normal visit, so the worker installs and the shell is cached — the
  //    precondition for the bug, not a workaround for it.
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, {
    timeout: 60_000,
  });

  // 2. The connection drops. This is a bad minute on mobile data, not an
  //    exotic state — and it is exactly what a cold start looks like too.
  await context.setOffline(true);

  // 3. The customer opens their delivery link.
  const res = await page.goto(DEEP).catch(() => null);

  const body = (await page.textContent("body")) ?? "";

  // The bug: the homepage, served under the delivery's URL.
  expect(body, "the service worker served the homepage for another URL")
    .not.toContain("Explore Rodrigues");
  expect(page.url(), "the location was rewritten to the homepage").toContain(
    "/deliver/",
  );

  // What it should say instead.
  expect(body).toContain("No connection");
  expect(res?.status()).toBe(503);

  // And the way back is to THEIR page, not to the front page.
  const retry = page.getByRole("link", { name: /try again/i });
  await expect(retry).toBeVisible();
  expect(await retry.getAttribute("href")).toContain("/deliver/");

  await context.setOffline(false);
});

test("the homepage itself still works offline", async ({ page, context }) => {
  // The guard must not have gone too far: "/" is the one URL the shell IS the
  // right answer for, and losing that would trade one bug for another.
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, {
    timeout: 60_000,
  });
  await context.setOffline(true);
  await page.goto("/").catch(() => null);
  const body = (await page.textContent("body")) ?? "";
  expect(body).not.toContain("No connection");
  await context.setOffline(false);
});
