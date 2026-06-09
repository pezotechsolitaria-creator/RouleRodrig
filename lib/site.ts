// Canonical site URL — override with NEXT_PUBLIC_SITE_URL when a custom
// domain (e.g. https://roulerodrigues.mu) is connected in Vercel.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://roule-rodrig.vercel.app";
