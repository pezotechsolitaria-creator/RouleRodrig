import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { hasSharedLimiter, sharedLimiterDiagnostics } from "@/lib/rate-limit";
import { emailProviderName } from "@/lib/email";

export const dynamic = "force-dynamic";

// Mirrors `const CACHE` in public/sw.js. Duplicated deliberately: the service
// worker is served as a static file and cannot import from the app bundle, so
// there is no single source of truth available to both. Keep them in step when
// bumping — CLAUDE.md already requires the bump on every deploy, and surfacing
// it here is what makes a mismatch visible instead of mysterious.
// DRIFTED once already (this read v96 while public/sw.js was on v110), which is
// the one failure this constant exists to prevent — a health endpoint that
// confidently reports a stale answer is worse than one that reports nothing.
const SW_CACHE_VERSION = "rr-cache-v119";

// ── Health / readiness / liveness ────────────────────────────────────────────
// GET /api/health           → readiness (checks the database dependency)
// GET /api/health?probe=live → liveness (process is up; no dependencies)
//
// Use the readiness probe for load-balancer health checks and uptime monitors;
// use the liveness probe for container orchestrators that should NOT recycle
// the instance just because a downstream dependency is briefly unavailable.
// Which build is actually serving traffic. Without this the only way to answer
// "is the fix deployed yet?" is to guess from behaviour — and after a bad deploy
// that is precisely when guessing is most expensive. Vercel injects these at
// build time; locally they are absent and report "dev", which is itself useful.
//
// The commit sha is not a secret: it names a build, and the repository is the
// owner's. The service-worker cache version is included because a stale SW is
// this project's most common "the fix didn't work" cause, so an operator can
// compare what the server expects against what a browser reports.
function buildInfo() {
  return {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    swCache: SW_CACHE_VERSION,
    // WHERE this function actually ran. vercel.json pins `regions: ["fra1"]` to
    // sit beside the Frankfurt database, but a plan can silently ignore that —
    // and without this field the only way to tell a working pin from an ignored
    // one is to infer it from latency, which (see below) is far too noisy to
    // carry that weight. Vercel injects VERCEL_REGION; "dev1" or absent means
    // local. Not a secret: it names a datacentre, not a customer.
    region: process.env.VERCEL_REGION ?? "local",
  };
}

export async function GET(req: Request) {
  const probe = new URL(req.url).searchParams.get("probe");

  if (probe === "live") {
    return NextResponse.json(
      { status: "ok", probe: "liveness", build: buildInfo(), at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const started = Date.now();
  let db: "ok" | "degraded" = "ok";
  let dbLatencyMs: number | null = null;

  try {
    const supabase = await createClient();
    const t0 = Date.now();
    // Cheap, indexed probe query against the single content row.
    const { error } = await supabase.from("site_content").select("id").limit(1);
    dbLatencyMs = Date.now() - t0;
    if (error) db = "degraded";
  } catch {
    db = "degraded";
  }

  // Reads the admin-saved Brevo config as well as the env vars, so it reports
  // what send() would actually do rather than what the environment alone
  // suggests. Never throws — a failed lookup reports "unconfigured".
  let emailProvider: "resend" | "brevo" | "unconfigured" = "unconfigured";
  try {
    emailProvider = await emailProviderName();
  } catch {
    /* leave as unconfigured */
  }

  // Quota LEVEL only — never the counts.
  //
  // This endpoint is public. "238/300 emails sent today" would publish the
  // platform's order and booking volume to anyone who curls it, which is
  // business information, not health information. A level answers the only
  // question an uptime monitor actually has ("is mail about to stop?") and
  // leaks nothing: the exact numbers live behind the admin session in
  // /api/admin/email. Same principle as reporting adminBackend as
  // "configured" rather than echoing the key.
  let emailQuota: Record<string, string> | null = null;
  try {
    const { getEmailConfig } = await import("@/lib/email/config");
    const { getProviderUsage } = await import("@/lib/email/quota");
    const cfg = await getEmailConfig();
    const [resend, brevo] = await Promise.all([
      getProviderUsage("resend", cfg),
      getProviderUsage("brevo", cfg),
    ]);
    emailQuota = {
      // "unconfigured" is distinct from "normal": a provider with no key has no
      // quota problem precisely because it is doing no work.
      resend: resend.configured ? resend.level : "unconfigured",
      brevo: brevo.configured ? brevo.level : "unconfigured",
    };
  } catch {
    /* omit rather than report a level we could not compute */
  }

  const healthy = db === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      probe: "readiness",
      // Boolean only — never the key, never any part of it. Admin subscription
      // routes return 503 without it, and getPrivileged() otherwise degrades
      // silently to a non-privileged client, so this is the quickest way to
      // confirm a deploy is fully configured. Knowing that a secret IS set
      // gives an attacker nothing they could use to obtain it.
      build: buildInfo(),
      checks: {
        database: db,
        dbLatencyMs,
        adminBackend: hasServiceRole() ? "configured" : "unconfigured",
        // Booleans only, never the values. The cron guard fails closed on an
        // unset CRON_SECRET (lib/cron-auth.ts), which means the daily reminder
        // job stops rather than running unauthenticated — so "is it set?" is a
        // question an operator needs answerable without the Vercel dashboard.
        cron: process.env.CRON_SECRET?.trim() ? "configured" : "unconfigured",
        // "in-memory" is not a fault — it is the documented fallback, and every
        // limit still applies. But it means the ceiling is per-instance, so an
        // operator investigating abuse needs to know which mode is live before
        // concluding the limits are being ignored.
        rateLimiter: hasSharedLimiter() ? "shared" : "in-memory",
        // Only when it is NOT shared, and booleans only — never a value. Which
        // of the two variables is missing is the difference between "never set
        // them", "set them on Preview not Production", "typo'd a name" and "set
        // them but never redeployed", and each has a different fix.
        ...(hasSharedLimiter() ? {} : { rateLimiterEnv: sharedLimiterDiagnostics() }),
        // Provider NAME only — never a key, never the sender address. Guest
        // checkout is entirely email-dependent, and send() no-ops silently when
        // nothing is configured: the site looks healthy while every customer
        // email is discarded. "unconfigured" here means guest checkout is
        // effectively broken even though every other check is green.
        email: emailProvider,
        // Levels only (see above). Absent when it could not be computed.
        ...(emailQuota ? { emailQuota } : {}),
        // The canonical origin every confirmation link, tracking link and
        // JSON-LD URL is built from. If this is wrong, emails point at the
        // wrong host — a failure that is invisible until a customer clicks.
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "unset",
      },
      uptimeMs: Math.round(process.uptime() * 1000),
      totalMs: Date.now() - started,
      at: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
