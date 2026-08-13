import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ── Events, end to end ─────────────────────────────────────────────────────
//
// Events sell TICKETS. That makes this the second money path on the platform
// after the marketplace, and until now it had no end-to-end coverage at all —
// no e2e spec mentioned events, organizers or tickets.
//
// Two halves, and the second matters more:
//
//   PUBLIC — /events, an event page and its checkout must render for a visitor
//   who has never signed in, and must not link anywhere broken.
//
//   THE DOOR — every organizer and admin endpoint must refuse an anonymous
//   caller. /api/organizer/scan is the one that would hurt: it decides whether
//   a ticket is valid and burns it. Open, it is free entry to any event and a
//   way to void other people's tickets.
//
// Everything here runs WITHOUT credentials on purpose, so it runs on every
// invocation rather than only when a service-role key happens to be present.

const ORG_APIS = [
  "/api/organizer/event",
  "/api/organizer/packages",
  "/api/organizer/payments",
  "/api/organizer/staff",
  "/api/organizer/managed-ticketing",
];

const ADMIN_EVENT_APIS = [
  "/api/admin/events",
  "/api/admin/events/orders",
  "/api/admin/managed-ticketing",
  "/api/admin/organizers",
];

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

test.describe("events — public", () => {
  test("the events page renders for a signed-out visitor", async ({ page }) => {
    const res = await page.goto("/events");
    expect(res?.status(), "/events must not error").toBeLessThan(400);
    // Either events are listed or an empty state is shown. What must NOT happen
    // is a crash or a blank body — both of which have shipped on this site
    // before behind a green build.
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("an event that is listed can actually be opened", async ({ page }) => {
    await page.goto("/events");
    const links = page.locator('a[href^="/events/"]');
    const count = await links.count();
    // No live event is a legitimate state for a small island in low season.
    test.skip(count === 0, "no events are currently listed publicly");

    const href = await links.first().getAttribute("href");
    const res = await page.goto(href!);
    expect(res?.status(), `${href} must open`).toBeLessThan(400);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("the events page has no critical or serious accessibility violations", async ({ page }) => {
    await page.goto("/events");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(
      serious,
      JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2),
    ).toEqual([]);
  });

  test("every internal link on /events resolves", async ({ page, request }) => {
    await page.goto("/events");
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) =>
      [...new Set(as.map((a) => a.getAttribute("href")).filter(Boolean) as string[])],
    );
    const broken: string[] = [];
    for (const href of hrefs.slice(0, 25)) {
      const r = await request.get(href, { failOnStatusCode: false });
      // A dead link is a dead end no design survives.
      if (r.status() >= 400) broken.push(`${href} → ${r.status()}`);
    }
    expect(broken, `Broken links on /events: ${broken.join(", ")}`).toEqual([]);
  });
});

test.describe("events — the door is shut to anonymous callers", () => {
  test("the organizer console redirects to login", async ({ page }) => {
    await page.goto("/organizer");
    await page.waitForURL(/\/login|\/merchant\/login/);
  });

  test("the ticket scanner is not open to the public", async ({ page }) => {
    // A scanner anyone can open is free entry, and a scanner anyone can POST to
    // can burn tickets that belong to paying customers.
    await page.goto("/organizer/some-event/scan");
    await page.waitForURL(/\/login|\/merchant\/login/);
  });

  test("every organizer API rejects an anonymous caller", async ({ request }) => {
    const bad: string[] = [];
    for (const url of ORG_APIS) {
      const get = await request.get(url, { failOnStatusCode: false });
      if (![401, 403, 404, 405].includes(get.status())) bad.push(`GET ${url} → ${get.status()}`);

      const post = await request.post(url, { data: {}, failOnStatusCode: false });
      if (![401, 403, 404, 405].includes(post.status())) bad.push(`POST ${url} → ${post.status()}`);
    }
    expect(bad, `Organizer endpoints answering an anonymous caller: ${bad.join(", ")}`).toEqual([]);
  });

  test("scanning a ticket anonymously is refused", async ({ request }) => {
    // The single most damaging endpoint in the feature: it validates a ticket
    // and marks it used. Tried with a plausible body so a 400 from schema
    // validation cannot be mistaken for a refusal.
    const res = await request.post("/api/organizer/scan", {
      data: { slug: "tomorrow-land", code: NIL_UUID, publicId: NIL_UUID },
      failOnStatusCode: false,
    });
    expect([401, 403, 404], `scan answered ${res.status()}`).toContain(res.status());
  });

  test("every admin events API rejects an anonymous caller", async ({ request }) => {
    const bad: string[] = [];
    for (const url of ADMIN_EVENT_APIS) {
      const r = await request.get(url, { failOnStatusCode: false });
      if (![401, 403, 404, 405].includes(r.status())) bad.push(`GET ${url} → ${r.status()}`);
    }
    expect(bad, `Admin event endpoints answering anonymously: ${bad.join(", ")}`).toEqual([]);
  });

  test("admin event pages redirect to the admin login", async ({ page }) => {
    for (const path of ["/admin/events", "/admin/managed-ticketing", "/admin/organizers"]) {
      await page.goto(path);
      await page.waitForURL("**/admin/login", { timeout: 15_000 });
    }
  });
});
