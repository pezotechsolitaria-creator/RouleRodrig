import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ntfyUrl } from "./notifications/ntfy";
import { EMAIL_TYPES } from "./email/types";

// ── ONE QUEUE, THREE DOORS (M166) ───────────────────────────────────────────
//
// lib/notifications/ntfy.ts had been written, complete and commented, with
// ZERO callers, and notification_slots already carried `channel` and `target`.
// Everything between that and a working ntfy alert was three lines of SQL and
// one branch in the worker:
//
//   1. enqueue_notification never stamped the job's channel, so every job took
//      the column default 'whatsapp' whatever its slot said.
//   2. claim_notification_jobs returned phone and api_key only, so the worker
//      had nothing to route on.
//   3. notification_slots.phone was NOT NULL, so an ntfy slot could not exist.
//
// The owner asked for ntfy by name, and for more email recipients. They are
// the same shape: a slot with a channel and an address. Everything else — who
// is eligible, the dedupe key, the retry budget, the failure reason on the
// admin card — is identical whichever door a message leaves by, which is the
// whole reason this is a column and not a second system.

const ROOT = join(__dirname, "..");
const WORKER = readFileSync(join(ROOT, "app", "api", "cron", "notifications", "route.ts"), "utf8");
const SLOTS_API = readFileSync(
  join(ROOT, "app", "api", "admin", "notification-slots", "route.ts"),
  "utf8",
);

describe("the worker routes on the slot's channel", () => {
  it("sends ntfy, email and WhatsApp from one loop", () => {
    expect(WORKER).toContain("sendNtfy(");
    expect(WORKER).toContain("sendQueuedAlertEmail(");
    expect(WORKER).toContain("sendWhatsApp(");
  });

  it("treats a missing channel as WhatsApp", () => {
    // SQL deploys before the app and a rollback runs them the other way, so a
    // job claimed by the old function has no channel at all. Absent must mean
    // what every slot was before this existed.
    expect(WORKER).toContain('const channel = job.channel ?? "whatsapp"');
  });

  it("still records one outcome per job, whatever the door", () => {
    // The retry budget, the non-retryable burn and the admin card all hang off
    // this. A channel that bypassed it would be invisible when it failed.
    expect(WORKER).toContain("complete_notification_job");
  });
});

describe("a slot can be addressed on its own channel", () => {
  it("stops demanding a phone for every recipient", () => {
    expect(SLOTS_API).toContain('channel: z.enum(["whatsapp", "ntfy", "email"])');
    expect(SLOTS_API).toContain("phone: phoneField.optional()");
  });

  it("refuses a slot with no way to reach it", () => {
    expect(SLOTS_API).toContain("A WhatsApp recipient needs a number.");
    expect(SLOTS_API).toContain("Give the ntfy topic");
    expect(SLOTS_API).toContain("Give a valid email address.");
  });

  it("writes only the address the channel uses", () => {
    // A phone on an ntfy slot is a number nobody sends to, sitting under a
    // UNIQUE index and blocking the real WhatsApp slot for that number.
    expect(SLOTS_API).toContain('phone: channel === "whatsapp" ? phone : null');
    expect(SLOTS_API).toContain('target: channel === "whatsapp" ? null : target');
  });

  it("never returns api_key, but does return target", () => {
    // api_key sends AS somebody else's number. A target is the owner's own
    // address and he must read the ntfy topic back to subscribe a phone to it.
    expect(SLOTS_API).toContain("channel, target");
    const cols = SLOTS_API.slice(SLOTS_API.indexOf("const SAFE_COLUMNS"), SLOTS_API.indexOf("function guard"));
    expect(cols).not.toContain("api_key");
  });
});

describe("the ntfy target is validated before it is trusted", () => {
  it("accepts a bare topic and a full URL", () => {
    expect(ntfyUrl("rr-a7f3c1e9")).toBe("https://ntfy.sh/rr-a7f3c1e9");
    expect(ntfyUrl("https://ntfy.example.com/alerts")).toBe("https://ntfy.example.com/alerts");
  });

  it("refuses anything that would become a path or a second URL", () => {
    for (const bad of ["", "   ", "a/b", "../etc", "topic name", "javascript:alert(1)"]) {
      expect(ntfyUrl(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("an email slot is a real email type", () => {
  it("is registered, or send() would reject it", () => {
    expect(EMAIL_TYPES).toHaveProperty("owner_queued_alert");
  });
});
