// Lightweight email sender using the Resend REST API (no SDK dependency).
// Gracefully no-ops when RESEND_API_KEY is not configured, so bookings never
// break just because email isn't set up yet.
import { SITE_URL } from "./site";

interface BookingEmailData {
  name: string;
  email: string | null;
  phone: string | null;
  scooter: string;
  start_date: string;
  end_date: string;
  days: number;
  total_price: string | null;
  message: string | null;
  asset_label?: string | null;
  pickup_time?: string | null;
  return_time?: string | null;
}

// ── Brand system ─────────────────────────────────────────────────────────
// A small, consistent design language shared by every email so the whole
// lifecycle (confirmation → reminders → feedback) looks like one premium brand.
const C = {
  gold: "#F5C842",
  ink: "#0F0F0F",
  text: "#4A4A4A",
  muted: "#8C8C8C",
  line: "#ECECEC",
  soft: "#F7F6F2",
  card: "#FFFFFF",
  green: "#25D366",
};
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BRAND = C.gold; // kept for backwards-compat references

// ── WhatsApp one-tap buttons ─────────────────────────────────────────────
// We don't auto-send over WhatsApp (no paid API) — instead every email carries
// a pre-filled WhatsApp button so the customer or owner can message in one tap.
function waDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}
function waButton(phone: string | null | undefined, text: string, label: string): string {
  const d = waDigits(phone);
  if (!d) return "";
  const href = `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px auto 2px"><tr><td style="border-radius:12px;background:${C.green}">
    <a href="${href}" style="display:inline-block;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:12px">${label}</a>
  </td></tr></table>`;
}

// Business WhatsApp number for customer-facing buttons. Env first, then the
// number the owner saved for alerts (app_secrets.callmebot_phone) so the
// buttons light up without any extra configuration.
let ownerWaCache: { wa: string; at: number } | null = null;
async function getOwnerWa(): Promise<string> {
  const env = process.env.OWNER_WHATSAPP || process.env.OWNER_PHONE || "";
  if (env) return env;
  if (ownerWaCache && Date.now() - ownerWaCache.at < EMAIL_CFG_TTL) return ownerWaCache.wa;
  let wa = "";
  try {
    const { getPrivileged } = await import("./supabase/admin");
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", "callmebot_phone")
      .maybeSingle();
    wa = (data?.value ?? "").toString().trim();
  } catch {
    /* best-effort */
  }
  ownerWaCache = { wa, at: Date.now() };
  return wa;
}

function fmtTime(t?: string | null): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

// Parse a "Name <email@x>" string (or a bare address) into parts.
function parseFrom(raw: string): { email: string; name: string } {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(raw);
  if (m) return { name: m[1] || "Roule Rodrigues", email: m[2].trim() };
  return { name: "Roule Rodrigues", email: raw.trim() };
}

// ── Reusable, email-client-safe building blocks ──────────────────────────
// Hidden preview text shown in the inbox list next to the subject.
function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${text}${"&#8199;&#8203;".repeat(60)}</div>`;
}

function paragraph(html: string): string {
  return `<p style="font-family:${FONT};font-size:15px;line-height:1.65;color:${C.text};margin:0 0 16px">${html}</p>`;
}

function sectionLabel(text: string): string {
  return `<div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${C.ink};margin:2px 0 10px">${text}</div>`;
}

// Renders label/value pairs as tidy rows with hairline dividers.
function rows(pairs: [string, string][]): string {
  return pairs
    .map(
      ([k, v], i) =>
        `<tr>
          <td style="font-family:${FONT};padding:11px 0;color:${C.muted};font-size:13px;vertical-align:top;white-space:nowrap;${i ? `border-top:1px solid ${C.line};` : ""}">${k}</td>
          <td style="font-family:${FONT};padding:11px 0 11px 14px;color:${C.ink};font-weight:600;font-size:14px;text-align:right;${i ? `border-top:1px solid ${C.line};` : ""}">${v}</td>
        </tr>`,
    )
    .join("");
}

