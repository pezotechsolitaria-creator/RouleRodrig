import { describe, expect, it } from "vitest";
import { hourBucket, hoursWaited, escalationMessage, ESCALATE_AFTER_HOURS } from "./escalation";
import type { StaleItem } from "./escalation";

// ── The two things that decide whether this alert helps or gets muted ───────
//
// This runs inside a worker that is pinged EVERY MINUTE. If the dedupe key were
// wrong the owner would receive the same WhatsApp sixty times before he finished
// reading the first one — and a muted number is worse than no alert at all,
// because he would believe he was covered.

const at = (iso: string) => new Date(iso).getTime();

describe("hourBucket — one message per hour, not per minute", () => {
  it("is identical for every minute inside the same hour", () => {
    const first = hourBucket(at("2026-08-13T09:00:00Z"));
    for (const m of ["09:01", "09:17", "09:44", "09:59"]) {
      expect(hourBucket(at(`2026-08-13T${m}:30Z`))).toBe(first);
    }
  });

  it("changes at the top of the hour, so a persisting problem nags again", () => {
    expect(hourBucket(at("2026-08-13T09:59:59Z"))).not.toBe(hourBucket(at("2026-08-13T10:00:00Z")));
  });

  it("does not collapse the same hour on different days", () => {
    expect(hourBucket(at("2026-08-13T09:30:00Z"))).not.toBe(hourBucket(at("2026-08-14T09:30:00Z")));
  });
});

describe("hoursWaited", () => {
  const now = at("2026-08-13T12:00:00Z");

  it("floors to whole hours — 'waiting 3h', not 3.4", () => {
    expect(hoursWaited("2026-08-13T08:35:00Z", now)).toBe(3);
  });

  it("is 0 for something that just arrived, never negative", () => {
    expect(hoursWaited("2026-08-13T11:59:00Z", now)).toBe(0);
    expect(hoursWaited("2026-08-13T14:00:00Z", now)).toBe(0);
  });

  it("survives a malformed timestamp instead of producing NaN in a message", () => {
    expect(hoursWaited("not a date", now)).toBe(0);
  });
});

describe("escalationMessage", () => {
  const now = at("2026-08-13T12:00:00Z");
  const item = (n: number, hoursAgo: number): StaleItem => ({
    kind: "payment",
    reference: `RR-00000${n}`,
    customer: `Customer ${n}`,
    detail: "says they paid",
    waitingSince: new Date(now - hoursAgo * 3600_000).toISOString(),
  });

  it("leads with the count and the longest wait — a lock screen shows one line", () => {
    const msg = escalationMessage([item(1, 3), item(2, 1)], now);
    expect(msg).toContain("2 customers waiting");
    expect(msg).toContain("longest 3h");
  });

  it("reads naturally for a single customer", () => {
    const msg = escalationMessage([item(1, 2)], now);
    expect(msg).toContain("1 customer waiting 2h");
    expect(msg).not.toContain("customers");
  });

  it("names the customer and the reference so he can act without the laptop", () => {
    const msg = escalationMessage([item(7, 4)], now);
    expect(msg).toContain("Customer 7");
    expect(msg).toContain("RR-000007");
  });

  // A WhatsApp with forty lines is a wall nobody reads on a phone.
  it("caps the detail and says how many more there are", () => {
    const many = Array.from({ length: 9 }, (_, i) => item(i + 1, 2));
    const msg = escalationMessage(many, now);
    expect(msg).toContain("+4 more");
    expect(msg).not.toContain("Customer 9");
  });

  it("always points at where to act", () => {
    expect(escalationMessage([item(1, 2)], now)).toContain("/admin");
  });
});

describe("the threshold the owner asked for", () => {
  it("escalates after one hour", () => {
    expect(ESCALATE_AFTER_HOURS).toBe(1);
  });
});
