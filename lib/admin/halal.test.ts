import { describe, it, expect } from "vitest";
import { certificateState, needsAttention, CERT_WARN_DAYS, CERT_URGENT_DAYS } from "./halal";

const TODAY = "2026-08-19";
const k = (over: Partial<Parameters<typeof certificateState>[0]> = {}) => ({
  halalCertified: true,
  halalCertifier: "Islamic Circle of Mauritius",
  halalCertifiedUntil: "2026-12-31",
  ...over,
});

describe("certificateState", () => {
  it("says nothing about a kitchen that is not certified", () => {
    const s = certificateState(k({ halalCertified: false }), TODAY);
    expect(s.tone).toBe("none");
    expect(s.text).toBe("");
    expect(needsAttention(s)).toBe(false);
  });

  it("stays quiet while the certificate is comfortably valid", () => {
    const s = certificateState(k({ halalCertifiedUntil: "2027-01-01" }), TODAY);
    expect(s.tone).toBe("fine");
    expect(s.text).toBe("");
    expect(needsAttention(s)).toBe(false);
  });

  // The database already hides a lapsed badge. The point of this line is that
  // the owner finds out from the admin rather than from a customer.
  it("says plainly that the badge is already gone", () => {
    const s = certificateState(k({ halalCertifiedUntil: "2026-08-17" }), TODAY);
    expect(s.tone).toBe("expired");
    expect(s.daysLeft).toBe(-2);
    expect(s.text).toContain("expired 2 days ago");
    expect(s.text).toContain("no longer see the halal badge");
  });

  it("gets the singular right one day after lapsing", () => {
    expect(certificateState(k({ halalCertifiedUntil: "2026-08-18" }), TODAY).text)
      .toContain("expired 1 day ago");
  });

  it("warns urgently inside the last week", () => {
    const s = certificateState(k({ halalCertifiedUntil: "2026-08-23" }), TODAY);
    expect(s.tone).toBe("urgent");
    expect(s.text).toContain("4 days");
  });

  // Expiring today is still valid today — the badge goes tomorrow, and saying
  // "expires in 0 days" would be nonsense on a card.
  it("handles the last valid day without arithmetic showing through", () => {
    const s = certificateState(k({ halalCertifiedUntil: TODAY }), TODAY);
    expect(s.tone).toBe("urgent");
    expect(s.text).toContain("expires today");
    expect(s.text).not.toContain("0 day");
  });

  it("gives a month's notice, which is what renewing here actually takes", () => {
    const s = certificateState(k({ halalCertifiedUntil: "2026-09-10" }), TODAY);
    expect(s.tone).toBe("soon");
    expect(s.daysLeft).toBe(22);
  });

  it("changes tone exactly at the two thresholds", () => {
    const day = (n: number) => {
      const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000);
      return d.toISOString().slice(0, 10);
    };
    expect(certificateState(k({ halalCertifiedUntil: day(CERT_URGENT_DAYS) }), TODAY).tone).toBe("urgent");
    expect(certificateState(k({ halalCertifiedUntil: day(CERT_URGENT_DAYS + 1) }), TODAY).tone).toBe("soon");
    expect(certificateState(k({ halalCertifiedUntil: day(CERT_WARN_DAYS) }), TODAY).tone).toBe("soon");
    expect(certificateState(k({ halalCertifiedUntil: day(CERT_WARN_DAYS + 1) }), TODAY).tone).toBe("fine");
  });

  // A certified kitchen with no date never lapses and never warns. That is a
  // legitimate state, but the owner should know he has no safety net.
  it("flags a certificate with no expiry recorded", () => {
    const s = certificateState(k({ halalCertifiedUntil: null }), TODAY);
    expect(s.tone).toBe("unknown");
    expect(s.text).toContain("nothing will warn you");
    expect(needsAttention(s)).toBe(true);
  });

  it("does not crash on a malformed date", () => {
    const s = certificateState(k({ halalCertifiedUntil: "not-a-date" }), TODAY);
    expect(s.tone).toBe("unknown");
    expect(s.daysLeft).toBeNull();
  });

  it("shows something for every state that needs acting on", () => {
    for (const until of ["2026-08-01", TODAY, "2026-08-25", "2026-09-10", null]) {
      const s = certificateState(k({ halalCertifiedUntil: until }), TODAY);
      expect(needsAttention(s), String(until)).toBe(true);
      expect(s.text.length, String(until)).toBeGreaterThan(0);
    }
  });
});