// Wraps a set of rows in a soft, rounded detail card.
function detailCard(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border:1px solid ${C.line};border-radius:14px;margin:0 0 22px">
    <tr><td style="padding:6px 20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    </td></tr>
  </table>`;
}

function checkList(items: string[]): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">` +
    items
      .map(
        (it) =>
          `<tr><td style="font-family:${FONT};padding:5px 0;color:${C.text};font-size:14px;line-height:1.55;vertical-align:top"><span style="color:${C.gold};font-weight:800;margin-right:9px">›</span>${it}</td></tr>`,
      )
      .join("") +
    `</table>`
  );
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px auto 4px"><tr><td style="border-radius:12px;background:${C.gold}">
    <a href="${href}" style="display:inline-block;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};text-decoration:none;padding:14px 32px;border-radius:12px">${label}</a>
  </td></tr></table>`;
}

/**
 * The master shell every email is built with: soft canvas, rounded white card,
 * dark branded header with tagline + gold rule, content area, and a footer with
 * the business identity. `eyebrow` is a small gold kicker above the title.
 */
function shell(opts: { preheader?: string; eyebrow?: string; title: string; body: string }): string {
  const { preheader: pre = "", eyebrow = "", title, body } = opts;
  return `${pre ? preheader(pre) : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};margin:0;padding:26px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border-radius:18px;overflow:hidden;border:1px solid ${C.line}">
        <tr><td style="background:${C.ink};padding:28px 32px;text-align:center">
          <div style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:2px;color:${C.gold}">ROULE&nbsp;RODRIGUES</div>
          <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:3px;color:#9a9a9a;margin-top:7px">SCOOTER RENTALS · RODRIGUES ISLAND</div>
        </td></tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.gold}">&nbsp;</td></tr>
        <tr><td style="padding:34px 32px 28px">
          ${eyebrow ? `<div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#b8912b;margin:0 0 12px">${eyebrow}</div>` : ""}
          <h1 style="font-family:${FONT};font-size:23px;line-height:1.3;font-weight:800;color:${C.ink};margin:0 0 18px">${title}</h1>
          ${body}
        </td></tr>
        <tr><td style="background:${C.soft};border-top:1px solid ${C.line};padding:24px 32px;text-align:center">
          <div style="font-family:${FONT};font-size:13px;font-weight:700;color:${C.ink}">Roule Rodrigues</div>
          <div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:5px;line-height:1.7">
            Port Mathurin · Rodrigues Island, Mauritius<br>
            <a href="${SITE_URL}" style="color:#b8912b;text-decoration:none;font-weight:600">Visit our website →</a>
          </div>
        </td></tr>
      </table>
      <div style="font-family:${FONT};font-size:11px;color:#b6b6b6;margin-top:16px;line-height:1.6;max-width:600px">
        You received this email because you contacted or booked with Roule Rodrigues.
      </div>
    </td></tr>
  </table>`;
}

// ── Brevo config: admin-saved values (app_secrets) first, env fallback ──
// Same pattern as the WhatsApp alerts — the owner can paste the API key and
// sender in Admin → Alerts & Email with no redeploy.
let emailCfg: { key: string; from: string; listId: number; at: number } | null = null;
const EMAIL_CFG_TTL = 5 * 60 * 1000;

/** Drop the cached email config (called after the admin saves new settings). */
export function invalidateEmailConfig(): void {
  emailCfg = null;
  ownerWaCache = null;
}

/**
 * True when Brevo is configured WITH a contact list — meaning the owner has
 * set up Brevo automations to send the day-before pickup + return reminders.
 * When true, the built-in cron skips those two CUSTOMER emails so there are no
 * duplicates (owner alerts + feedback + digest still run). When Brevo has no
 * list configured, the built-in reminders stay on so customers are never left
 * without one.
 */
export async function brevoRemindersEnabled(): Promise<boolean> {
  const { key, listId } = await getBrevoConfig();
  return !!(key && listId);
}

async function getBrevoConfig(): Promise<{ key: string; from: string; listId: number }> {
  if (emailCfg && Date.now() - emailCfg.at < EMAIL_CFG_TTL) return emailCfg;
  let dbKey = "";
  let dbFrom = "";
  let dbList = "";
  try {
    const { getPrivileged } = await import("./supabase/admin");
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["brevo_api_key", "email_from", "brevo_list_id"]);
    const m: Record<string, string> = {};
    for (const r of (data ?? []) as { key: string; value: string }[]) m[r.key] = r.value;
    dbKey = (m["brevo_api_key"] ?? "").trim();
    dbFrom = (m["email_from"] ?? "").trim();
    dbList = (m["brevo_list_id"] ?? "").trim();
  } catch {
    /* fall through to env */
  }
  const listRaw = dbList || process.env.BREVO_LIST_ID || "";
  const listId = Number.parseInt(listRaw, 10);
  const cfg = {
    key: dbKey || process.env.BREVO_API_KEY || "",
    from: dbFrom || process.env.BREVO_FROM || process.env.RESEND_FROM || "",
    listId: Number.isFinite(listId) && listId > 0 ? listId : 0,
    at: Date.now(),
  };
  emailCfg = cfg;
  return cfg;
}

/**
 * Create/update a Brevo CONTACT and add it to the configured list, so Brevo
 * automations (confirmation, instructions, pre-trip reminder) can trigger on
 * "contact joins list". Best-effort: never throws, no-ops without a key.
 * The automation workflows themselves are built inside Brevo, not in code.
 */
export async function upsertBrevoContact(c: {
  email: string;
  firstName?: string | null;
  phone?: string | null;
  vehicle?: string | null;
  bookingId?: string | null;
  pickupDate?: string | null;  // ISO date
  pickupTime?: string | null;  // HH:MM
  returnDate?: string | null;  // ISO date
  returnTime?: string | null;  // HH:MM
}): Promise<boolean> {
  const { key, listId } = await getBrevoConfig();
  if (!key || !c.email) return false;
  // These become Brevo contact attributes (auto-created on first use), so the
  // automation email templates can render {{ contact.VEHICLE }}, etc.
  const attributes: Record<string, string> = {};
  if (c.firstName) attributes.FIRSTNAME = c.firstName.slice(0, 80);
  if (c.phone) attributes.PHONE = c.phone.slice(0, 30);
  if (c.vehicle) attributes.VEHICLE = c.vehicle.slice(0, 80);
  if (c.bookingId) attributes.BOOKING_ID = c.bookingId.slice(0, 40);
  if (c.pickupDate) {
    attributes.PICKUP_DATE = fmtDate(c.pickupDate);       // display text, e.g. "12 Jul 2026"
    attributes.PICKUP_ON = c.pickupDate.slice(0, 10);      // ISO date for date-triggered automations
  }
  if (c.pickupTime) attributes.PICKUP_TIME = fmtTime(c.pickupTime);
  if (c.returnDate) {
    attributes.RETURN_DATE = fmtDate(c.returnDate);
    attributes.RETURN_ON = c.returnDate.slice(0, 10);
  }
  if (c.returnTime) attributes.RETURN_TIME = fmtTime(c.returnTime);
  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        email: c.email.toLowerCase(),
        updateEnabled: true,
        attributes,
        ...(listId ? { listIds: [listId] } : {}),
      }),
    });
    if (!res.ok && res.status !== 204) {
      console.error("[brevo] contact upsert failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[brevo] contact upsert error", err);
    return false;
  }
}

/**
 * Sends one email via whichever provider is configured:
 *   • Resend  — set RESEND_API_KEY (+ RESEND_FROM). Needs a verified domain.
 *   • Brevo   — key + sender from Admin → Alerts & Email (or BREVO_API_KEY /
 *               BREVO_FROM env). Works with just a verified sender email
 *               (e.g. a Gmail) — no domain required.
 * No-ops cleanly when neither is set, so the app never breaks.
 */
async function send(to: string, subject: string, html: string): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  const brevo = await getBrevoConfig();
  const brevoKey = brevo.key;

  // ── Resend ──
  if (resendKey) {
    const from = process.env.RESEND_FROM || "Roule Rodrigues <onboarding@resend.dev>";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!res.ok) {
        console.error("[email] Resend error", res.status, await res.text().catch(() => ""));
        return false;
      }
      return true;
    } catch (err) {
      console.error("[email] Resend send failed", err);
      return false;
    }
  }

  // ── Brevo (no domain needed — verified sender email is enough) ──
  if (brevoKey) {
    const fromRaw = brevo.from;
    if (!fromRaw) {
      console.error("[email] Email sender not set (Admin → Alerts & Email) — skipping email to", to);
      return false;
    }
    const sender = parseFrom(fromRaw);
    // Because unauthenticated Gmail senders get their from-domain rewritten to
    // @brevosend.com, set Reply-To to the real address so replies reach the
    // owner's inbox (falls back to OWNER_EMAIL).
    const replyEmail = process.env.OWNER_EMAIL || sender.email;
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          replyTo: { email: replyEmail, name: "Roule Rodrigues" },
          subject,
          htmlContent: html,
        }),
      });
      if (!res.ok) {
        console.error("[email] Brevo error", res.status, await res.text().catch(() => ""));
        return false;
      }
      return true;
    } catch (err) {
      console.error("[email] Brevo send failed", err);
      return false;
    }
  }

  console.log("[email] No email provider set (RESEND_API_KEY or BREVO_API_KEY) — skipping email to", to);
  return false;
}

function summaryRows(b: BookingEmailData): string {
  const pairs: [string, string][] = [["Vehicle", b.scooter]];
  if (b.asset_label) pairs.push(["Unit", b.asset_label]);
  pairs.push(
    ["Pickup", fmtDate(b.start_date) + (b.pickup_time ? ` · ${fmtTime(b.pickup_time)}` : "")],
    ["Return", fmtDate(b.end_date) + (b.return_time ? ` · ${fmtTime(b.return_time)}` : "")],
    ["Duration", `${b.days} day${b.days !== 1 ? "s" : ""}`],
  );
  if (b.total_price) pairs.push(["Estimated total", b.total_price]);
  return rows(pairs);
}

/**
 * Sends a confirmation to the customer (if they gave an email) and a
 * notification to the business owner (if OWNER_EMAIL is set).
 * Never throws — returns a small status object.
 */
export async function sendBookingEmails(b: BookingEmailData): Promise<{ customer: boolean; owner: boolean }> {
  const result = { customer: false, owner: false };
  const wa = await getOwnerWa();

  // ── Customer confirmation ──
  if (b.email) {
    const body = `
      ${paragraph(
        `Thank you for choosing Roule Rodrigues. We've received your booking request and our team will confirm availability and payment details shortly — usually within a few hours, often via WhatsApp.`,
      )}
      ${sectionLabel("Your booking")}
      ${detailCard(summaryRows(b))}
      ${sectionLabel("Before your pickup, please bring")}
      ${checkList(["A valid driver's licence", "Your booking confirmation", "A valid ID or passport if requested"])}
      ${paragraph(
        `Please arrive 10–15 minutes early so we can walk you through the vehicle together before you set off. Have a question in the meantime? Simply reply to this email — we look forward to welcoming you!`,
      )}
      ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! I just booked the ${b.scooter} for ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}.`, "💬 Message us on WhatsApp")}</div>` : ""}`;
    result.customer = await send(
      b.email,
      "Your Roule Rodrigues booking request 🛵",
      shell({
        preheader: "We've received your booking — we'll confirm availability shortly.",
        eyebrow: "Booking received",
        title: `Thank you, ${b.name}!`,
        body,
      }),
    );
  }

  // ── Owner notification ──
  const owner = process.env.OWNER_EMAIL;
  if (owner) {
    const ownerRows: [string, string][] = [];
    const body = `
      ${paragraph(`You have a new booking request. Details below — manage it in your admin dashboard under <strong>Bookings</strong>.`)}
      ${detailCard(
        summaryRows(b) +
          rows([
            ...(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []),
            ...(b.email ? ([["Email", b.email]] as [string, string][]) : []),
            ...ownerRows,
          ]),
      )}
      ${b.message ? paragraph(`<strong style="color:${C.ink}">Customer note:</strong> ${b.message}`) : ""}
      ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, thanks for your Roule Rodrigues booking request for the ${b.scooter}! `, "💬 Message " + b.name)}</div>` : ""}`;
    result.owner = await send(
      owner,
      `New booking: ${b.name} — ${b.scooter}`,
      shell({ eyebrow: "New booking request", title: b.name, body }),
    );
  }

  return result;
}

// ── Reminder / feedback emails (sent by the daily cron) ──────────────────

/** Reminder sent the day before pickup. */
export async function sendPickupReminder(b: BookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const wa = await getOwnerWa();
  const body = `
    ${paragraph(`Hi ${b.name}, this is a friendly reminder that your rental starts <strong>tomorrow</strong>. 🛵`)}
    ${detailCard(summaryRows(b))}
    ${paragraph(`Please bring your driver's licence and arrive a few minutes early. We can't wait to help you discover Rodrigues Island — see you tomorrow!`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi! About my Roule Rodrigues pickup tomorrow (${b.scooter}) — `, "💬 Message us on WhatsApp")}</div>` : ""}`;
  return send(
    b.email,
    "Your Roule Rodrigues rental is tomorrow 🛵",
    shell({ preheader: "Pickup is tomorrow — here's everything you need.", eyebrow: "Pickup reminder", title: "See you tomorrow!", body }),
  );
}

/** Reminder sent the day before the return is due. */
export async function sendReturnReminder(b: BookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const wa = await getOwnerWa();
  const body = `
    ${paragraph(`Hi ${b.name}, a friendly reminder that your vehicle is due back <strong>tomorrow</strong> (${fmtDate(b.end_date)}).`)}
    ${detailCard(summaryRows(b))}
    ${sectionLabel("Before returning, please")}
    ${checkList([
      "Return it with the agreed fuel level",
      "Bring back the keys and any accessories provided",
      "Let us know right away if you had any issue during your rental",
    ])}
    ${paragraph(`Thank you for choosing Roule Rodrigues — we hope you had an amazing time exploring the island, and we'd love to welcome you again on your next visit! 💛`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi! About my Roule Rodrigues return (${b.scooter}) — `, "💬 Message us on WhatsApp")}</div>` : ""}`;
  return send(
    b.email,
    "Reminder: your return is tomorrow",
    shell({ preheader: "Your vehicle is due back tomorrow — a quick checklist inside.", eyebrow: "Return reminder", title: "Return reminder", body }),
  );
}

// ── Post-rental feedback request (sent the day after return) ──────────────
export async function sendFeedbackRequest(b: BookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const wa = await getOwnerWa();
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#reviews`;
  const body = `
    ${paragraph(`Hi ${b.name}, we hope you loved exploring Rodrigues! 🌴 How was your ride with the ${b.scooter}?`)}
    ${paragraph(`A quick review means the world to a small island business — it takes about 30 seconds and helps other travellers discover us.`)}
    <div style="text-align:center">${primaryButton(reviewUrl, "⭐ Leave a review")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! Here's my feedback on the ${b.scooter}: `, "💬 Send feedback on WhatsApp")}</div>` : ""}`;
  return send(
    b.email,
    "How was your ride? 🛵 We'd love your feedback",
    shell({ preheader: "A 30-second review helps other travellers find us.", eyebrow: "Your feedback", title: "Thanks for riding with us!", body }),
  );
}

