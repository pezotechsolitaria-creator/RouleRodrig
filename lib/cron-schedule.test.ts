import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── A CRON ROUTE WITH NO SCHEDULE IS A WORKER THAT NEVER RUNS (M165) ────────
//
// app/api/cron/notifications is the every-minute worker: it drains the
// notification queue, sweeps delivery escalations, expires Deliver Anything
// requests and — since M181 — cancels a lunch nobody accepted at its collection
// time. Its own header says "This is triggered by cron-job.org every minute".
//
// It was not in vercel.json, and the external pinger had stopped. Measured on
// production: the last queued notification was sent at 01:46, a delivery
// deliberately re-armed for the sweep sat untouched for five minutes, and the
// endpoint answered 401 rather than 503 — so it was deployed, guarded and
// CRON_SECRET was set. Nothing was calling it.
//
// Depending on a free external pinger for the only thing that moves the queue
// is a single point of failure with no alarm on it. The schedule now lives in
// the repo beside the route.

const ROOT = join(__dirname, "..");
const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};
const scheduled = new Set((vercel.crons ?? []).map((c) => c.path));

/** Every route.ts under app/api/cron, as the path Vercel would call. */
function cronRoutes(): string[] {
  const dir = join(ROOT, "app", "api", "cron");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "route.ts")))
    .map((e) => `/api/cron/${e.name}`);
}

describe("every cron route is actually scheduled", () => {
  it("schedules the notification worker", () => {
    // The one that was missing. It carries the queue, the delivery escalation
    // sweep, request expiry and order auto-cancel.
    expect(scheduled.has("/api/cron/notifications")).toBe(true);
  });

  it("runs it often enough to be a worker", () => {
    const c = (vercel.crons ?? []).find((x) => x.path === "/api/cron/notifications");
    // A daily schedule would be useless here: an order for 15:00 that nobody
    // accepts has to be cancelled at 15:30, not at 06:00 tomorrow.
    expect(c?.schedule).toMatch(/^\*(\/\d+)? \*/);
  });

  it("leaves no cron route unscheduled", () => {
    const orphans = cronRoutes().filter((p) => !scheduled.has(p));
    expect(orphans).toEqual([]);
  });

  it("keeps the schedules that were already there", () => {
    for (const p of ["/api/cron/reminders", "/api/cron/posthog-health", "/api/cron/purge-documents"]) {
      expect(scheduled.has(p)).toBe(true);
    }
  });
});
