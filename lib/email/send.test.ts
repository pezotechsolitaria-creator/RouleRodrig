import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_EMAIL_CONFIG, mergeEmailConfig, type EmailConfig } from "./config";
import type { FailureClass, SendOutcome } from "./providers/types";
import type { BeginSendResult } from "./log";

// ── Router behaviour ────────────────────────────────────────────────────────
// The log, both providers, the ticketing predicate and the alert channel are all
// mocked, so these tests describe DECISIONS: who gets tried, in what order, what
// is retried, what is never retried, and what is recorded.

let config: EmailConfig = DEFAULT_EMAIL_CONFIG;
let beginResult: BeginSendResult = { state: "claimed", id: "log-1", attempt: 1 };
/** Per-provider usage, because the whole point of two providers is that they
 *  have separate buckets — a shared counter would make every spill-over test
 *  pass or fail for the wrong reason. */
let usage: Record<string, { day: number; month: number }> = {};
let ticketingActive = false;

const setUsage = (provider: "resend" | "brevo", day: number, month = 0) => {
  usage[provider] = { day, month };
};

type Health = { configured: boolean; reason?: string };

const resendSend = vi.fn<() => Promise<SendOutcome>>();
const brevoSend = vi.fn<() => Promise<SendOutcome>>();
const resendHealth = vi.fn<() => Promise<Health>>(async () => ({ configured: true }));
const brevoHealth = vi.fn<() => Promise<Health>>(async () => ({ configured: true }));
const markSent = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const markNotSent = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});

vi.mock("./config", async (orig) => {
  const actual = await orig<typeof import("./config")>();
  return { ...actual, getEmailConfig: async () => config };
});

vi.mock("./log", () => ({
  beginSend: async () => beginResult,
  countSent: async (provider: string, since: Date) => {
    const u = usage[provider] ?? { day: 0, month: 0 };
    const now = new Date();
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    // On the 1st of a month both windows begin at the same instant, so they are
    // genuinely the same query — take the stricter number rather than letting
    // the calendar decide whether this suite passes.
    if (dayStart === monthStart) return Math.max(u.day, u.month);
    return since.getTime() === monthStart ? u.month : u.day;
  },
  markSent: (...a: unknown[]) => markSent(...a),
  markNotSent: (...a: unknown[]) => markNotSent(...a),
}));

vi.mock("./quota", async (orig) => {
  const actual = await orig<typeof import("./quota")>();
  return {
    ...actual,
    getTicketingActivity: async () => ({ active: ticketingActive, activeEvents: 0, known: true }),
    getProviderUsage: async () => ({}),
  };
});

vi.mock("./providers/resend", () => ({
  resendProvider: { name: "resend", health: () => resendHealth(), send: () => resendSend() },
}));

vi.mock("./providers/brevo", () => ({
  brevoProvider: { name: "brevo", health: () => brevoHealth(), send: () => brevoSend() },
}));

vi.mock("./alerts", () => ({
  alertQuotaLevel: async () => {},
  alertSendSuppressed: async () => {},
  alertProviderAuthFailure: async () => {},
}));

const { sendTransactionalEmail } = await import("./send");

const ok = (id = "msg-1"): SendOutcome => ({ ok: true, messageId: id });
const fail = (failure: FailureClass, reason = "x"): SendOutcome => ({ ok: false, failure, reason });

const input = (over: Partial<Parameters<typeof sendTransactionalEmail>[0]> = {}) => ({
  type: "marketplace_order_confirmation" as const,
  to: "customer@example.com",
  subject: "Order placed",
  html: "<p>hi</p>",
  idempotencyKey: "marketplace_order_confirmation:order-1",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  config = DEFAULT_EMAIL_CONFIG;
  beginResult = { state: "claimed", id: "log-1", attempt: 1 };
  usage = {};
  ticketingActive = false;
  resendSend.mockResolvedValue(ok());
  brevoSend.mockResolvedValue(ok());
  resendHealth.mockResolvedValue({ configured: true });
  brevoHealth.mockResolvedValue({ configured: true });
});

