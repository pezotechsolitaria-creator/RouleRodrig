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

const BRAND = "#F5C842";

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
  return `<a href="${href}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;margin-top:10px">${label}</a>`;
}
// Business WhatsApp number used in customer-facing buttons.
function ownerWa(): string {
  return process.env.OWNER_WHATSAPP || process.env.OWNER_PHONE || "";
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

// ── Brevo config: admin-saved values (app_secrets) first, env fallback ──
// Same pattern as the WhatsApp alerts — the owner can paste the API key and
// sender in Admin → Alerts & Email with no redeploy.
let emailCfg: { key: string; from: string; listId: number; at: number } | null = null;
const EMAIL_CFG_TTL = 5 * 60 * 1000;

/** Drop the cached email config (called after the admin saves new settings). */
export function invalidateEmailConfig(): void {
  emailCfg = null;
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
  if (c.pickupDate) attributes.PICKUP_DATE = fmtDate(c.pickupDate);
  if (c.pickupTime) attributes.PICKUP_TIME = fmtTime(c.pickupTime);
  if (c.returnDate) attributes.RETURN_DATE = fmtDate(c.returnDate);
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
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
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
  const rows: [string, string][] = [
    ["Scooter", b.scooter],
  ];
  if (b.asset_label) rows.push(["Unit", b.asset_label]);
  rows.push(
    ["Pickup", fmtDate(b.start_date) + (b.pickup_time ? ` · ${fmtTime(b.pickup_time)}` : "")],
    ["Return", fmtDate(b.end_date) + (b.return_time ? ` · ${fmtTime(b.return_time)}` : "")],
    ["Duration", `${b.days} day${b.days !== 1 ? "s" : ""}`],
  );
  if (b.total_price) rows.push(["Estimated total", b.total_price]);
  return rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#888;font-size:14px">${k}</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${v}</td></tr>`
    )
    .join("");
}

/**
 * Sends a confirmation to the customer (if they gave an email) and a
 * notification to the business owner (if OWNER_EMAIL is set).
 * Never throws — returns a small status object.
 */
export async function sendBookingEmails(b: BookingEmailData): Promise<{ customer: boolean; owner: boolean }> {
  const result = { customer: false, owner: false };

  // ── Customer confirmation ──
  if (b.email) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee">
        <div style="background:#0a0a0a;padding:24px;text-align:center">
          <span style="color:${BRAND};font-size:22px;font-weight:800;letter-spacing:1px">ROULE RODRIGUES</span>
        </div>
        <div style="padding:28px">
          <h1 style="font-size:20px;color:#0a0a0a;margin:0 0 8px">Thanks, ${b.name}! 🛵</h1>
          <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px">
            We've received your booking request. Our team will confirm availability and send
            payment details within a few hours — usually via WhatsApp.
          </p>
          <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:20px">${summaryRows(b)}</table>
          <p style="color:#888;font-size:12px;line-height:1.6;margin:0 0 14px">
            This is a request, not a confirmed reservation. We'll be in touch shortly to finalise everything.
          </p>
          ${ownerWa() ? `<div style="text-align:center">${waButton(ownerWa(), `Hi Roule Rodrigues! I just requested ${b.scooter} for ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}.`, "💬 Message us on WhatsApp")}</div>` : ""}
        </div>
        <div style="background:#f5f5f0;padding:16px;text-align:center;color:#888;font-size:12px">
          Roule Rodrigues · Rodrigues Island, Mauritius
        </div>
      </div>`;
    result.customer = await send(b.email, "Your Roule Rodrigues booking request 🛵", html);
  }

  // ── Owner notification ──
  const owner = process.env.OWNER_EMAIL;
  if (owner) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee">
        <div style="background:${BRAND};padding:18px;text-align:center">
          <span style="color:#0a0a0a;font-size:18px;font-weight:800">NEW BOOKING REQUEST</span>
        </div>
        <div style="padding:28px">
          <h1 style="font-size:18px;color:#0a0a0a;margin:0 0 16px">${b.name}</h1>
          <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:16px">
            ${summaryRows(b)}
            ${b.phone ? `<tr><td style="padding:6px 0;color:#888;font-size:14px">Phone</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${b.phone}</td></tr>` : ""}
            ${b.email ? `<tr><td style="padding:6px 0;color:#888;font-size:14px">Email</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${b.email}</td></tr>` : ""}
          </table>
          ${b.message ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 8px"><strong>Note:</strong> ${b.message}</p>` : ""}
          ${b.phone ? `<div style="margin:6px 0 4px">${waButton(b.phone, `Hi ${b.name}, thanks for your Roule Rodrigues booking request for ${b.scooter}! `, "💬 Message " + b.name + " on WhatsApp")}</div>` : ""}
          <p style="color:#888;font-size:12px;margin:12px 0 0">Manage this in your admin dashboard → Bookings.</p>
        </div>
      </div>`;
    result.owner = await send(owner, `New booking: ${b.name} — ${b.scooter}`, html);
  }

  return result;
}

// ── Reminder emails (sent by the daily cron) ─────────────────────────

function reminderShell(title: string, body: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee">
      <div style="background:#0a0a0a;padding:22px;text-align:center">
        <span style="color:${BRAND};font-size:20px;font-weight:800;letter-spacing:1px">ROULE RODRIGUES</span>
      </div>
      <div style="padding:28px">
        <h1 style="font-size:19px;color:#0a0a0a;margin:0 0 12px">${title}</h1>
        ${body}
      </div>
      <div style="background:#f5f5f0;padding:16px;text-align:center;color:#888;font-size:12px">
        Roule Rodrigues · Rodrigues Island, Mauritius
      </div>
    </div>`;
}

