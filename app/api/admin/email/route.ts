import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { sendWaitlistWelcome, invalidateEmailConfig, emailProviderName, ownerInbox, ownerInboxIsExplicit } from "@/lib/email";
import { guard } from "@/lib/rate-limit";
import { getEmailConfig, saveEmailConfig } from "@/lib/email/config";
import { getProviderUsage, getReserveState } from "@/lib/email/quota";
import { recentActivity, recentProblems, statusCounts, topTypes } from "@/lib/email/log";
import { startOfUtcDay } from "@/lib/email/quota";
import { ALL_EMAIL_TYPES, EMAIL_TYPES } from "@/lib/email/types";

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── Admin: email settings + quota/observability snapshot ────────────────────
//
// One route, because it is one admin panel (Alerts & Email). §13 of the email
// brief asks not to build a separate dashboard when the existing one has the
// right home, and it does.
//
// NOTHING here returns a secret. The Brevo key is reported as a boolean plus a
// last-4 hint; provider health returns a NAME and a human reason; the config
// blob holds limits and routing only. Same rule /api/health already follows.
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("app_secrets")
    .select("key, value")
    .in("key", ["brevo_api_key", "email_from", "brevo_list_id", "brevo_transactional_list_id"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const m: Record<string, string> = {};
  for (const r of (data ?? []) as { key: string; value: string }[]) m[r.key] = r.value;
  const key = (m["brevo_api_key"] ?? "").trim();

  const since = startOfUtcDay();
  const config = await getEmailConfig();

  // Fired together — this panel is opened by one person occasionally, and the
  // round trips dominate otherwise.
  const [resend, brevo, reserve, activeProvider, todayTypes, activity, problems, statuses] = await Promise.all([
    getProviderUsage("resend", config),
    getProviderUsage("brevo", config),
    getReserveState(config),
    emailProviderName(),
    topTypes(since, undefined, 10),
    recentActivity({ limit: 25 }),
    recentProblems(15),
    statusCounts(since),
  ]);

  return NextResponse.json({
    // ── existing fields, unchanged shape so the current UI keeps working ──
    from: m["email_from"] ?? "",
    listId: m["brevo_list_id"] ?? "",
    apikeySet: !!key,
    apikeyHint: key ? `••••${key.slice(-4)}` : "",
    envFallback: !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY),

    // Where the seven internal alerts go, and whether that was CHOSEN or
    // inherited. OWNER_EMAIL was unset in production for months and every one
    // of those emails silently did nothing — no error, no log, nothing in this
    // panel. Reporting the address is what makes that impossible to repeat.
    // The value is the owner's own inbox shown to the owner, not a secret.
    ownerAlerts: {
      to: await ownerInbox(),
      explicit: await ownerInboxIsExplicit(),
    },

    // ── M41 ──
    transactionalListId: m["brevo_transactional_list_id"] ?? "",
    activeProvider,
    config,
    usage: { resend, brevo },
    reserve,
    todayTypes,
    activity,
    problems,
    statuses,
    // So the routing editor can list every type with its category and priority
    // without duplicating the registry in the client bundle.
    emailTypes: ALL_EMAIL_TYPES.map((t) => ({
      type: t,
      category: EMAIL_TYPES[t].category,
      priority: EMAIL_TYPES[t].priority,
      planned: "planned" in EMAIL_TYPES[t],
      provider: config.routing[t] ?? config.defaultProvider,
    })),
  });
}

