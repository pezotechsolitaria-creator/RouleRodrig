import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// The pure display logic in getMerchantSubscription() is what the banner and
// the plan page render from, so it must agree exactly with
// merchant_subscription_active() in SQL — which is the real authority. These
// tests pin that agreement at each boundary.
const { getMerchantSubscription } = await import("./subscription");

const MERCHANT = "28003749-f552-46dc-9dce-b4fd19b83dd2";
const DAY = 86_400_000;
const NOW = new Date("2026-08-05T12:00:00Z").getTime();

/** Minimal stub of the one query getMerchantSubscription makes. */
function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row }) }),
      }),
    }),
  } as never;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    plan: "starter",
    status: "active",
    started_at: new Date(NOW - 60 * DAY).toISOString(),
    current_period_end: new Date(NOW + 10 * DAY).toISOString(),
    grace_days: 7,
    cancelled_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("getMerchantSubscription", () => {
  it("returns null when the merchant has no subscription row", async () => {
    expect(await getMerchantSubscription(clientReturning(null), MERCHANT)).toBeNull();
  });

  it("is active well inside the period", async () => {
    const s = (await getMerchantSubscription(clientReturning(row()), MERCHANT))!;
    expect(s.isActive).toBe(true);
    expect(s.inGracePeriod).toBe(false);
    expect(s.hasExpired).toBe(false);
    expect(s.daysRemaining).toBe(10);
  });

  // The grace window is what stops a merchant being cut off the instant an
  // invoice slips, so both of its edges matter.
  it("enters grace once the period ends but keeps selling", async () => {
    const s = (await getMerchantSubscription(
      clientReturning(row({ current_period_end: new Date(NOW - 3 * DAY).toISOString() })), MERCHANT))!;
    expect(s.isActive).toBe(true);
    expect(s.inGracePeriod).toBe(true);
    expect(s.hasExpired).toBe(false);
    expect(s.graceDaysRemaining).toBe(4);
  });

  it("expires once the grace window is past", async () => {
    const s = (await getMerchantSubscription(
      clientReturning(row({ current_period_end: new Date(NOW - 8 * DAY).toISOString() })), MERCHANT))!;
    expect(s.isActive).toBe(false);
    expect(s.inGracePeriod).toBe(false);
    expect(s.hasExpired).toBe(true);
    expect(s.graceDaysRemaining).toBe(0);
  });

  it("treats a suspended merchant as blocked even inside a valid period", async () => {
    const s = (await getMerchantSubscription(clientReturning(row({ status: "suspended" })), MERCHANT))!;
    expect(s.isActive).toBe(false);
    expect(s.hasExpired).toBe(true);
  });

  it("treats a cancelled merchant as blocked", async () => {
    const s = (await getMerchantSubscription(clientReturning(row({ status: "cancelled" })), MERCHANT))!;
    expect(s.isActive).toBe(false);
  });

  it("keeps trialing and past_due merchants selling", async () => {
    for (const status of ["trialing", "past_due"]) {
      const s = (await getMerchantSubscription(clientReturning(row({ status })), MERCHANT))!;
      expect(s.isActive, status).toBe(true);
    }
  });

  // A zero-day grace must expire immediately at period end, not linger.
  it("honours a zero-day grace period", async () => {
    const s = (await getMerchantSubscription(
      clientReturning(row({ grace_days: 0, current_period_end: new Date(NOW - 1000).toISOString() })), MERCHANT))!;
    expect(s.isActive).toBe(false);
    expect(s.hasExpired).toBe(true);
  });
});
