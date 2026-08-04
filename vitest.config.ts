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
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