/** Reminder sent the day before pickup. */
export async function sendPickupReminder(b: BookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${b.name}, this is a friendly reminder that your scooter pickup is <strong>tomorrow</strong>. 🛵
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">${summaryRows(b)}</table>
    <p style="color:#888;font-size:13px;line-height:1.6;margin:16px 0 8px">
      Please bring a valid driving licence. See you soon!
    </p>
    ${ownerWa() ? `<div style="text-align:center">${waButton(ownerWa(), `Hi! About my Roule Rodrigues pickup tomorrow (${b.scooter}) — `, "💬 Message us on WhatsApp")}</div>` : ""}`;
  return send(b.email, "Reminder: your Roule Rodrigues pickup is tomorrow 🛵", reminderShell("Your ride is almost here!", body));
}

/** Reminder sent the day before the return is due. */
export async function sendReturnReminder(b: BookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${b.name}, just a reminder that your scooter is due back <strong>tomorrow</strong> (${fmtDate(b.end_date)}).
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">${summaryRows(b)}</table>
    <p style="color:#888;font-size:13px;line-height:1.6;margin:16px 0 8px">
      Please refuel before returning. Thanks for riding with us! 💛
    </p>
    ${ownerWa() ? `<div style="text-align:center">${waButton(ownerWa(), `Hi! About my Roule Rodrigues return (${b.scooter}) — `, "💬 Message us on WhatsApp")}</div>` : ""}`;
  return send(b.email, "Reminder: your scooter return is tomorrow", reminderShell("Return reminder", body));
}

