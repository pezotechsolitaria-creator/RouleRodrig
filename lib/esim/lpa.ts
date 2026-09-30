// ── The activation string, and the three ways a phone can take it ───────────
//
// Every consumer eSIM is one string in GSMA SGP.22 format:
//
//     LPA:1$<SM-DP+ address>$<matching ID>
//
// e.g. LPA:1$rsp.example.com$ABCD-1234-EFGH. The QR code IS this string, the
// "enter details manually" screen asks for its two halves, and Apple's one-tap
// install link carries it whole. Parsing it in one place means the three can
// never disagree about which half is which.

export type ActivationParts = {
  /** The full string, normalised to start with "LPA:1$". */
  lpa: string;
  /** SM-DP+ address — the server the phone downloads the profile from. */
  smdpAddress: string;
  /** Matching ID / activation code — the one-time key for THIS profile. */
  activationCode: string;
};

/**
 * Parse an activation string, tolerating the forms wholesalers actually send:
 * with or without the "LPA:" prefix, with trailing confirmation-code fields,
 * with stray whitespace. Returns null for anything that is not one — a
 * success page that renders a QR of garbage is worse than one that says
 * "your eSIM is still being prepared".
 */
export function parseActivation(raw: string | null | undefined): ActivationParts | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const body = s.replace(/^LPA:/i, "");
  const parts = body.split("$");
  // "1$smdp$code" (+ optional OID / confirmation-required flag after).
  if (parts.length < 3 || parts[0] !== "1") return null;
  const smdpAddress = parts[1].trim();
  const activationCode = parts[2].trim();
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(smdpAddress) || !smdpAddress.includes(".")) return null;
  if (!/^[A-Za-z0-9-]{4,}$/.test(activationCode)) return null;
  return { lpa: `LPA:1$${smdpAddress}$${activationCode}`, smdpAddress, activationCode };
}

/** Build the string from its halves (some wholesalers return them separately). */
export function buildActivation(smdpAddress: string, activationCode: string): ActivationParts | null {
  return parseActivation(`LPA:1$${smdpAddress}$${activationCode}`);
}

/**
 * Apple's universal eSIM install link (iOS 17.4+). Tapped on an iPhone it
 * opens the system "Activate eSIM" sheet directly — no second device to show
 * the QR on, no camera, no typing. This is the single biggest support-ticket
 * reducer on the success page: most buyers are ON the phone the eSIM is for,
 * and a QR code cannot be scanned by the screen displaying it.
 */
export function appleInstallUrl(lpa: string): string {
  return `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`;
}

/**
 * Android's equivalent. Supported on Android 10+ devices whose OEM ships
 * Google's eSIM setup handler (Pixel, recent Samsung Galaxy). Where it is not
 * supported the link opens a Google page, not an error — so it is offered as
 * "try one-tap install", with the manual codes directly underneath.
 */
export function androidInstallUrl(lpa: string): string {
  return `https://esimsetup.android.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`;
}
