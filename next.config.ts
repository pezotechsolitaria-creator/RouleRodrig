import type { NextConfig } from "next";

// ── Content Security Policy ──────────────────────────────────────────────────
// Pragmatic, breakage-safe policy: it locks down the high-risk vectors
// (framing/clickjacking, base-tag hijacking, plugin/object injection, form
// exfiltration) while staying permissive on img/connect so Supabase Storage,
// QR images and map tiles keep working. 'unsafe-inline' on style/script is
// required by Next's inline bootstrap + framer-motion inline styles (we have
// no nonce pipeline yet — tracked as a future hardening step).
const ContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Force HTTPS for 2 years, include subdomains, allow preload-list submission
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Stop MIME-type sniffing (defense against drive-by content-type confusion)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt-and-braces clickjacking protection alongside frame-ancestors
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop access to powerful browser features the site never uses
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), browsing-topics=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework/version to attackers
  poweredByHeader: false,
  reactStrictMode: true,
  // Trim source maps from the client bundle in production
  productionBrowserSourceMaps: false,

  images: {
    // Serve modern formats automatically where the browser supports them
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "api.qrserver.com" },
    ],
  },

  async headers() {
    return [
      {
        // Apply hardened headers to every route
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Keep the admin area out of search engines even if a link leaks
        // (belt-and-braces with robots.txt, which crawlers may ignore)
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        // The service worker must never be cached aggressively
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
