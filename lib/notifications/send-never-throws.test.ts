import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sendWhatsApp } from "./whatsapp";
import { ntfyUrl } from "./ntfy";

// ── A NULL IN ONE ROW MUST NOT STOP THE QUEUE ───────────────────────────────
//
// Production, 2026-09-07, release 08cd6d7: three runs of
// GET /api/cron/notifications died inside seventeen minutes with
//
//   TypeError: Cannot read properties of null (reading 'trim')
//
// sendWhatsApp's own header already said "an exception here would abort a whole
// batch because one number was misconfigured" — and then trimmed `phone`
// unguarded, one line above a correctly guarded `apiKey?.trim()`. Four of its
// five callers hand it `t.phone as string` straight out of Postgres, where the
// column is nullable. A cast is a promise the database never made.
//
// The blast radius was bigger than one message. Jobs are claimed UP FRONT, so a
// throw mid-loop strands every claimed-but-unsent job in `sending` until
// requeue_stuck_notifications() rescues it ten minutes later — and the bad job
// is re-claimed the next minute, which is the shape of those three events.

describe("sendWhatsApp honours its own no-throw contract", () => {
  it("returns a failure for a null phone instead of throwing", async () => {
    await expect(
      sendWhatsApp({ phone: null, apiKey: "k", message: "hi" }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("returns a failure for a null API key instead of throwing", async () => {
    await expect(
      sendWhatsApp({ phone: "+23057000000", apiKey: null, message: "hi" }),
    ).resolves.toMatchObject({ ok: false, retryable: false });
  });

  it("treats both missing as not retryable — trying again fails identically", async () => {
    // toMatchObject rather than r.retryable: SendResult is a discriminated
    // union and the success arm carries no `retryable`, so reading it needs
    // narrowing first. The object form asserts the same thing without it.
    await expect(
      sendWhatsApp({ phone: undefined, apiKey: undefined, message: "hi" }),
    ).resolves.toMatchObject({ ok: false, retryable: false });
  });

  it("still rejects a malformed number, which was never the bug", async () => {
    const r = await sendWhatsApp({ phone: "05700000", apiKey: "k", message: "hi" });
    expect(r.ok).toBe(false);
  });
});

describe("ntfyUrl", () => {
  it("answers null for a null target rather than throwing", () => {
    expect(ntfyUrl(null)).toBeNull();
    expect(ntfyUrl(undefined)).toBeNull();
    expect(ntfyUrl("   ")).toBeNull();
  });

  it("still resolves a real topic and a real URL", () => {
    expect(ntfyUrl("rr-alerts")).toBe("https://ntfy.sh/rr-alerts");
    expect(ntfyUrl("https://ntfy.example.com/x/")).toBe("https://ntfy.example.com/x");
  });

  it("still refuses a topic that would traverse a path", () => {
    expect(ntfyUrl("../admin")).toBeNull();
  });
});

describe("the cron isolates each job", () => {
  const SRC = readFileSync(
    join(process.cwd(), "app/api/cron/notifications/route.ts"),
    "utf8",
  );

  it("wraps the send so one throw is that job's failure, not the batch's", () => {
    expect(SRC).toMatch(/const result = await \(async \(\) => \{/);
    expect(SRC).toContain("notification send threw");
  });

  it("marks a thrown send retryable, so the attempt budget burns it out", () => {
    const block = SRC.slice(SRC.indexOf("notification send threw"));
    expect(block.slice(0, 400)).toMatch(/retryable: true/);
  });

  it("still runs the order sweep before any of this", () => {
    // The sweep is what auto-cancels a lunch nobody accepted. It sits above the
    // job loop in its own try/catch precisely so a bad notification cannot stop
    // an order expiring.
    expect(SRC.indexOf("sweep_expired_orders")).toBeLessThan(
      SRC.indexOf("notification send threw"),
    );
  });
});
