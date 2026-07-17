// Canonical site URL — set NEXT_PUBLIC_SITE_URL in Vercel (currently
// https://roulerodrig.com). Everything reads this: canonical tags, JSON-LD,
// the sitemap, email links, and the middleware redirect off the old
// vercel.app host — so they can never disagree with each other.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://roule-rodrig.vercel.app";

// The owner's real, routed contact address (Cloudflare Email Routing →
// their inbox). Verified live before being published anywhere: MX =
// route1/2/3.mx.cloudflare.net, SPF present.
//
// Only `bookings@` exists — `hello@` was never created, so never use it.
// This is NOT the PayPal address: that one identifies the actual PayPal
// account and lives in lib/email.ts (see the warning there).
export const CONTACT_EMAIL = "bookings@roulerodrig.com";