// ── Owner / admin reminders (sent the day before) ────────────────────────
function ownerActionEmail(b: BookingEmailData, kind: "deliver" | "collect"): string {
  const verb = kind === "deliver" ? "Deliver" : "Collect";
  const when = kind === "deliver" ? fmtDate(b.start_date) : fmtDate(b.end_date);
  const body = `
    ${paragraph(`<strong style="color:${C.ink}">${verb} tomorrow</strong> (${when}) for <strong>${b.name}</strong>.`)}
    ${detailCard(summaryRows(b) + rows(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []))}
    ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.scooter} ${kind === "deliver" ? "pickup" : "return"} tomorrow — `, "💬 Message " + b.name)}</div>` : ""}`;
  return shell({ eyebrow: `${verb} reminder`, title: `${verb} tomorrow`, body });
}

/** Owner reminder: a scooter needs delivering tomorrow. */
export async function sendAdminPickupReminder(b: BookingEmailData): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL;
  if (!owner) return false;
  return send(owner, `🛵 Deliver tomorrow: ${b.name} — ${b.scooter}`, ownerActionEmail(b, "deliver"));
}

/** Owner reminder: a scooter is due back tomorrow. */
export async function sendAdminReturnReminder(b: BookingEmailData): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL;
  if (!owner) return false;
  return send(owner, `↩️ Collect tomorrow: ${b.name} — ${b.scooter}`, ownerActionEmail(b, "collect"));
}