// ── Post-rental feedback request (sent the day after return) ──────────────
export async function sendFeedbackRequest(b: BookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#reviews`;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${b.name}, we hope you loved exploring Rodrigues! 🌴 How was your ride with the ${b.scooter}?
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 18px">
      A quick review means the world to a small island business — it takes 30 seconds and helps other travellers find us.
    </p>
    <div style="text-align:center;margin-bottom:6px">
      <a href="${reviewUrl}" style="display:inline-block;background:${BRAND};color:#0a0a0a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px">⭐ Leave a review</a>
    </div>
    ${ownerWa() ? `<div style="text-align:center">${waButton(ownerWa(), `Hi Roule Rodrigues! Here's my feedback on the ${b.scooter}: `, "💬 Send feedback on WhatsApp")}</div>` : ""}`;
  return send(b.email, "How was your ride? 🛵 We'd love your feedback", reminderShell("Thanks for riding with us!", body));
}

// ── Owner / admin reminders (sent the day before) ────────────────────────
function ownerActionEmail(b: BookingEmailData, kind: "deliver" | "collect"): string {
  const verb = kind === "deliver" ? "Deliver" : "Collect";
  const when = kind === "deliver" ? fmtDate(b.start_date) : fmtDate(b.end_date);
  const rows = `${summaryRows(b)}${b.phone ? `<tr><td style="padding:6px 0;color:#888;font-size:14px">Phone</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${b.phone}</td></tr>` : ""}`;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 14px">
      <strong>${verb} tomorrow</strong> (${when}) for <strong>${b.name}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">${rows}</table>
    ${b.phone ? `<div style="margin-top:10px;text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.scooter} ${kind === "deliver" ? "pickup" : "return"} tomorrow — `, "💬 Message " + b.name + " on WhatsApp")}</div>` : ""}`;
  return reminderShell(`${verb} reminder`, body);
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
  const rows: [string, string][] = [
    ["Place", b.place_name],
    [sameDay ? "Date" : "Check-in", fmtDate(b.start_date)],
  ];
  if (!sameDay) rows.push(["Check-out", fmtDate(b.end_date)]);
  if (b.time_slot) rows.push(["Time", b.time_slot]);
  const qty = b.quantity ?? 0;
  if (qty > 0) {
    const unit = b.category === "hotel" ? "Rooms" : b.category === "restaurant" ? "Party size" : "People";
    rows.push([unit, String(qty)]);
  }
  if (b.guests) rows.push(["Guests", String(b.guests)]);
  return rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#888;font-size:14px">${k}</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${v}</td></tr>`,
    )
    .join("");
}

/** Customer confirmation + owner notification for a Stay·Eat·Do reservation. */
export async function sendPlaceBookingEmails(b: PlaceBookingEmailData): Promise<{ customer: boolean; owner: boolean }> {
  const result = { customer: false, owner: false };

  if (b.email) {
    const body = `
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 18px">
        Hi ${b.name}, we've received your reservation request for <strong>${b.place_name}</strong>.
        Our team will confirm availability with the venue and get back to you shortly.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:16px">${placeRows(b)}</table>
      <p style="color:#888;font-size:12px;line-height:1.6;margin:0 0 14px">
        This is a request, not a confirmed reservation — we'll be in touch to finalise everything.
      </p>
      ${ownerWa() ? `<div style="text-align:center">${waButton(ownerWa(), `Hi Roule Rodrigues! I just requested ${b.place_name} for ${fmtDate(b.start_date)}.`, "💬 Message us on WhatsApp")}</div>` : ""}`;
    result.customer = await send(b.email, `Your ${b.place_name} reservation request 🌴`, reminderShell("Thanks for your reservation!", body));
  }

  const owner = process.env.OWNER_EMAIL;
  if (owner) {
    const body = `
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 12px">
        New <strong>Stay·Eat·Do</strong> reservation request from <strong>${b.name}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:12px">
        ${placeRows(b)}
        ${b.phone ? `<tr><td style="padding:6px 0;color:#888;font-size:14px">Phone</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${b.phone}</td></tr>` : ""}
        ${b.email ? `<tr><td style="padding:6px 0;color:#888;font-size:14px">Email</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${b.email}</td></tr>` : ""}
      </table>
      ${b.message ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 8px"><strong>Note:</strong> ${b.message}</p>` : ""}
      ${b.phone ? `<div style="margin:6px 0 4px">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.place_name} reservation — `, "💬 Message " + b.name + " on WhatsApp")}</div>` : ""}
      <p style="color:#888;font-size:12px;margin:12px 0 0">Manage this in your admin dashboard → Stay·Eat·Do Bookings.</p>`;
    result.owner = await send(owner, `New reservation: ${b.name} — ${b.place_name}`, reminderShell("New reservation request", body));
  }

  return result;
}

