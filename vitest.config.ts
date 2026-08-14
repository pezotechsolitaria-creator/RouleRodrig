import { defineConfig } from "vitest/config";
import path from "path";

// Unit/integration tests for pure logic (money, validation, API route
// helpers). E2E lives separately in Playwright (playwright.config.ts) — kept
// deliberately apart so `npm test` stays fast and hermetic (no dev server,
// no network) while `npm run test:e2e` covers real browser behavior.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "e2e", ".claude"],
    // ── Why 30s and not vitest's 5 ───────────────────────────────────────
    //
    // Seven tests failed as TIMEOUTS in a single day, every one of them a
    // standing guard that walks the repository: the cash-off scanner, the
    // email server/client boundary, the admin RPC grants, the reachable-pages
    // crawl, the AnimatePresence portal check. They read hundreds of tracked
    // files, or shell out to git, and that is comfortably under a second when
    // run alone and well over five when the whole suite is competing for the
    // machine.
    //
    // Each failure looked exactly like a real regression — a cash-safety
    // breach, a credential leaking to the browser — and each cost a diagnosis
    // to disprove. Worse, they taught the reflex of re-running until green,
    // which is precisely how a genuine failure gets waved through.
    //
    // Raising the ceiling does not weaken a single assertion. A test that
    // truly hangs still fails, six seconds later than before. Patching each
    // scanner with its own `, 30_000` was treating the symptom one file at a
    // time while the next scanner ever written inherits the same trap.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
});
