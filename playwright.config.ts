import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests for the Roule Rodrigues site. Reuses a running dev server if
// one is already up (the in-app preview), otherwise starts `npm run dev`.
//
// PORT IS CONFIGURABLE, and that matters more than it looks. `reuseExistingServer`
// means Playwright attaches to whatever is already listening on the port — and
// when several git worktrees of this repo are open at once, that is very often
// a DIFFERENT worktree's server. The suite then passes or fails against code
// you are not editing, silently. It has already happened: a run reported
// "3 passed" for changes that were never loaded.
//
// So when testing a worktree, give it its own port:
//   E2E_PORT=3100 npx playwright test
// Or point at an already-running server (including production) with:
//   E2E_BASE_URL=https://roulerodrig.com npx playwright test
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The bottleneck is the dev server, not the browser. Turbopack compiles each
  // route on first request, and five workers hitting it at once made even
  // `page.goto("/")` time out — the pre-existing smoke tests failed too, so this
  // is not specific to any one spec. Against a real deployment (E2E_BASE_URL)
  // or in CI there is nothing to compile, so full parallelism stays there.
  workers: process.env.CI || process.env.E2E_BASE_URL ? undefined : 2,
  reporter: "list",
  // Playwright's default is 5s, which is fine against a warm server and not at
  // all fine against a cold one. Turbopack compiles each route on its first
  // request, and with several specs running in parallel the first paint of a
  // page can take 15s+ — the same suite passed in 9s against production and
  // failed wholesale on a cold dev server purely on this. A longer ceiling
  // costs nothing when assertions pass quickly; it only changes how long a
  // genuine failure takes to report.
  expect: { timeout: 15_000 },
  // Same reason, for the whole-test budget. Playwright's 30s default is
  // comfortable against production (the suites finish in ~9s there) and is not
  // enough against a Turbopack dev server serving several parallel workers,
  // where a single first paint measured 7s+ and whole tests overran 30s. This
  // only bounds how long a hung test waits before being reported.
  timeout: 90_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Pointing at an external URL means there is nothing to start.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
