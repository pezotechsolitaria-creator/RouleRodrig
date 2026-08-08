import { describe, it, expect } from "vitest";
import { allowedUsage, decideCapacity, quotaLevel, usagePercent, worstLevel } from "./quota";
import { DEFAULT_EMAIL_CONFIG, type EmailConfig } from "./config";

// ── Quota policy ────────────────────────────────────────────────────────────
// Every assertion here is against PURE functions — no database, no provider, no
// network. That is the point of keeping the policy separate from the fetching:
// the rules that decide whether a customer gets their booking confirmation are
// the part that must never be untested.

const cfg = (patch: Partial<EmailConfig> = {}): EmailConfig => ({
  ...DEFAULT_EMAIL_CONFIG,
  ...patch,
});

describe("quotaLevel", () => {
  const t = DEFAULT_EMAIL_CONFIG.thresholds; // 70 / 80 / 90

  it("maps usage onto the configured bands", () => {
    expect(quotaLevel(0, 300, t)).toBe("normal");
    expect(quotaLevel(209, 300, t)).toBe("normal"); // 69.6%
    expect(quotaLevel(210, 300, t)).toBe("watch"); // 70%
    expect(quotaLevel(240, 300, t)).toBe("warning"); // 80%
    expect(quotaLevel(270, 300, t)).toBe("critical"); // 90%
    expect(quotaLevel(300, 300, t)).toBe("exhausted");
    expect(quotaLevel(999, 300, t)).toBe("exhausted");
  });

  it("reports normal when a window has no ceiling — a paid plan is not a warning", () => {
    expect(quotaLevel(50_000, null, t)).toBe("normal");
  });

  it("honours reconfigured thresholds rather than the defaults", () => {
    const strict = { watch: 20, warning: 30, critical: 40 };
    expect(quotaLevel(25, 100, strict)).toBe("watch");
    expect(quotaLevel(35, 100, strict)).toBe("warning");
    expect(quotaLevel(45, 100, strict)).toBe("critical");
  });

  it("treats a zero ceiling as fully consumed rather than dividing by zero", () => {
    expect(usagePercent(0, 0)).toBe(100);
    expect(quotaLevel(0, 0, t)).toBe("exhausted");
  });
});

describe("worstLevel", () => {
  it("returns the most severe level supplied", () => {
    expect(worstLevel("normal", "critical", "watch")).toBe("critical");
    expect(worstLevel("normal", "normal")).toBe("normal");
    expect(worstLevel("warning", "exhausted")).toBe("exhausted");
  });
});

describe("allowedUsage — the ticketing reserve", () => {
  // Defaults: resend 100/day, 3000/month; reserve 40/day, 300/month on resend,
  // onlyWhenActive: true.
  const base = { cfg: cfg(), provider: "resend" as const, window: "day" as const };

  it("locks nothing while no event is on sale", () => {
    expect(allowedUsage({ ...base, category: "marketplace", priority: "normal", ticketingActive: false })).toBe(100);
  });

  it("holds the reserve back from non-ticketing traffic once an event is live", () => {
    expect(allowedUsage({ ...base, category: "marketplace", priority: "normal", ticketingActive: true })).toBe(60);
  });

  it("lets ticketing itself use the whole ceiling, reserve included", () => {
    expect(allowedUsage({ ...base, category: "ticketing", priority: "high", ticketingActive: true })).toBe(100);
  });

  it("NEVER reserves against critical mail — a reserve must not block a password reset", () => {
    expect(allowedUsage({ ...base, category: "account", priority: "critical", ticketingActive: true })).toBe(100);
    expect(allowedUsage({ ...base, category: "marketplace", priority: "critical", ticketingActive: true })).toBe(100);
  });

  it("applies the monthly reserve against the monthly ceiling", () => {
    expect(
      allowedUsage({ ...base, window: "month", category: "marketplace", priority: "normal", ticketingActive: true }),
    ).toBe(2700); // 3000 - 300
  });

  it("leaves the OTHER provider untouched — the reserve is per-provider", () => {
    expect(
      allowedUsage({ ...base, provider: "brevo", category: "marketplace", priority: "normal", ticketingActive: true }),
    ).toBe(300);
  });

  it("keeps the reserve permanently when onlyWhenActive is off", () => {
    const always = cfg({
      reserves: {
        ...DEFAULT_EMAIL_CONFIG.reserves,
        ticketing: { ...DEFAULT_EMAIL_CONFIG.reserves.ticketing, onlyWhenActive: false },
      },
    });
    expect(
      allowedUsage({ ...base, cfg: always, category: "marketplace", priority: "normal", ticketingActive: false }),
    ).toBe(60);
  });

  it("returns null for a window with no ceiling", () => {
    const paid = cfg({
      providers: { ...DEFAULT_EMAIL_CONFIG.providers, resend: { enabled: true, dailyLimit: null, monthlyLimit: null } },
    });
    expect(allowedUsage({ ...base, cfg: paid, category: "marketplace", priority: "normal", ticketingActive: true })).toBeNull();
  });

  it("clamps a reserve larger than the ceiling to zero instead of going negative", () => {
    // The exact misconfiguration the brief's "reserve = 300" invites on a
    // 100/day bucket. It must degrade to "no flexible capacity", never to a
    // negative allowance that compares wrongly.
    const silly = cfg({
      reserves: {
        ...DEFAULT_EMAIL_CONFIG.reserves,
        ticketing: { ...DEFAULT_EMAIL_CONFIG.reserves.ticketing, daily: 500 },
      },
    });
    expect(allowedUsage({ ...base, cfg: silly, category: "marketplace", priority: "normal", ticketingActive: true })).toBe(0);
  });

  it("subtracts the emergency reserve from all non-critical traffic", () => {
    const withEmergency = cfg({
      reserves: { ...DEFAULT_EMAIL_CONFIG.reserves, emergencyDaily: 10 },
    });
    expect(
      allowedUsage({ ...base, cfg: withEmergency, category: "marketplace", priority: "normal", ticketingActive: false }),
    ).toBe(90);
    expect(
      allowedUsage({ ...base, cfg: withEmergency, category: "account", priority: "critical", ticketingActive: false }),
    ).toBe(100);
  });
});

