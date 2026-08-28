// Canonical site URL — set NEXT_PUBLIC_SITE_URL in Vercel (currently
// https://roulerodrig.com). Everything reads this: canonical tags, JSON-LD,
// the sitemap, email links, and the middleware redirect off the old
// vercel.app host — so they can never disagree with each other.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://roule-rodrig.vercel.app";

// PayPal processing fee passed on to the customer when they pay by PayPal (bank
// transfer has no fee). Shown clearly on the site and in the email — never a
// hidden charge. Default 4% is a reasonable estimate for a cross-border EUR
// payment received in Mauritius; set NEXT_PUBLIC_PAYPAL_FEE_PERCENT to your
// account's ACTUAL rate once you see it on a real payout.
export const PAYPAL_FEE_PERCENT = Number(process.env.NEXT_PUBLIC_PAYPAL_FEE_PERCENT) || 4;

// The owner's real, routed contact address (Cloudflare Email Routing →
// their inbox). Verified live before being published anywhere: MX =
// route1/2/3.mx.cloudflare.net, SPF present.
//
// Only `bookings@` exists — `hello@` was never created, so never use it.
// This is NOT the PayPal address: that one identifies the actual PayPal
// account and lives in lib/email.ts (see the warning there).
export const CONTACT_EMAIL = "bookings@roulerodrig.com";


// ── WHEN THE BUSINESS IS OPEN (M143) ────────────────────────────────────────
//
// Supplied by the owner on 2026-08-29: "9AM to 6PM everyday".
//
// It lives here as ONE value because it is rendered on the page AND emitted in
// LocalBusiness schema, and Google cross-checks the two. A structured opening
// time that disagrees with the visible one is the same class of fault as the
// address that said Port Mathurin while the page said Baie aux Huîtres — and
// that mismatch is one of the things that keeps a business out of the map pack.
//
// It was OWNER_REQUIRED until now, deliberately. An external audit stated
// "Mon–Sun 7am–8pm", presumably read off the Google Business Profile, and that
// was not good enough to publish: hours are a promise a customer turns up on,
// and a wrong one sends somebody to a closed door. These came from the owner.
//
// If the hours change, change them here — the schema and the contact line
// follow. If they ever become seasonal, this becomes a field in site content
// so the owner can edit it without a deploy.
export const OPENING_HOURS = {
  /** schema.org dayOfWeek values. Every day, so the full week. */
  days: [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
  ],
  opens: "09:00",
  closes: "18:00",
  /**
   * What a human reads, and where it comes from.
   *
   * The VISIBLE hours are content.contact.hours in the database, because the
   * owner edits them in /admin without a deploy. This label is the value that
   * field was set to, kept here so the machine-readable times above and the
   * published sentence can be checked against each other rather than trusted.
   *
   * They were NOT in agreement when this was written: the database said
   * "Mon-sun: 7am-8pm" while the owner's actual hours are 9am to 6pm. That is
   * a promise somebody turns up on, and it had been live long enough for an
   * external audit to quote it back as fact.
   */
  label: "Open every day, 9am – 6pm",
} as const;
