// ── HOW A HALAL CERTIFICATE IS DOING ────────────────────────────────────────
//
// The database already refuses to show a lapsed certificate: food_catalog stops
// reporting the kitchen as certified the day it expires, and the derived halal
// tag goes with it, so the badge and the Halal filter fall silent together.
//
// That is the safe behaviour and it is silent — which is its own problem. The
// owner would discover the lapse by noticing that a kitchen quietly stopped
// appearing under Halal, weeks later, if at all. So the admin says it out loud
// while there is still time to renew.
//
// Pure, because the wording IS the feature: a warning nobody understands in
// time is the same as no warning.

export type CertificateTone = "expired" | "urgent" | "soon" | "unknown" | "fine" | "none";

export type CertificateState = {
  tone: CertificateTone;
  /** One line for the kitchen card. Empty when there is nothing to say. */
  text: string;
  /** Days until expiry — negative once lapsed, null when no date is recorded. */
  daysLeft: number | null;
};

/** Renewal is not a same-day errand on this island. A month is the warning. */
export const CERT_WARN_DAYS = 30;
export const CERT_URGENT_DAYS = 7;

function daysBetween(todayIso: string, untilIso: string): number | null {
  const a = Date.parse(`${todayIso}T00:00:00Z`);
  const b = Date.parse(`${untilIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * @param today  ISO date (YYYY-MM-DD) — passed in, never read from the clock,
 *               so the wording can be tested without freezing time.
 */
export function certificateState(
  kitchen: { halalCertified: boolean; halalCertifier: string | null; halalCertifiedUntil: string | null },
  today: string,
): CertificateState {
  if (!kitchen.halalCertified) return { tone: "none", text: "", daysLeft: null };

  if (!kitchen.halalCertifiedUntil) {
    // Not an error — some certifications carry no date, and refusing to show a
    // real one over a blank field would be its own kind of wrong. But an expiry
    // nobody recorded is an expiry nobody can be warned about.
    return {
      tone: "unknown",
      text: "No expiry recorded — nothing will warn you when this certificate lapses.",
      daysLeft: null,
    };
  }

  const daysLeft = daysBetween(today, kitchen.halalCertifiedUntil);
  if (daysLeft === null) {
    return { tone: "unknown", text: "Expiry date is not readable.", daysLeft: null };
  }

  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return {
      tone: "expired",
      // Says what already happened, not what might: the badge is gone from the
      // customer's screen the moment this reads expired.
      text: `Certificate expired ${ago} day${ago === 1 ? "" : "s"} ago — customers no longer see the halal badge.`,
      daysLeft,
    };
  }

  if (daysLeft <= CERT_URGENT_DAYS) {
    return {
      tone: "urgent",
      text: daysLeft === 0
        ? "Certificate expires today — the halal badge disappears tomorrow."
        : `Certificate expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — renew it now.`,
      daysLeft,
    };
  }

  if (daysLeft <= CERT_WARN_DAYS) {
    return { tone: "soon", text: `Certificate expires in ${daysLeft} days.`, daysLeft };
  }

  return { tone: "fine", text: "", daysLeft };
}

/** Whether this needs to be shown at all. */
export function needsAttention(s: CertificateState): boolean {
  return s.tone === "expired" || s.tone === "urgent" || s.tone === "soon" || s.tone === "unknown";
}