describe("decideCapacity", () => {
  const base = {
    cfg: cfg(),
    provider: "brevo" as const,
    category: "marketplace" as const,
    priority: "high" as const,
    ticketingActive: false,
  };

  it("allows a send with headroom", () => {
    expect(decideCapacity({ ...base, dayUsed: 10, monthUsed: 10 })).toEqual({ allowed: true });
  });

  it("blocks at the ceiling and says so", () => {
    const d = decideCapacity({ ...base, dayUsed: 300, monthUsed: 300 });
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.blockedBy).toBe("ceiling");
      expect(d.window).toBe("day");
      expect(d.reason).toContain("300/300");
    }
  });

  it("distinguishes a reserve block from a ceiling block", () => {
    // 60 of resend's 100 usable by non-ticketing while an event is live.
    const d = decideCapacity({
      ...base,
      provider: "resend",
      priority: "normal",
      ticketingActive: true,
      dayUsed: 60,
      monthUsed: 0,
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.blockedBy).toBe("reserve");
      expect(d.reason).toContain("reserved");
    }
  });

  it("still admits critical mail when the reserve has blocked everything else", () => {
    const shared = { ...base, provider: "resend" as const, ticketingActive: true, dayUsed: 60, monthUsed: 0 };
    expect(decideCapacity({ ...shared, priority: "normal" }).allowed).toBe(false);
    expect(decideCapacity({ ...shared, priority: "critical" }).allowed).toBe(true);
  });

  it("blocks critical mail once the real ceiling is reached — a reserve is not a bypass of physics", () => {
    const d = decideCapacity({
      ...base,
      provider: "resend",
      priority: "critical",
      ticketingActive: true,
      dayUsed: 100,
      monthUsed: 0,
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.blockedBy).toBe("ceiling");
  });

  it("catches a monthly ceiling even when today is quiet", () => {
    const d = decideCapacity({ ...base, provider: "resend", dayUsed: 0, monthUsed: 3000 });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.window).toBe("month");
  });

  it("FAILS OPEN when usage is unknown — a log outage must not stop all email", () => {
    // -1 means the count query failed. Blocking here would mean one database
    // blip silently stops every booking confirmation on the platform.
    expect(decideCapacity({ ...base, dayUsed: -1, monthUsed: -1 })).toEqual({ allowed: true });
  });

  it("still enforces the window it CAN read when only one count failed", () => {
    const d = decideCapacity({ ...base, provider: "resend", dayUsed: -1, monthUsed: 3000 });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.window).toBe("month");
  });
});