/** Customer reminder the day before a Stay·Eat·Do reservation. */
export async function sendPlaceReminder(b: PlaceBookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${b.name}, a friendly reminder — your reservation at <strong>${b.place_name}</strong> is <strong>tomorrow</strong> (${fmtDate(b.start_date)}). 🌴
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">${placeRows(b)}</table>
    ${ownerWa() ? `<div style="text-align:center;margin-top:12px">${waButton(ownerWa(), `Hi! About my ${b.place_name} reservation tomorrow — `, "💬 Message us on WhatsApp")}</div>` : ""}`;
  return send(b.email, `Reminder: your ${b.place_name} reservation is tomorrow 🌴`, reminderShell("See you tomorrow!", body));
}

/** Customer feedback request the day after a Stay·Eat·Do reservation. */
export async function sendPlaceFeedbackRequest(b: PlaceBookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#reviews`;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${b.name}, how was <strong>${b.place_name}</strong>? We'd love to hear about it — a quick review helps other travellers and the local business. 💛
    </p>
    <div style="text-align:center;margin-bottom:6px">
      <a href="${reviewUrl}" style="display:inline-block;background:${BRAND};color:#0a0a0a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px">⭐ Leave a review</a>
    </div>
    ${ownerWa() ? `<div style="text-align:center">${waButton(ownerWa(), `Hi Roule Rodrigues! Here's my feedback on ${b.place_name}: `, "💬 Send feedback on WhatsApp")}</div>` : ""}`;
  return send(b.email, `How was ${b.place_name}? 🌴 We'd love your feedback`, reminderShell("Thanks for visiting!", body));
}

/** Owner reminder: a Stay·Eat·Do reservation is happening tomorrow. */
export async function sendAdminPlaceReminder(b: PlaceBookingEmailData): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL;
  if (!owner) return false;
  const rows = `${placeRows(b)}${b.phone ? `<tr><td style="padding:6px 0;color:#888;font-size:14px">Phone</td><td style="padding:6px 0;color:#0a0a0a;font-weight:600;font-size:14px;text-align:right">${b.phone}</td></tr>` : ""}`;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 14px">
      <strong>Reservation tomorrow</strong> (${fmtDate(b.start_date)}) — <strong>${b.name}</strong> at <strong>${b.place_name}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">${rows}</table>
    ${b.phone ? `<div style="margin-top:10px;text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.place_name} reservation tomorrow — `, "💬 Message " + b.name + " on WhatsApp")}</div>` : ""}`;
  return send(owner, `🌴 Reservation tomorrow: ${b.name} — ${b.place_name}`, reminderShell("Reservation reminder", body));
}

// ── Instant enquiry auto-reply ───────────────────────────────────────────
export async function sendEnquiryAck(to: string, name: string | null): Promise<boolean> {
  const hi = name ? `Hi ${name},` : "Hi there,";
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px">
      ${hi} thanks for reaching out to Roule Rodrigues! 🛵 We've received your message and a real
      person will get back to you within a few hours (we're on island time, UTC+4).
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 18px">
      Need a faster answer? Message us directly on WhatsApp — we usually reply in minutes.
    </p>
    ${ownerWa() ? `<div style="text-align:center">${waButton(ownerWa(), "Hi Roule Rodrigues! I just sent an enquiry through your website. ", "💬 Chat on WhatsApp")}</div>` : ""}`;
  return send(to, "We've got your message 🛵 — Roule Rodrigues", reminderShell("Thanks for getting in touch!", body));
}

// ── Waitlist / saved-list welcome (lifecycle remarketing) ────────────────
export async function sendWaitlistWelcome(to: string, source?: string): Promise<boolean> {
  const savedList = source === "saved-list";
  const intro = savedList
    ? "Thanks for saving your favourites on Roule Rodrigues! Your list is ready whenever you are — come back any time to pick up where you left off and book."
    : "Thanks for joining Roule Rodrigues! 🌴 We'll send you the best island tips, scooter deals and hidden spots from Rodrigues — no spam, ever.";
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 18px">${intro}</p>
    <div style="text-align:center;margin:18px 0 6px">
      <a href="${SITE_URL}" style="display:inline-block;background:${BRAND};color:#0a0a0a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:10px">Plan your Rodrigues trip →</a>
    </div>
    ${ownerWa() ? `<div style="text-align:center;margin-top:8px">${waButton(ownerWa(), "Hi Roule Rodrigues! I'd love some help planning my trip. ", "💬 Chat on WhatsApp")}</div>` : ""}`;
  return send(
    to,
    savedList ? "Your Roule Rodrigues list is saved 🛵" : "Welcome to Roule Rodrigues 🛵🌴",
    reminderShell(savedList ? "Your saved list is waiting" : "Welcome aboard!", body),
  );
}
