// ── Free owner-only WhatsApp alerts via CallMeBot ───────────────────────────
// https://www.callmebot.com/blog/free-api-whatsapp-messages/
//
// Sends WhatsApp messages ONLY to the owner's opted-in number. It can never
// message customers, so it's used purely for internal alerts (new bookings,
// daily deliver/collect reminders).
//
// Config priority: the server-only `app_secrets` table FIRST (editable from
// the admin dashboard → Notifications, no redeploy needed), then env vars
// (CALLMEBOT_APIKEY + CALLMEBOT_PHONE / OWNER_WHATSAPP) as fallback.
// No-ops (never throws) if unset.

import { getPrivileged } from "@/lib/supabase/admin";

let cache: { apikey: string; phone: string; at: number } | null = null;
const TTL = 5 * 60 * 1000;

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Drop the config cache (called after the admin saves new settings). */
export function invalidateWhatsAppConfig(): void {
  cache = null;
}

async function getConfig(): Promise<{ apikey: string; phone: string }> {
  const envKey = process.env.CALLMEBOT_APIKEY || "";
  const envPhone = digits(process.env.CALLMEBOT_PHONE || process.env.OWNER_WHATSAPP || process.env.OWNER_PHONE);

  if (cache && Date.now() - cache.at < TTL) return cache;

  let dbKey = "";
  let dbPhone = "";
  try {
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["callmebot_apikey", "callmebot_phone"]);
    const m: Record<string, string> = {};
    for (const r of (data ?? []) as { key: string; value: string }[]) m[r.key] = r.value;
    dbKey = (m["callmebot_apikey"] ?? "").trim();
    dbPhone = digits(m["callmebot_phone"]);
  } catch {
    /* fall through to env */
  }

  // Admin-saved values win so the owner can change numbers without Vercel.
  const config = { apikey: dbKey || envKey, phone: dbPhone || envPhone, at: Date.now() };
  cache = config;
  return config;
}

// CallMeBot rejects emojis & most non-ASCII symbols. Keep plain printable text.
function asciiSafe(s: string): string {
  return s
    .replace(/[•·]/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[→]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[^\x20-\x7E\n]/g, "") // strip emojis / non-ASCII
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Send a WhatsApp alert to the owner. Best-effort: returns false (no throw) if unconfigured/fails. */
export async function sendOwnerWhatsApp(text: string): Promise<boolean> {
  const { apikey, phone } = await getConfig();
  if (!apikey || !phone) return false;
  const msg = asciiSafe(text);
  if (!msg) return false;
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${phone}` +
    `&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