describe("routing", () => {
  it("sends a marketplace email via Brevo and never touches Resend", async () => {
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "brevo" });
    expect(brevoSend).toHaveBeenCalledTimes(1);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sends a ticketing email via Resend", async () => {
    const r = await sendTransactionalEmail(input({ type: "ticket_qr_delivery", idempotencyKey: "t:1" }));
    expect(r).toMatchObject({ ok: true, provider: "resend" });
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(brevoSend).not.toHaveBeenCalled();
  });

  it("follows a re-pointed route without any code change", async () => {
    config = mergeEmailConfig({ routing: { marketplace_order_confirmation: "resend" } });
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "resend" });
  });

  it("records the provider that actually sent it", async () => {
    await sendTransactionalEmail(input());
    expect(markSent).toHaveBeenCalledWith("log-1", "brevo", "msg-1", 1);
  });

  it("refuses an empty recipient without claiming a log row", async () => {
    const r = await sendTransactionalEmail(input({ to: "   " }));
    expect(r.ok).toBe(false);
    expect(brevoSend).not.toHaveBeenCalled();
  });
});

describe("forceProvider (admin test send)", () => {
  it("uses the named provider even when routing says otherwise", async () => {
    // marketplace_order_confirmation routes to brevo by default.
    const r = await sendTransactionalEmail(input({ forceProvider: "resend" }));
    expect(r).toMatchObject({ ok: true, provider: "resend" });
    expect(brevoSend).not.toHaveBeenCalled();
  });

  it("does NOT fail over — a test that silently succeeds elsewhere proves nothing", async () => {
    resendSend.mockResolvedValue(fail("quota", "spent"));
    const r = await sendTransactionalEmail(input({ forceProvider: "resend" }));
    expect(r.ok).toBe(false);
    expect(brevoSend).not.toHaveBeenCalled();
  });

  it("reports the pinned provider's own failure reason", async () => {
    resendHealth.mockResolvedValue({ configured: false, reason: "RESEND_FROM is not set." });
    const r = await sendTransactionalEmail(input({ forceProvider: "resend" }));
    expect(r).toMatchObject({ ok: false, suppressed: true });
    expect(r.reason).toContain("RESEND_FROM");
    expect(brevoSend).not.toHaveBeenCalled();
  });
});

describe("idempotency", () => {
  it("sends nothing when the key was already used and reports success", async () => {
    // The logical email IS in the inbox — the cron must be able to stamp
    // "reminded" on the strength of this.
    beginResult = { state: "duplicate", existingStatus: "sent" };
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, deduped: true });
    expect(brevoSend).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sends nothing when a previous attempt was left ambiguous", async () => {
    // The one case where "did it arrive?" is unanswerable. Sending again is how
    // a customer gets two of the same email.
    beginResult = { state: "duplicate", existingStatus: "unknown" };
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: false, deduped: true, ambiguous: true });
    expect(brevoSend).not.toHaveBeenCalled();
  });

  it("still sends when the log is unavailable — degraded, not broken", async () => {
    // Exactly what the platform did before this system existed: send, no record,
    // no idempotency. Losing the log must not lose the email.
    beginResult = { state: "unavailable" };
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "brevo" });
    expect(markSent).not.toHaveBeenCalled();
  });
});

describe("retry", () => {
  it("retries a transient failure against the SAME provider and never crosses over", async () => {
    brevoSend.mockResolvedValueOnce(fail("transient")).mockResolvedValueOnce(ok());
    config = mergeEmailConfig({ retry: { maxAttempts: 3, baseDelayMs: 0 } });
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "brevo" });
    expect(brevoSend).toHaveBeenCalledTimes(2);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("gives up after the configured number of attempts", async () => {
    brevoSend.mockResolvedValue(fail("transient"));
    resendSend.mockResolvedValue(fail("transient"));
    config = mergeEmailConfig({ retry: { maxAttempts: 2, baseDelayMs: 0 } });
    const r = await sendTransactionalEmail(input());
    expect(r.ok).toBe(false);
    expect(brevoSend).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent rejection", async () => {
    brevoSend.mockResolvedValue(fail("permanent", "malformed"));
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: false, provider: "brevo" });
    expect(brevoSend).toHaveBeenCalledTimes(1);
    expect(markNotSent).toHaveBeenCalledWith("log-1", "failed", "malformed", 1, "brevo");
  });

  it("does not retry an undeliverable address", async () => {
    brevoSend.mockResolvedValue(fail("invalid", "bad address"));
    await sendTransactionalEmail(input());
    expect(brevoSend).toHaveBeenCalledTimes(1);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("NEVER retries or fails over an ambiguous send, and records it as unknown", async () => {
    brevoSend.mockResolvedValue(fail("unknown", "connection lost mid-request (ECONNRESET)"));
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: false, ambiguous: true, provider: "brevo" });
    expect(brevoSend).toHaveBeenCalledTimes(1);
    expect(resendSend).not.toHaveBeenCalled();
    expect(markNotSent).toHaveBeenCalledWith("log-1", "unknown", expect.stringContaining("ECONNRESET"), 1, "brevo");
  });
});

