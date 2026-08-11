import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { authorizeCron } from "@/lib/cron-auth";
import {
  buildIngestionQuery,
  extractCount,
  interpretEventCount,
  notConfiguredVerdict,
  readHealthConfig,
  INGESTION_WINDOW_HOURS,
} from "@/lib/posthog-health";

export const dynamic = "force-dynamic";

// Daily PostHog silence alarm. See lib/posthog-health.ts for why this exists —
// short version: analytics fails silently, and this project has already shipped
// a PostHog install that received zero events while looking completely healthy.
//
// Reports through Sentry rather than a new channel, because Sentry is already
// the thing the owner watches and already has PII scrubbing on the way out.
// The payload here is a bare count, so there is nothing to scrub.

export async function GET(req: NextRequest) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const config = readHealthConfig();
  if (!config) {
    // Not an outage — the optional key simply is not set. 200 keeps the Vercel
    // cron green so a genuine failure still stands out.
    return NextResponse.json({ ok: true, ...notConfiguredVerdict() });
  }

  let verdict;
  try {
    const res = await fetch(`${config.apiHost}/api/projects/${config.projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.personalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: buildIngestionQuery() },
      }),
      // A hanging analytics API must not hang the cron.
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!res.ok) {
      verdict = {
        healthy: false,
        status: "error" as const,
        eventCount: null,
        windowHours: INGESTION_WINDOW_HOURS,
        // Status only. The body can echo request details and this string goes
        // into an alert.
        detail: `PostHog query API returned HTTP ${res.status}.`,
      };
    } else {
      verdict = interpretEventCount(extractCount(await res.json()));
    }
  } catch (err) {
    verdict = {
      healthy: false,
      status: "error" as const,
      eventCount: null,
      windowHours: INGESTION_WINDOW_HOURS,
      detail: `PostHog query failed: ${err instanceof Error ? err.name : "unknown error"}`,
    };
  }

  if (!verdict.healthy) {
    Sentry.captureMessage(`PostHog health: ${verdict.status} — ${verdict.detail}`, {
      level: verdict.status === "silent" ? "error" : "warning",
      tags: { check: "posthog-ingestion", posthog_status: verdict.status },
    });
  }

  // Always 200. The cron ran and produced an answer; an unhealthy answer is
  // reported through Sentry, not by failing the job, so "cron failed" keeps
  // meaning "the job could not run".
  return NextResponse.json({ ok: true, ...verdict });
}
