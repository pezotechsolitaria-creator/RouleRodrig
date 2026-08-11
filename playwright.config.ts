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
  reporter: "list",
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
