#!/usr/bin/env node
// Fails CI when end-to-end tests skipped because the environment was not
// configured, rather than because the test genuinely did not apply.
//
// This exists because "92/92 unit, 29/29 e2e, 27 skipped" reads like a green
// build and is not one. Every one of those 27 covers a money path, a
// cross-tenant boundary or an order-state transition, and each was a silent
// no-op. A skipped test asserts nothing; treating it as a pass is how a
// regression reaches production wearing a green tick.
//
// Skips that are ACCEPTABLE (a test that legitimately does not apply in this
// environment) are listed in ALLOWED_SKIPS. Anything else is a hard failure.

import { readFileSync, existsSync } from "node:fs";

const REPORT = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || "playwright-report.json";

// Substrings of skip reasons that are fine. Keep this list SHORT and justify
// every entry — it is the escape hatch that could hide a real gap.
const ALLOWED_SKIPS = [
  // Fixture-dependent storefront assertions: they check a published shop's
  // hours widget, which does not exist until a shop publishes hours. They
  // cover presentation, not a security or money boundary.
  "no published test shop in this environment",
  "this shop has not published opening hours",
  "no hours published",
];

// Any skip mentioning these is a CONFIGURATION failure, not an N/A.
const BLOCKING_PATTERNS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service role",
  "service_role",
];

if (!existsSync(REPORT)) {
  console.error(`✗ ${REPORT} not found — did Playwright run with --reporter=json?`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, "utf8"));

/** Playwright nests suites arbitrarily deep; flatten to the individual tests. */
function* walk(suites = []) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        yield { title: spec.title, file: suite.file ?? "", test };
      }
    }
    yield* walk(suite.suites);
  }
}

const skipped = [];
for (const { title, file, test } of walk(report.suites)) {
  const status = test.status ?? test.expectedStatus;
  if (status !== "skipped") continue;
  const reason =
    test.annotations?.find((a) => a.type === "skip")?.description ??
    test.results?.[0]?.error?.message ??
    "(no reason recorded)";
  skipped.push({ title, file, reason });
}

if (skipped.length === 0) {
  console.log("✓ No skipped end-to-end tests.");
  process.exit(0);
}

const blocking = skipped.filter(
  (s) =>
    BLOCKING_PATTERNS.some((p) => s.reason.includes(p)) ||
    !ALLOWED_SKIPS.some((a) => s.reason.includes(a)),
);

console.log(`\n${skipped.length} skipped test(s):\n`);
for (const s of skipped) {
  const mark = blocking.includes(s) ? "✗" : "·";
  console.log(`  ${mark} ${s.file} › ${s.title}\n      ${s.reason}`);
}

if (blocking.length > 0) {
  console.error(
    `\n✗ ${blocking.length} test(s) skipped for environment reasons, not because they did not apply.\n` +
      `  These cover money paths, cross-tenant boundaries and order-state transitions.\n` +
      `  Set the missing secrets (see TESTING.md) — a skipped test is not a passing test.`,
  );
  process.exit(1);
}

console.log(`\n✓ All ${skipped.length} skip(s) are allowed N/A cases.`);
process.exit(0);