// ── Stay · Eat · Do reservations ─────────────────────────────────────────
interface PlaceBookingEmailData {
  place_name: string;
  category: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  start_date: string;
  end_date: string;
  guests: number | null;
  quantity?: number | null;
  time_slot?: string | null;
  message: string | null;
}

function placeRows(b: PlaceBookingEmailData): string {
  const sameDay = b.start_date === b.end_date;
  const pairs: [string, string][] = [
    ["Place", b.place_name],
    [sameDay ? "Date" : "Check-in", fmtDate(b.start_date)],
  ];
  if (!sameDay) pairs.push(["Check-out", fmtDate(b.end_date)]);
  if (b.time_slot) pairs.push(["Time", b.time_slot]);
  const qty = b.quantity ?? 0;
  if (qty > 0) {
    const unit = b.category === "hotel" ? "Rooms" : b.category === "restaurant" ? "Party size" : "People";
    pairs.push([unit, String(qty)]);
  }
  if (b.guests) pairs.push(["Guests", String(b.guests)]);
  return rows(pairs);
}

/** Customer confirmation + owner notification for a Stay·Eat·Do reservation. */
export async function sendPlaceBookingEmails(b: PlaceBookingEmailData): Promise<{ customer: boolean; owner: boolean }> {
  const result = { customer: false, owner: false };
  const wa = await getOwnerWa();

  if (b.email) {
    const body = `
      ${paragraph(`Hi ${b.name}, we've received your reservation request for <strong>${b.place_name}</strong>. Our team will confirm availability with the venue and get back to you shortly.`)}
      ${detailCard(placeRows(b))}
      ${paragraph(`<span style="color:${C.muted};font-size:13px">This is a request, not yet a confirmed reservation — we'll be in touch to finalise everything.</span>`)}
      ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! I just requested ${b.place_name} for ${fmtDate(b.start_date)}.`, "💬 Message us on WhatsApp")}</div>` : ""}`;
    result.customer = await send(
      b.email,
      `Your ${b.place_name} reservation request 🌴`,
      shell({ preheader: "We've received your reservation — confirmation to follow.", eyebrow: "Reservation received", title: "Thanks for your reservation!", body }),
    );
  }

  const owner = process.env.OWNER_EMAIL;
  if (owner) {
    const body = `
      ${paragraph(`New <strong>Stay·Eat·Do</strong> reservation request from <strong>${b.name}</strong>.`)}
      ${detailCard(
        placeRows(b) +
          rows([
            ...(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []),
            ...(b.email ? ([["Email", b.email]] as [string, string][]) : []),
          ]),
      )}
      ${b.message ? paragraph(`<strong style="color:${C.ink}">Note:</strong> ${b.message}`) : ""}
      ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.place_name} reservation — `, "💬 Message " + b.name)}</div>` : ""}
      ${paragraph(`<span style="color:${C.muted};font-size:12px">Manage this in your admin dashboard → Stay·Eat·Do Bookings.</span>`)}`;
    result.owner = await send(
      owner,
      `New reservation: ${b.name} — ${b.place_name}`,
      shell({ eyebrow: "New reservation request", title: b.name, body }),
    );
  }

  return result;
}

/** Customer reminder the day before a Stay·Eat·Do reservation. */
export async function sendPlaceReminder(b: PlaceBookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const wa = await getOwnerWa();
  const body = `
    ${paragraph(`Hi ${b.name}, a friendly reminder — your reservation at <strong>${b.place_name}</strong> is <strong>tomorrow</strong> (${fmtDate(b.start_date)}). 🌴`)}
    ${detailCard(placeRows(b))}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi! About my ${b.place_name} reservation tomorrow — `, "💬 Message us on WhatsApp")}</div>` : ""}`;
  return send(
    b.email,
    `Reminder: your ${b.place_name} reservation is tomorrow 🌴`,
    shell({ preheader: "Your reservation is tomorrow — see you soon!", eyebrow: "Reservation reminder", title: "See you tomorrow!", body }),
  );
}

/** Customer feedback request the day after a Stay·Eat·Do reservation. */
export async function sendPlaceFeedbackRequest(b: PlaceBookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const wa = await getOwnerWa();
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#reviews`;
  const body = `
    ${paragraph(`Hi ${b.name}, how was <strong>${b.place_name}</strong>? We'd love to hear about it — a quick review helps other travellers and the local business. 💛`)}
    <div style="text-align:center">${primaryButton(reviewUrl, "⭐ Leave a review")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! Here's my feedback on ${b.place_name}: `, "💬 Send feedback on WhatsApp")}</div>` : ""}`;
  return send(
    b.email,
    `How was ${b.place_name}? 🌴 We'd love your feedback`,
    shell({ preheader: "A quick review helps other travellers.", eyebrow: "Your feedback", title: "Thanks for visiting!", body }),
  );
}