// ── Admin: save Brevo API key + sender + lists ───────────────────────────────
export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { apikey?: string; from?: string; listId?: string; transactionalListId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let apikey = (body.apikey ?? "").toString().trim();
  const from = (body.from ?? "").toString().trim().slice(0, 160);
  const listIdRaw = (body.listId ?? "").toString().trim();
  const txListIdRaw = (body.transactionalListId ?? "").toString().trim();
  for (const [label, raw] of [
    ["marketing", listIdRaw],
    ["transactional", txListIdRaw],
  ] as const) {
    if (raw && !/^\d{1,10}$/.test(raw)) {
      return NextResponse.json(
        { error: `The Brevo ${label} list ID is a number — find it in Brevo → Contacts → Lists.` },
        { status: 400 },
      );
    }
  }
  // The whole point of two lists is that they are two audiences. Pointing both
  // at the same list would silently restore the consent bug M41 fixed.
  if (listIdRaw && txListIdRaw && listIdRaw === txListIdRaw) {
    return NextResponse.json(
      {
        error:
          "The marketing and transactional lists must be different. Sharing one list means every customer who books is also a campaign recipient — which is the consent problem these two lists exist to separate.",
      },
      { status: 400 },
    );
  }

  // Accept the raw xkeysib-… key, or the base64 blob Brevo shows on creation.
  if (apikey && !apikey.startsWith("xkeysib-")) {
    try {
      const decoded = JSON.parse(Buffer.from(apikey, "base64").toString("utf8"));
      if (typeof decoded?.api_key === "string" && decoded.api_key.startsWith("xkeysib-")) {
        apikey = decoded.api_key;
      }
    } catch {
      /* keep as-is; validated below */
    }
  }

  if (!apikey.startsWith("xkeysib-")) {
    return NextResponse.json(
      { error: "That doesn't look like a Brevo API key (it starts with xkeysib-…)." },
      { status: 400 },
    );
  }
  const fromEmail = /<\s*([^>]+)\s*>/.exec(from)?.[1]?.trim() || from;
  if (!EMAIL_RE.test(fromEmail)) {
    return NextResponse.json(
      { error: "Enter the sender email you verified in Brevo, e.g. Roule Rodrigues <you@gmail.com>." },
      { status: 400 },
    );
  }

  const supabase = await getPrivileged();
  const { error } = await supabase.from("app_secrets").upsert([
    { key: "brevo_api_key", value: apikey.slice(0, 120) },
    { key: "email_from", value: from },
    { key: "brevo_list_id", value: listIdRaw },
    { key: "brevo_transactional_list_id", value: txListIdRaw },
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateEmailConfig();
  return NextResponse.json({ ok: true });
}

// ── Admin: update the router configuration ──────────────────────────────────
// Limits, thresholds, reserves, per-type routing, fallback, retry. Validated and
// merged over the defaults by saveEmailConfig(), so a bad field degrades to a
// working value rather than disabling a quota check.
export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let patch: unknown;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const p = (patch ?? {}) as Record<string, unknown>;
  const th = p.thresholds as Record<string, number> | undefined;
  if (th) {
    const { watch, warning, critical } = { ...(await getEmailConfig()).thresholds, ...th };
    if (!(watch <= warning && warning <= critical && critical <= 100)) {
      return NextResponse.json(
        { error: "Thresholds must rise in order and stay at or below 100: watch ≤ warning ≤ critical ≤ 100." },
        { status: 400 },
      );
    }
  }

  // A reserve bigger than the bucket it sits in blocks ALL non-critical mail on
  // that provider. Refused with the arithmetic spelled out, because the number
  // that looks reasonable monthly (300) is nonsense daily against a 100/day cap.
  const reserves = p.reserves as { ticketing?: Record<string, unknown> } | undefined;
  if (reserves?.ticketing) {
    const current = await getEmailConfig();
    const t = { ...current.reserves.ticketing, ...reserves.ticketing } as {
      provider: "resend" | "brevo";
      daily: number;
      monthly: number;
    };
    const limits = current.providers[t.provider];
    if (limits.dailyLimit !== null && t.daily > limits.dailyLimit) {
      return NextResponse.json(
        {
          error: `A daily reserve of ${t.daily} does not fit ${t.provider}'s ${limits.dailyLimit}/day ceiling — it would block every non-critical email on that provider. Lower the reserve or raise the limit.`,
        },
        { status: 400 },
      );
    }
    if (limits.monthlyLimit !== null && t.monthly > limits.monthlyLimit) {
      return NextResponse.json(
        {
          error: `A monthly reserve of ${t.monthly} does not fit ${t.provider}'s ${limits.monthlyLimit}/month ceiling. Lower the reserve or raise the limit.`,
        },
        { status: 400 },
      );
    }
  }

  const saved = await saveEmailConfig(patch);
  invalidateEmailConfig();
  return NextResponse.json({ ok: true, config: saved });
}

// ── Admin: send a test email ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = guard(req, "admin-email-test", 10, 60_000);
  if (limited) return limited;
  let body: { to?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const to = (body.to ?? "").toString().trim();
  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Enter a valid email address to send the test to." }, { status: 400 });
  }
  // Pin the provider when asked. Without this a freshly-configured provider is
  // unverifiable — the test would route by type, succeed through whichever
  // provider the config prefers, and tell you nothing about the new one.
  const provider = body.provider === "resend" || body.provider === "brevo" ? body.provider : undefined;

  invalidateEmailConfig(); // always test with the freshest settings
  // `test: true` sends as the `admin_test` type with NO idempotency key —
  // otherwise a second test to the same address would be deduped and report
  // success without an email arriving, which defeats the point of a test button.
  const ok = await sendWaitlistWelcome(to, undefined, { test: true, provider });
  if (!ok) {
    const who = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "the email provider";
    return NextResponse.json(
      {
        error:
          `Send failed via ${who}. Check its API key and that the sender address is verified there ` +
          `(Brevo → Senders, or a verified domain in Resend). The exact provider error is listed below ` +
          `under "not delivered".`,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, provider: provider ?? null });
}
