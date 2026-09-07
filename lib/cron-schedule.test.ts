import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── A CRON ENTRY IS A DEPLOY-TIME CONTRACT (M165) ───────────────────────────
//
// I added /api/cron/notifications to vercel.json because the worker looked
// unscheduled: the last queued notification had been sent hours earlier and a
// delivery deliberately re-armed for the sweep sat untouched.
//
// It was the wrong fix. The route is driven by an EXTERNAL pinger every minute
// (see the header of app/api/cron/notifications/route.ts), and the number of
// cron entries a deployment may declare is capped by the Vercel plan — a
// deployment over the cap is rejected before it builds, which is silent from
// inside the repo. Production sat on an old build while every check here
// passed.
//
// So the file keeps the schedules it had, and this test pins the count rather
// than pretending every route needs an entry.

const ROOT = join(__dirname, "..");
const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};
const crons = vercel.crons ?? [];

describe("vercel.json declares only the crons the plan allows", () => {
  it("keeps the three daily jobs", () => {
    const paths = crons.map((c) => c.path);
    expect(paths).toContain("/api/cron/reminders");
    expect(paths).toContain("/api/cron/posthog-health");
    expect(paths).toContain("/api/cron/purge-documents");
  });

  it("does NOT declare the every-minute worker", () => {
    // Driven by an external pinger. Adding it here is what is believed to have
    // blocked deployment; if you re-add it, confirm the plan's cron limit
    // first and watch a deploy actually land.
    expect(crons.map((c) => c.path)).not.toContain("/api/cron/notifications");
  });

  it("gives every declared cron a schedule", () => {
    for (const c of crons) {
      expect(c.schedule, c.path).toMatch(/\S/);
    }
  });
});
