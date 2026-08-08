import "server-only";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  classifyHttp,
  classifyThrown,
  parseFrom,
  type EmailProvider,
  type ProviderHealth,
  type SendOutcome,
  type SendRequest,
} from "./types";

// ── Brevo adapter ───────────────────────────────────────────────────────────
// The provider live in production. Credential resolution moved here from
// lib/email.ts unchanged in behaviour: admin-saved values in `app_secrets`
// first (editable with no redeploy), env vars as fallback.
//
// QUOTA NOTE that belongs with this adapter specifically: Brevo's free 300/day
// is shared across marketing campaigns, this transactional API, AND the SMTP
// relay. Supabase Auth sends password resets and signup confirmations through
// that relay (docs/supabase-auth-emails.md), so a measurable part of this
// provider's ceiling is spent by traffic the application never sees. Anything
// counting Brevo usage from the application's own log is reporting a FLOOR.

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const CONTACTS_ENDPOINT = "https://api.brevo.com/v3/contacts";
const TTL = 5 * 60 * 1000;

export interface BrevoCredentials {
  key: string;
  from: string;
  /** Marketing/automation list. 0 when unset. */
  listId: number;
  /** Transactional-only list — lifecycle automations, never campaigns (M41). */
  transactionalListId: number;
}

let cache: { creds: BrevoCredentials; at: number } | null = null;

export function invalidateBrevoCredentials(): void {
  cache = null;
}

/**
 * Admin-saved config first, env fallback. Identical resolution order to the
 * original getBrevoConfig() in lib/email.ts — the sender still falls back to
 * RESEND_FROM last, which is odd-looking but was the existing behaviour and
 * removing it could silently unset a working sender on a live site.
 */
export async function getBrevoCredentials(): Promise<BrevoCredentials> {
  if (cache && Date.now() - cache.at < TTL) return cache.creds;
  let dbKey = "";
  let dbFrom = "";
  let dbList = "";
  let dbTxList = "";
  try {
    const { getPrivileged } = await import("@/lib/supabase/admin");
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["brevo_api_key", "email_from", "brevo_list_id", "brevo_transactional_list_id"]);
    const m: Record<string, string> = {};
    for (const r of (data ?? []) as { key: string; value: string }[]) m[r.key] = r.value;
    dbKey = (m["brevo_api_key"] ?? "").trim();
    dbFrom = (m["email_from"] ?? "").trim();
    dbList = (m["brevo_list_id"] ?? "").trim();
    dbTxList = (m["brevo_transactional_list_id"] ?? "").trim();
  } catch {
    /* fall through to env */
  }
  const toId = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const creds: BrevoCredentials = {
    key: dbKey || process.env.BREVO_API_KEY || "",
    from: dbFrom || process.env.BREVO_FROM || process.env.RESEND_FROM || "",
    listId: toId(dbList || process.env.BREVO_LIST_ID || ""),
    transactionalListId: toId(dbTxList || process.env.BREVO_TRANSACTIONAL_LIST_ID || ""),
  };
  cache = { creds, at: Date.now() };
  return creds;
}

export const brevoProvider: EmailProvider = {
  name: "brevo",

  async health(): Promise<ProviderHealth> {
    const { key, from } = await getBrevoCredentials();
    if (!key) return { configured: false, reason: "Brevo API key is not set (Admin → Alerts & Email)." };
    if (!from) {
      return {
        configured: false,
        reason: "Email sender is not set (Admin → Alerts & Email). It must be a sender verified in Brevo.",
      };
    }
    return { configured: true };
  },

  async send(req: SendRequest): Promise<SendOutcome> {
    const { key, from: fromRaw } = await getBrevoCredentials();
    if (!key) return { ok: false, failure: "auth", reason: "Brevo API key is not set" };
    if (!fromRaw) return { ok: false, failure: "auth", reason: "Email sender is not set (Admin → Alerts & Email)" };

    const sender = parseFrom(fromRaw);
    // Unauthenticated senders (e.g. a Gmail address) get their from-domain
    // rewritten to @brevosend.com, so Reply-To must be a real inbox or replies
    // vanish. Order: explicit env override, then the routed domain alias, then
    // the Brevo sender. Unchanged from the original implementation.
    const replyEmail = process.env.OWNER_EMAIL || CONTACT_EMAIL || sender.email;

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender,
          to: [{ email: req.to }],
          replyTo: { email: replyEmail, name: "Roule Rodrigues" },
          subject: req.subject,
          htmlContent: req.html,
          ...(req.attachments?.length
            ? { attachment: req.attachments.map((a) => ({ name: a.name, content: a.content })) }
            : {}),
        }),
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        const { failure, reason } = classifyHttp(res.status, text);
        console.error("[email] Brevo rejected send", res.status, failure);
        return { ok: false, failure, reason, status: res.status };
      }

      // Brevo returns { messageId }. 201 with a body normally; 204 possible.
      let messageId: string | null = null;
      try {
        messageId = (JSON.parse(text) as { messageId?: string })?.messageId ?? null;
      } catch {
        /* accepted without a parseable body */
      }
      return { ok: true, messageId };
    } catch (err) {
      const { failure, reason } = classifyThrown(err);
      console.error("[email] Brevo transport failure", failure);
      return { ok: false, failure, reason };
    }
  },
};

// ── Contact sync (marketing separation, M41) ────────────────────────────────

export interface BrevoContactInput {
  email: string;
  attributes: Record<string, string>;
  /**
   * Which list to join.
   *
   *   'transactional' — lifecycle automations only (booking confirmations,
   *                     pre-trip reminders). Placing a customer here is NOT
   *                     marketing consent and this list must never be used as
   *                     a campaign audience.
   *   'marketing'     — campaign audience. Requires an explicit opt-in.
   *   'none'          — create/update the contact, join nothing.
   */
  list: "transactional" | "marketing" | "none";
}

/**
 * Create or update a Brevo contact. Best-effort: never throws, no-ops without a
 * key. Returns false when nothing was synced.
 *
 * The `list` argument is the whole point of this signature. Before M41 every
 * booking pushed the customer into the single configured list — which doubles as
 * the campaign audience — so booking a scooter silently subscribed the customer
 * to marketing. Making the audience an explicit, named choice is what stops that
 * from being the default again.
 */
export async function upsertBrevoContactRaw(c: BrevoContactInput): Promise<boolean> {
  const { key, listId, transactionalListId } = await getBrevoCredentials();
  if (!key || !c.email) return false;

  let listIds: number[] = [];
  if (c.list === "marketing" && listId) listIds = [listId];
  // Falls back to no list at all rather than to the marketing list when no
  // transactional list is configured. The contact and its attributes still sync,
  // so automations keyed on attributes keep working, and the failure mode of a
  // missing setting is "no automation" rather than "unconsented marketing".
  else if (c.list === "transactional" && transactionalListId) listIds = [transactionalListId];

  try {
    const res = await fetch(CONTACTS_ENDPOINT, {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        email: c.email.toLowerCase(),
        updateEnabled: true,
        attributes: c.attributes,
        ...(listIds.length ? { listIds } : {}),
      }),
    });
    if (!res.ok && res.status !== 204) {
      console.error("[brevo] contact upsert failed", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[brevo] contact upsert error", err);
    return false;
  }
}
