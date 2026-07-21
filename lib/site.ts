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