/** Owner reminder: a Stay·Eat·Do reservation is happening tomorrow. */
export async function sendAdminPlaceReminder(b: PlaceBookingEmailData): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL;
  if (!owner) return false;
  const body = `
    ${paragraph(`<strong style="color:${C.ink}">Reservation tomorrow</strong> (${fmtDate(b.start_date)}) — <strong>${b.name}</strong> at <strong>${b.place_name}</strong>.`)}
    ${detailCard(placeRows(b) + rows(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []))}
    ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.place_name} reservation tomorrow — `, "💬 Message " + b.name)}</div>` : ""}`;
  return send(owner, `🌴 Reservation tomorrow: ${b.name} — ${b.place_name}`, shell({ eyebrow: "Reservation reminder", title: "Reservation tomorrow", body }));
}

// ── Instant enquiry auto-reply ───────────────────────────────────────────
export async function sendEnquiryAck(to: string, name: string | null): Promise<boolean> {
  const wa = await getOwnerWa();
  const hi = name ? `Hi ${name},` : "Hi there,";
  const body = `
    ${paragraph(`${hi} thanks for reaching out to Roule Rodrigues! 🛵 We've received your message and a real person will get back to you within a few hours (we're on island time, UTC+4).`)}
    ${paragraph(`Need a faster answer? Message us directly on WhatsApp — we usually reply within minutes.`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, "Hi Roule Rodrigues! I just sent an enquiry through your website. ", "💬 Chat on WhatsApp")}</div>` : ""}`;
  return send(
    to,
    "We've got your message 🛵 — Roule Rodrigues",
    shell({ preheader: "We've received your message — we'll reply shortly.", eyebrow: "Message received", title: "Thanks for getting in touch!", body }),
  );
}

// ── Waitlist / saved-list welcome (lifecycle remarketing) ────────────────
export async function sendWaitlistWelcome(to: string, source?: string): Promise<boolean> {
  const wa = await getOwnerWa();
  const savedList = source === "saved-list";
  const intro = savedList
    ? "Thanks for saving your favourites on Roule Rodrigues! Your list is ready whenever you are — come back any time to pick up where you left off and book."
    : "Thanks for joining Roule Rodrigues! 🌴 We'll send you the best island tips, scooter deals and hidden spots from Rodrigues — no spam, ever.";
  const body = `
    ${paragraph(intro)}
    <div style="text-align:center">${primaryButton(SITE_URL, "Plan your Rodrigues trip →")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, "Hi Roule Rodrigues! I'd love some help planning my trip. ", "💬 Chat on WhatsApp")}</div>` : ""}`;
  return send(
    to,
    savedList ? "Your Roule Rodrigues list is saved 🛵" : "Welcome to Roule Rodrigues 🛵🌴",
    shell({
      preheader: savedList ? "Your saved list is waiting whenever you're ready." : "Island tips, deals and hidden spots from Rodrigues.",
      eyebrow: savedList ? "Your saved list" : "Welcome aboard",
      title: savedList ? "Your saved list is waiting" : "Welcome aboard!",
      body,
    }),
  );
}
