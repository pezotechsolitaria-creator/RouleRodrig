import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { sendOwnerWhatsApp, invalidateWhatsAppConfig } from "@/lib/whatsapp";
import { guard } from "@/lib/rate-limit";

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

const digits = (s: string) => s.replace(/\D/g, "");

// ── Admin: read current WhatsApp-alert settings (apikey masked) ──────────
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("app_secrets")
    .select("key, value")
    .in("key", ["callmebot_apikey", "callmebot_phone"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const m: Record<string, string> = {};
  for (const r of (data ?? []) as { key: string; value: string }[]) m[r.key] = r.value;
  const key = (m["callmebot_apikey"] ?? "").trim();
  return NextResponse.json({
    phone: m["callmebot_phone"] ?? "",
    apikeySet: !!key,
    apikeyHint: key ? `••••${key.slice(-3)}` : "",
    envFallback: !!(process.env.CALLMEBOT_APIKEY && (process.env.CALLMEBOT_PHONE || process.env.OWNER_WHATSAPP)),
  });
}

// ── Admin: save new phone + apikey ───────────────────────────────────────
export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { phone?: string; apikey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const phone = digits((body.phone ?? "").toString()).slice(0, 20);
  const apikey = (body.apikey ?? "").toString().trim().slice(0, 40);
  if (!phone || phone.length < 7) {
    return NextResponse.json({ error: "Enter the full number with country code, e.g. 230 5835 5588." }, { status: 400 });
  }
  if (!apikey) {
    return NextResponse.json({ error: "The CallMeBot API key is required — activate the number first." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { error } = await supabase.from("app_secrets").upsert([
    { key: "callmebot_phone", value: phone },
    { key: "callmebot_apikey", value: apikey },
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateWhatsAppConfig();
  return NextResponse.json({ ok: true });
}

// ── Admin: send a test alert to the configured number ───────────────────
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = guard(req, "admin-wa-test", 10, 60_000);
  if (limited) return limited;
  invalidateWhatsAppConfig(); // always test with the freshest settings
  const ok = await sendOwnerWhatsApp(
    "Test from Roule Rodrigues admin - your WhatsApp alerts are working!",
  );
  if (!ok) {
    return NextResponse.json(
      { error: "Send failed. Check the number is activated with CallMeBot and the API key matches." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
