import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// ── Environment validation ───────────────────────────────────────────────────
// Fail the BUILD, not a customer's checkout.
//
// Without this, a deploy missing NEXT_PUBLIC_SUPABASE_URL succeeds, goes live,
// and then throws on the first database call — so the first person to discover
// the misconfiguration is a customer, and the symptom ("Something went wrong")
// says nothing about the cause. A build that refuses to finish is far cheaper
// than a site that half-works.
//
// REQUIRED = the app cannot function at all without it.
// WARNED   = a feature degrades, which is a deliberate choice, so it must not
//            block a deploy — but it should be stated out loud rather than
//            discovered later. CRON_SECRET is here on purpose: without it the
//            daily reminder job refuses to run, so reminders stop silently
//            unless someone is told. (It used to fail OPEN — see
//            lib/cron-auth.ts — which was worse and is why this line exists.)
function validateEnv() {
  // Skip during `next lint`/type-only runs and in test environments, where the
  // real values are legitimately absent.
  if (process.env.NODE_ENV === "test") return;

  // next.config is evaluated BEFORE Next loads .env.local, so process.env is
  // still bare here — the first version of this check failed every local build
  // even with a correctly populated .env.local. loadEnvConfig performs the same
  // file resolution Next itself uses, so validation sees exactly what the app
  // will see. On Vercel the vars are already in the environment and this is a
  // no-op.
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
    info: () => {},
    error: () => {},
  });

  // The browser key: lib/supabase/{client,server,middleware}.ts all read
  // PUBLISHABLE_KEY (Supabase's newer name). ANON_KEY is accepted as an alias
  // because older tooling and the E2E fixtures still use that name — requiring
  // the wrong one of the two is exactly the mistake this check exists to stop,
  // and it is the mistake the first version of this check made.
  const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL"];
  const BROWSER_KEYS = ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const WARNED = [
    ["SUPABASE_SERVICE_ROLE_KEY", "admin routes will return 503 and E2E fixtures cannot run"],
    ["SESSION_SECRET", "admin login cannot issue a session"],
    ["ADMIN_PASSWORD", "nobody can sign in to /admin"],
    ["CRON_SECRET", "the daily reminder job will refuse to run (503) — it fails closed"],
    ["NEXT_PUBLIC_SITE_URL", "absolute links in emails and SEO metadata may be wrong"],
  ] as const;

  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (!BROWSER_KEYS.some((k) => process.env[k]?.trim())) {
    missing.push(`${BROWSER_KEYS[0]} (or ${BROWSER_KEYS[1]})`);
  }
  if (missing.length) {
    throw new Error(
      `\n\n  Missing required environment variable(s):\n` +
        missing.map((k) => `    - ${k}`).join("\n") +
        `\n\n  The application cannot start without these. See TESTING.md for the full list.\n`,
    );
  }

  const warn = WARNED.filter(([k]) => !process.env[k]?.trim());
  if (warn.length && process.env.NODE_ENV === "production") {
    console.warn(
      `\n  Building without:\n` +
        warn.map(([k, why]) => `    - ${k} → ${why}`).join("\n") +
        `\n  Deliberate? Fine. Unintentional? Fix before deploying.\n`,
    );
  }
}

validateEnv();

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
  // PayPal's Smart Buttons load their SDK from paypal.com/paypalobjects.com and
  // open the checkout in an iframe, so both need script-src + frame-src grants.
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live https://www.paypal.com https://www.paypalobjects.com https://*.paypal.com https://*.posthog.com",
  "frame-src 'self' https://www.paypal.com https://*.paypal.com",
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

// Sentry wraps the config to upload source maps at build time, so a production
// stack trace names real files and line numbers instead of minified soup.
//
// The upload needs SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT. If any is
// missing the build still SUCCEEDS and errors still reach Sentry — you just get
// minified traces. That is the right failure mode: a token problem must never
// be able to break a deploy.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source maps are uploaded to Sentry and then deleted from the build output,
  // so they are readable in the dashboard but never served to the public — a
  // published source map hands an attacker the un-minified application.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Keep CI logs quiet unless something actually fails.
  silent: true,
  // Routes Sentry's own requests through this app's domain, so ad blockers and
  // strict corporate networks do not silently swallow error reports — which
  // would leave the dashboard looking reassuringly empty.
  tunnelRoute: "/monitoring",
  // Strips Sentry's debug logging from the client bundle.
  disableLogger: true,
});