describe("fallback", () => {
  it("crosses to the other provider ONLY when the allowance is spent", async () => {
    brevoSend.mockResolvedValue(fail("quota", "429 sending allowance exhausted"));
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "resend" });
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("does not cross over on an auth fault alone if the other provider also fails", async () => {
    brevoSend.mockResolvedValue(fail("auth", "401"));
    resendSend.mockResolvedValue(fail("auth", "401"));
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: false, suppressed: true });
    expect(markNotSent).toHaveBeenCalledWith("log-1", "suppressed", expect.any(String), 1);
  });

  it("still delivers via the other provider when only one key is broken", async () => {
    brevoSend.mockResolvedValue(fail("auth", "401 bad key"));
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "resend" });
  });

  it("respects fallback being disabled entirely", async () => {
    config = mergeEmailConfig({ fallback: { enabled: false, exceptTypes: [] } });
    brevoSend.mockResolvedValue(fail("quota", "spent"));
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: false, suppressed: true });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("respects a per-type fallback exclusion", async () => {
    config = mergeEmailConfig({
      fallback: { enabled: true, exceptTypes: ["marketplace_order_confirmation"] },
    });
    brevoSend.mockResolvedValue(fail("quota", "spent"));
    const r = await sendTransactionalEmail(input());
    expect(r.ok).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("skips a provider that is not configured and uses the one that is", async () => {
    brevoHealth.mockResolvedValue({ configured: false, reason: "Brevo API key is not set" });
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "resend" });
    expect(brevoSend).not.toHaveBeenCalled();
  });

  it("skips a provider disabled in settings", async () => {
    config = mergeEmailConfig({ providers: { brevo: { enabled: false } } });
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "resend" });
    expect(brevoSend).not.toHaveBeenCalled();
  });
});

describe("quota and reserve enforcement", () => {
  it("moves traffic off a provider whose daily ceiling is reached", async () => {
    setUsage("brevo", 300); // brevo's default ceiling; resend still has headroom
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "resend" });
    expect(brevoSend).not.toHaveBeenCalled();
  });

  it("suppresses and records when neither provider has capacity", async () => {
    setUsage("brevo", 10_000, 10_000);
    setUsage("resend", 10_000, 10_000);
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: false, suppressed: true });
    expect(r.reason).toContain("brevo");
    expect(r.reason).toContain("resend");
    // §34: never silently dropped — there is a row explaining it.
    expect(markNotSent).toHaveBeenCalledWith("log-1", "suppressed", expect.any(String), 1);
    expect(brevoSend).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("keeps the ticketing reserve out of reach of ordinary mail while an event is live", async () => {
    // Marketplace mail spilling onto Resend may use 100 - 40 = 60/day.
    config = mergeEmailConfig({ providers: { brevo: { enabled: false } } });
    ticketingActive = true;
    setUsage("resend", 60);
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: false, suppressed: true });
    expect(r.reason).toContain("reserved");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("lets the SAME volume through once the event is over — the reserve releases itself", async () => {
    config = mergeEmailConfig({ providers: { brevo: { enabled: false } } });
    ticketingActive = false;
    setUsage("resend", 60);
    const r = await sendTransactionalEmail(input());
    expect(r).toMatchObject({ ok: true, provider: "resend" });
  });

  it("still delivers a ticket QR from inside the reserve", async () => {
    ticketingActive = true;
    setUsage("resend", 60);
    const r = await sendTransactionalEmail(input({ type: "ticket_qr_delivery", idempotencyKey: "t:2" }));
    expect(r).toMatchObject({ ok: true, provider: "resend" });
  });

  it("never lets a reserve block a critical email", async () => {
    config = mergeEmailConfig({ providers: { brevo: { enabled: false } } });
    ticketingActive = true;
    setUsage("resend", 60);
    const r = await sendTransactionalEmail(
      input({ type: "marketplace_payment_confirmation", idempotencyKey: "p:1" }),
    );
    expect(r).toMatchObject({ ok: true, provider: "resend" });
  });
});
