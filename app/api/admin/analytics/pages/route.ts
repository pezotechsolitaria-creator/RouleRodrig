import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/admin/api-guard";
import { readHealthConfig } from "@/lib/posthog-health";
import {
  buildPageviewQuery,
  parseResults,
  buildReport,
} from "@/lib/analytics/pages";

// ── "WHICH PAGES ARE WORKING?" ──────────────────────────────────────────────
//
// PostHog has been recording $pageview since it was installed, and until now
// the only thing that ever read it back was the health cron, which asks whether
// ANY event arrived. That answers "is the pipe blocked" and nothing about the
// business.
//
// This runs one grouped HogQL query and pairs it with the enquiries already in
// lead_events. Nothing new is collected and no new tracking is added: the
// numbers existed, they simply had nowhere to be seen.
//
// PRIVACY, because this is the kind of endpoint where it slips: the query asks
// for pathnames and counts. No person id leaves PostHog, no email or phone is
// selected, and nothing is joined to a customer record. lib/analytics/pages.ts
// has a test asserting the query names no personal field.

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90];

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Page analytics");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const asked = Number(req.nextUrl.searchParams.get("days"));
  const windowDays = WINDOWS.includes(asked) ? asked : 30;

  const config = readHealthConfig();
  if (!config) {
    // A legitimate state, not an error: the personal API key is the one piece
    // of this that cannot be inferred from the repo. Say exactly what to add
    // rather than showing an empty chart that looks like a quiet month.
    return NextResponse.json({
      ok: false,
      reason: "not_configured",
      detail:
        "Set POSTHOG_PERSONAL_API_KEY in the environment to read page analytics. Everything else is already in place.",
    });
  }

  let rows;
  try {
    const res = await fetch(
      `${config.apiHost}/api/projects/${config.projectId}/query/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.personalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: { kind: "HogQLQuery", query: buildPageviewQuery(windowDays) },
        }),
        // An analytics API that hangs must not hang the admin page.
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        reason: "upstream",
        // Status only: the body can echo request details back.
        detail: `PostHog returned HTTP ${res.status}.`,
      });
    }
    const body = (await res.json()) as { results?: unknown };
    rows = parseResults(body.results);
  } catch {
    return NextResponse.json({
      ok: false,
      reason: "upstream",
      detail: "Could not reach PostHog.",
    });
  }

  // The enquiries side. Counted over the same window so the two halves of every
  // rate describe the same days — a conversion rate built from mismatched
  // windows is worse than no rate at all.
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const leadsByKind: Record<string, number> = {};
  const { data: leadRows } = await admin
    .from("lead_events")
    .select("kind")
    .gte("created_at", since);
  for (const r of (leadRows ?? []) as { kind: string }[]) {
    leadsByKind[r.kind] = (leadsByKind[r.kind] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    ...buildReport(rows, leadsByKind, windowDays),
    leadsByKind,
  });
}
