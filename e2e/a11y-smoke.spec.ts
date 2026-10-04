import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ── Accessibility smoke on the pages people land on ──────────────────────────
//
// Architecture review 2026-09-30, a11y item 4. axe already guards the shop,
// cart, checkout, orders, events and merchant pages — and ran on none of the
// pages search traffic actually arrives at: the homepage, the two rental money
// pages, the experiences hub, a guide and the marketplace hub.
//
// REPORT-ONLY, EXCEPT FOR "critical". Colour contrast is known to fail here:
// DESIGN.md approves secondary text at muted/50 (about 2.2:1), and changing
// that is the owner's call, not a test's. Failing on "serious" would turn this
// spec red on day one for a decision nobody has made yet, and a spec that is
// always red teaches people to ignore it. So every violation is logged and
// attached to the report, and only a "critical" one — a control with no name,
// an image with no alt, a broken ARIA reference — fails the run.
//
// Setup follows e2e/booking-a11y.spec.ts and e2e/events.spec.ts: plain
// page.goto against whatever E2E_BASE_URL / E2E_PORT points at, nothing
// seeded, nothing written — safe against production.

const PAGES = [
  "/",
  "/browse/car",
  "/browse/scooter",
  "/experiences",
  "/guide/beaches",
  "/marketplace",
] as const;

/** Loads a page and waits until what a visitor sees is the page itself. */
async function land(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: "load" });
  expect(res?.status(), `${path} did not answer 200`).toBe(200);
  // A first visit gets the 1.8s splash over everything (app/layout.tsx).
  // Scan the page, not the curtain in front of it.
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-splash"), null, {
    timeout: 15_000,
  });
}

for (const path of PAGES) {
  test(`axe smoke: ${path} has no critical violations`, async ({ page }, testInfo) => {
    await land(page, path);

    // The hero's YouTube player is somebody else's document.
    const results = await new AxeBuilder({ page }).exclude('iframe[src*="youtube"]').analyze();

    const summary = results.violations.map((v) => ({
      impact: v.impact,
      id: v.id,
      nodes: v.nodes.length,
      help: v.help,
      firstTarget: v.nodes[0]?.target.join(" "),
    }));
    // The report half: every finding, readable in the run log and attached to
    // the HTML report, whatever its impact.
    console.log(`[a11y] ${path} (${testInfo.project.name}): ${summary.length} violation(s)`);
    for (const s of summary) {
      console.log(`[a11y]   ${s.impact ?? "?"} · ${s.id} ×${s.nodes} — ${s.help} — ${s.firstTarget ?? ""}`);
    }
    await testInfo.attach(`axe ${path}`, {
      body: JSON.stringify(summary, null, 2),
      contentType: "application/json",
    });

    const critical = summary.filter((s) => s.impact === "critical");
    expect(critical, `critical accessibility violations on ${path}`).toEqual([]);
  });
}

// ── The skip link, driven with a real keyboard ──────────────────────────────
//
// components/SkipLink.tsx. What a Node test cannot show: that it really is the
// FIRST thing Tab reaches, that it comes into view when it does, and that Enter
// puts focus on the page's main landmark so the next Tab continues inside it.

const LABEL = /^(Skip to content|Aller au contenu|Al direk lor paz)$/;

for (const path of ["/browse/car", "/experiences"] as const) {
  test(`skip link: first Tab on ${path} reaches it, Enter lands in <main>`, async ({ page }) => {
    await land(page, path);
    // Before hydration Enter would follow the bare #main-content fragment,
    // which is fine for a person and useless as a test of the handler.
    await page.waitForFunction(() => {
      const a = document.querySelector('a[href="#main-content"]');
      return !!a && Object.keys(a).some((k) => k.startsWith("__reactProps"));
    });

    await page.keyboard.press("Tab");
    const link = page.locator(":focus");
    await expect(link).toHaveText(LABEL);
    const box = await link.boundingBox();
    expect(box, "the focused skip link has no box").not.toBeNull();
    expect(box!.y, "the skip link stayed above the viewport when focused").toBeGreaterThanOrEqual(0);

    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .toBe("MAIN");

    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const main = document.querySelector("main");
          const el = document.activeElement;
          return !!main && !!el && el !== main && main.contains(el);
        }),
      )
      .toBe(true);
  });
}
