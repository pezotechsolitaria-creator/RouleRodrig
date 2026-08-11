// ── Is PostHog actually receiving anything? ──────────────────────────────────
//
// This exists because of a real incident: PostHog was installed, deployed and
// visibly "working" — the SDK loaded, the token was present, no console error,
// no failed request — while the project had received exactly zero events since
// creation. The env var the code read was not the one that was set. Nothing in
// the application was unhealthy, so nothing anywhere complained.
//
// An analytics pipeline fails silently by construction: no user is blocked, no
// page 500s, and the only symptom is a dashboard that looks like a quiet week.
// The check therefore has to be a read-back — "did any real browser event
// arrive?" — because anything the server sends itself would keep passing while
// the browser SDK was broken.

export const INGESTION_WINDOW_HOURS = 24;

/**
 * HogQL run against the project's own events. Deliberately a bare count: it
 * carries no customer data in either direction, and it is the cheapest query
 * that can distinguish "silent" from "fine".
 */
export function buildIngestionQuery(windowHours: number = INGESTION_WINDOW_HOURS): string {
  return `SELECT count() FROM events WHERE timestamp >= now() - INTERVAL ${windowHours} HOUR`;
}

export type IngestionStatus = "healthy" | "silent" | "not_configured" | "error";

export type IngestionVerdict = {
  /** false only when something needs a human — drives the alert, not the HTTP code. */
  healthy: boolean;
  status: IngestionStatus;
  eventCount: number | null;
  windowHours: number;
  detail: string;
};

export type PostHogHealthConfig = {
  personalApiKey: string;
  projectId: string;
  apiHost: string;
};

/**
 * Reads config from the environment. Returns null when the personal API key is
 * absent, which is a legitimate state: the key is the one piece of this that
 * cannot be inferred from the repository, and the deployment must not start
 * failing crons merely because nobody has created one yet.
 */
export function readHealthConfig(
  env: Record<string, string | undefined> = process.env,
): PostHogHealthConfig | null {
  const personalApiKey = env.POSTHOG_PERSONAL_API_KEY?.trim();
  if (!personalApiKey) return null;

  return {
    personalApiKey,
    // Not secrets: the project id names a project and the host is public. Both
    // default to this deployment's own project so the check works with only the
    // API key configured.
    projectId: env.POSTHOG_PROJECT_ID?.trim() || "244679",
    apiHost: env.POSTHOG_API_HOST?.trim() || "https://eu.posthog.com",
  };
}

/**
 * Turns a raw count into a verdict. Split out from the fetch so the decision —
 * the part that determines whether a human gets woken up — is unit-testable
 * without a network.
 */
export function interpretEventCount(
  count: number | null,
  windowHours: number = INGESTION_WINDOW_HOURS,
): IngestionVerdict {
  if (count === null || Number.isNaN(count)) {
    return {
      healthy: false,
      status: "error",
      eventCount: null,
      windowHours,
      detail: "PostHog query returned no usable count.",
    };
  }

  if (count <= 0) {
    return {
      healthy: false,
      status: "silent",
      eventCount: 0,
      windowHours,
      detail:
        `PostHog has ingested no events in the last ${windowHours}h. ` +
        "Analytics is silently broken, or the site genuinely had no visitors.",
    };
  }

  return {
    healthy: true,
    status: "healthy",
    eventCount: count,
    windowHours,
    detail: `PostHog ingested ${count} events in the last ${windowHours}h.`,
  };
}

export function notConfiguredVerdict(
  windowHours: number = INGESTION_WINDOW_HOURS,
): IngestionVerdict {
  return {
    // Deliberately healthy: an unset optional key is a configuration gap, not
    // an outage, and paging on it would train everyone to ignore this check.
    healthy: true,
    status: "not_configured",
    eventCount: null,
    windowHours,
    detail:
      "POSTHOG_PERSONAL_API_KEY is not set, so ingestion cannot be verified. " +
      "Set it to enable the PostHog silence alarm.",
  };
}

/**
 * Pulls the scalar count out of a PostHog query response. The API returns
 * `{ results: [[42]] }`; this tolerates the shape drifting rather than throwing
 * inside a cron and turning a monitoring gap into a failing job.
 */
export function extractCount(payload: unknown): number | null {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const firstRow = results[0];
  const value = Array.isArray(firstRow) ? firstRow[0] : firstRow;

  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
