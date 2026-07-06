import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { sendWaitlistWelcome, invalidateEmailConfig } from "@/lib/email";
import { guard } from "@/lib/rate-limit";

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── Admin: read current email settings (API key masked) ─────────────────
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("app_secrets")
    .select("key, value")
    .in("key", ["brevo_api_key", "email_from", "brevo_list_id"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const m: Record<string, string> = {};
  for (const r of (data ?? []) as { key: string; value: string }[]) m[r.key] = r.value;
  const key = (m["brevo_api_key"] ?? "").trim();
  return NextResponse.json({
    from: m["email_from"] ?? "",
    listId: m["brevo_list_id"] ?? "",
    apikeySet: !!key,
    apikeyHint: key ? `••••${key.slice(-4)}` : "",
    envFallback: !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY),
  });
}

// ── Admin: save Brevo API key + sender ───────────────────────────────────
export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { apikey?: string; from?: string; listId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let apikey = (body.apikey ?? "").toString().trim();
  const from = (body.from ?? "").toString().trim().slice(0, 160);
  const listIdRaw = (body.listId ?? "").toString().trim();
  if (listIdRaw && !/^\d{1,10}$/.test(listIdRaw)) {
    return NextResponse.json(
      { error: "The Brevo list ID is a number — find it in Brevo → Contacts → Lists." },
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
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateEmailConfig();
  return NextResponse.json({ ok: true });
}

// ── Admin: send a test email ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = guard(req, "admin-email-test", 10, 60_000);
  if (limited) return limited;
  let body: { to?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const to = (body.to ?? "").toString().trim();
  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Enter a valid email address to send the test to." }, { status: 400 });
  }
  invalidateEmailConfig(); // always test with the freshest settings
  const ok = await sendWaitlistWelcome(to);
  if (!ok) {
    return NextResponse.json(
      { error: "Send failed. Check the API key and that the sender email is verified in Brevo (Senders)." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
