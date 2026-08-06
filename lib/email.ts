// Lightweight email sender using the Resend REST API (no SDK dependency).
// Gracefully no-ops when RESEND_API_KEY is not configured, so bookings never
// break just because email isn't set up yet.
import { SITE_URL, CONTACT_EMAIL, PAYPAL_FEE_PERCENT } from "./site";
// Emails must show "BURGMAN 125cc", never the "burgman" ID the DB stores.
import { withVehicleName } from "./vehicle-name";

interface BookingEmailData {
  name: string;
  email: string | null;
  phone: string | null;
  ref?: string | null; // RR-XXXXXX booking reference (for Manage Booking lookup)
  scooter: string;
  start_date: string;
  end_date: string;
  days: number;
  total_price: string | null;
  total_amount?: number | null;
  delivery_fee?: number | null;
  deposit_amount?: number | null;
  deposit_pct?: number | null;
  message: string | null;
  asset_label?: string | null;
  pickup_time?: string | null;
  return_time?: string | null;
}

// "1617" → "Rs 1,617"
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

interface Attachment {
  name: string;
  content: string; // base64
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
const LOCATION = "Port Mathurin, Rodrigues Island, Mauritius";

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

// ── Brand context (WhatsApp number + logo) ───────────────────────────────
// Sourced from env first, then the values the owner saved in the DB
// (app_secrets.callmebot_phone + site_content.branding.logo) so the WhatsApp
// button and header logo work with no extra configuration. Cached briefly.
let brandCache: { wa: string; logo: string; at: number } | null = null;
async function getBrand(): Promise<{ wa: string; logo: string }> {
  if (brandCache && Date.now() - brandCache.at < EMAIL_CFG_TTL) return brandCache;
  let wa = process.env.OWNER_WHATSAPP || process.env.OWNER_PHONE || "";
  let logo = process.env.EMAIL_LOGO_URL || "";
  try {
    const { getPrivileged } = await import("./supabase/admin");
    const supabase = await getPrivileged();
    if (!wa) {
      const { data } = await supabase
        .from("app_secrets")
        .select("value")
        .eq("key", "callmebot_phone")
        .maybeSingle();
      wa = (data?.value ?? "").toString().trim();
    }
    if (!logo) {
      const { data } = await supabase
        .from("site_content")
        .select("data")
        .eq("id", "main")
        .maybeSingle();
      const branding = (data?.data as { branding?: { logo?: string } } | null)?.branding;
      logo = (branding?.logo ?? "").toString().trim();
    }
  } catch {
    /* best-effort */
  }
  // Only embed absolute image URLs (relative /uploads paths aren't reachable
  // from an email client).
  if (logo && !/^https?:\/\//i.test(logo)) logo = "";
  brandCache = { wa, logo, at: Date.now() };
  return brandCache;
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

function frHeading(text: string): string {
  return `<h2 style="font-family:${FONT};font-size:19px;line-height:1.3;font-weight:800;color:${C.ink};margin:0 0 16px">${text}</h2>`;
}

// A subtle "· FRANÇAIS ·" divider separating the English and French blocks.
function sepFr(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 22px"><tr>
    <td style="width:42%;border-bottom:1px solid ${C.line};font-size:0;line-height:0">&nbsp;</td>
    <td style="padding:0 12px;text-align:center;white-space:nowrap;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2px;color:${C.muted}">FRANÇAIS</td>
    <td style="width:42%;border-bottom:1px solid ${C.line};font-size:0;line-height:0">&nbsp;</td>
  </tr></table>`;
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

// ── Payment details shown on the booking confirmation ────────────────────────
// Kept here (not in the CMS) so they can't be changed by accident. If the bank
// or PayPal address ever changes, edit these constants.
const PAY_BANK = "MCB (Mauritius Commercial Bank)";
const PAY_ACCOUNT = "000447902350";

// DO NOT "upgrade" this to a @roulerodrig.com address. It is not a contact
// address — it's the identity of the actual PayPal ACCOUNT. Payments sent to an
// address PayPal doesn't recognise don't arrive. It only changes once the owner
// has added the new address inside PayPal itself.
const PAY_PAYPAL = "roulerodrig@gmail.com";

function PAYMENT_ROWS(b: BookingEmailData): string {
  return rows([
    ["Bank", PAY_BANK],
    ["Account number", PAY_ACCOUNT],
    ["PayPal", PAY_PAYPAL],
    ["Payment reference", `${b.name} — ${b.scooter}`],
    ["Questions", CONTACT_EMAIL],
  ]);
}

/**
 * The master shell every email is built with: soft canvas, rounded white card,
 * dark branded header (logo lockup when available, else wordmark) with tagline
 * + gold rule, content area, and a footer with the business identity.
 */
function shell(opts: { preheader?: string; eyebrow?: string; title: string; body: string; logo?: string }): string {
  const { preheader: pre = "", eyebrow = "", title, body, logo = "" } = opts;
  const lockup = logo
    ? `<span style="display:inline-block;background:#ffffff;border-radius:12px;padding:9px 16px">
         <img src="${logo}" alt="ROULE RODRIGUES" height="38" style="height:38px;width:auto;max-width:190px;display:block;border:0;outline:none;text-decoration:none">
       </span>`
    : `<div style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:2px;color:${C.gold}">ROULE&nbsp;RODRIGUES</div>`;
  return `${pre ? preheader(pre) : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};margin:0;padding:26px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border-radius:18px;overflow:hidden;border:1px solid ${C.line}">
        <tr><td style="background:${C.ink};padding:26px 32px;text-align:center">
          ${lockup}
          <!-- Deliberately NOT "SCOOTER RENTALS": this shell wraps every email
               the platform sends — vehicle rentals, Stay·Eat·Do bookings and
               marketplace orders alike. A customer buying honey from a local
               shop was receiving an order confirmation badged as a scooter
               rental, which reads as the wrong company at the exact moment the
               platform is asking to be trusted. The place name stays; the
               product category goes. -->
          <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:3px;color:#9a9a9a;margin-top:12px">RODRIGUES ISLAND</div>
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
            ${LOCATION}<br>
            <a href="${SITE_URL}" style="color:#b8912b;text-decoration:none;font-weight:600">Visit our website · Voir le site →</a>
          </div>
        </td></tr>
      </table>
      <div style="font-family:${FONT};font-size:11px;color:#b6b6b6;margin-top:16px;line-height:1.6;max-width:600px">
        You received this email because you contacted or booked with Roule Rodrigues.
      </div>
    </td></tr>
  </table>`;
}

// ── Add-to-calendar (booking confirmation) ───────────────────────────────
// Returns a Google Calendar "add event" link + a universal .ics file (opens in
// Apple Calendar, Google, Outlook). Rodrigues is UTC+4 (no DST).
function buildCalendar(b: BookingEmailData): { gcal: string; ics: string } {
  const title = `Roule Rodrigues — ${b.scooter} pickup`;
  const desc =
    "Your Roule Rodrigues rental — bring your driver's licence and booking confirmation. / " +
    "Votre location Roule Rodrigues — apportez votre permis de conduire et votre confirmation.";
  const fUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const m = /^(\d{1,2}):(\d{2})$/.exec((b.pickup_time ?? "").trim());

  let dtStartLine: string;
  let dtEndLine: string;
  let gdates: string;
  if (m) {
    const start = new Date(`${b.start_date}T${m[1].padStart(2, "0")}:${m[2]}:00+04:00`);
    const end = new Date(start.getTime() + 30 * 60000);
    dtStartLine = `DTSTART:${fUtc(start)}`;
    dtEndLine = `DTEND:${fUtc(end)}`;
    gdates = `${fUtc(start)}/${fUtc(end)}`;
  } else {
    const ymd = b.start_date.replace(/-/g, "");
    const next = new Date(new Date(b.start_date).getTime() + 86400000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    dtStartLine = `DTSTART;VALUE=DATE:${ymd}`;
    dtEndLine = `DTEND;VALUE=DATE:${next}`;
    gdates = `${ymd}/${next}`;
  }
  const uid = `${b.start_date}-${waDigits(b.phone) || Math.random().toString(36).slice(2)}@roulerodrigues`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roule Rodrigues//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fUtc(new Date())}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${title}`,
    `LOCATION:${LOCATION}`,
    `DESCRIPTION:${desc}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const gcal =
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}` +
    `&dates=${gdates}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(LOCATION)}`;
  return { gcal, ics };
}

// ── Brevo config: admin-saved values (app_secrets) first, env fallback ──
// Same pattern as the WhatsApp alerts — the owner can paste the API key and
// sender in Admin → Alerts & Email with no redeploy.
let emailCfg: { key: string; from: string; listId: number; at: number } | null = null;
const EMAIL_CFG_TTL = 5 * 60 * 1000;

/** Drop the cached email config (called after the admin saves new settings). */
export function invalidateEmailConfig(): void {
  emailCfg = null;
  brandCache = null;
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
async function send(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<boolean> {
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
        body: JSON.stringify({
          from,
          to,
          subject,
          html,
          ...(attachments?.length
            ? { attachments: attachments.map((a) => ({ filename: a.name, content: a.content })) }
            : {}),
        }),
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
    // @brevosend.com, set Reply-To to a real address so replies reach the
    // owner's inbox.
    //
    // Order matters: OWNER_EMAIL first (an explicit env override always wins),
    // then the routed domain alias, then the Brevo sender. CONTACT_EMAIL sits
    // above sender.email because both land in the same inbox but the domain
    // address is the one that looks like a business — and it's routed through
    // Cloudflare, so it works even if the Brevo sender is swapped later.
    const replyEmail = process.env.OWNER_EMAIL || CONTACT_EMAIL || sender.email;
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
          ...(attachments?.length
            ? { attachment: attachments.map((a) => ({ name: a.name, content: a.content })) }
            : {}),
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

// Bilingual "Label EN · Label FR" rows so a single detail card serves both
// languages without duplicating the whole table.
function summaryRows(b: BookingEmailData): string {
  const pairs: [string, string][] = [];
  if (b.ref) pairs.push(["Booking reference · Référence", `<b>${b.ref}</b> — manage at roulerodrig.com/manage-booking`]);
  pairs.push(["Vehicle · Véhicule", b.scooter]);
  if (b.asset_label) pairs.push(["Unit · Unité", b.asset_label]);
  pairs.push(
    ["Pickup · Retrait", fmtDate(b.start_date) + (b.pickup_time ? ` · ${fmtTime(b.pickup_time)}` : "")],
    ["Return · Retour", fmtDate(b.end_date) + (b.return_time ? ` · ${fmtTime(b.return_time)}` : "")],
    ["Duration · Durée", `${b.days} day${b.days !== 1 ? "s" : ""}`],
  );

  // Full, itemised cost so the customer sees exactly what the booking costs for
  // their dates — rental for N days, delivery, total, then the deposit that
  // confirms it and the balance due at pickup.
  const total = typeof b.total_amount === "number" ? b.total_amount : null;
  const delivery = typeof b.delivery_fee === "number" ? b.delivery_fee : null;

  if (total != null && delivery != null) {
    const rental = total - delivery;
    pairs.push([`Rental · Location (${b.days} day${b.days !== 1 ? "s" : ""})`, rs(rental)]);
    pairs.push([
      "Delivery · Livraison",
      delivery > 0 ? `${rs(delivery)} (drop-off + pickup)` : "Free · Gratuite",
    ]);
    pairs.push(["Total · Total", rs(total)]);
    if (typeof b.deposit_amount === "number" && b.deposit_amount > 0) {
      const pct = b.deposit_pct ?? 0;
      pairs.push([`Deposit to confirm · Acompte (${pct}%)`, rs(b.deposit_amount)]);
      pairs.push(["Balance at pickup · Solde au retrait", rs(total - b.deposit_amount)]);
    }
  } else if (b.total_price) {
    // Fallback for older/edge bookings without the numeric breakdown.
    pairs.push(["Estimated total · Total estimé", b.total_price]);
  }
  return rows(pairs);
}

/**
 * Sends a confirmation to the customer (if they gave an email) and a
 * notification to the business owner (if OWNER_EMAIL is set).
 * Never throws — returns a small status object.
 */
export async function sendBookingEmails(raw: BookingEmailData): Promise<{ customer: boolean; owner: boolean }> {
  const b = await withVehicleName(raw);
  const result = { customer: false, owner: false };
  const { wa, logo } = await getBrand();

  // ── Customer confirmation (bilingual EN + FR, with add-to-calendar) ──
  if (b.email) {
    const cal = buildCalendar(b);

    // Deposit-aware payment copy: a booking is confirmed once the deposit is
    // paid (scooters 25%, cars 50%), balance at pickup. Falls back to the old
    // "no payment due yet" wording when there's no numeric deposit.
    const hasDeposit =
      typeof b.deposit_amount === "number" && b.deposit_amount > 0 && typeof b.total_amount === "number";
    const balance = hasDeposit ? (b.total_amount as number) - (b.deposit_amount as number) : 0;
    // PayPal fee, passed to the customer — stated plainly, never hidden.
    const payPalFeeNote =
      hasDeposit && b.deposit_amount
        ? ` <b>By bank transfer the deposit is exactly ${rs(b.deposit_amount)}. If you pay by PayPal a ${PAYPAL_FEE_PERCENT}% processing fee is added (≈ ${rs(Math.round((b.deposit_amount * PAYPAL_FEE_PERCENT) / 100))}).</b>`
        : "";
    const payPalFeeNoteFr =
      hasDeposit && b.deposit_amount
        ? ` <b>Par virement bancaire, l'acompte est exactement de ${rs(b.deposit_amount)}. Par PayPal, des frais de traitement de ${PAYPAL_FEE_PERCENT}% s'ajoutent (≈ ${rs(Math.round((b.deposit_amount * PAYPAL_FEE_PERCENT) / 100))}).</b>`
        : "";
    const payEn = hasDeposit
      ? `To confirm your booking, please pay a ${b.deposit_pct}% deposit of <b>${rs(b.deposit_amount as number)}</b> by bank transfer or PayPal using the details above.${payPalFeeNote} The remaining <b>${rs(balance)}</b> is paid at pickup. Quote your name as the payment reference so we can match it, and keep the receipt to show on the day. Any question about payment? Email <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};font-weight:600">${CONTACT_EMAIL}</a> and a real person will answer.`
      : `No payment is due yet. We'll confirm availability first — once confirmed, you can settle by bank transfer or PayPal using the details above. Please quote your name as the payment reference, and keep the receipt to show at pickup. Any question about payment? Email <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};font-weight:600">${CONTACT_EMAIL}</a>.`;
    const payFr = hasDeposit
      ? `Pour confirmer votre réservation, merci de régler un acompte de ${b.deposit_pct}% soit <b>${rs(b.deposit_amount as number)}</b> par virement bancaire ou PayPal avec les coordonnées ci-dessus.${payPalFeeNoteFr} Le solde de <b>${rs(balance)}</b> se règle lors du retrait. Indiquez votre nom en référence du paiement et conservez le reçu à présenter le jour même. Une question sur le paiement ? Écrivez à <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};font-weight:600">${CONTACT_EMAIL}</a>.`
      : `Aucun paiement n'est dû pour l'instant. Nous confirmons d'abord la disponibilité — une fois confirmée, vous pourrez régler par virement bancaire ou PayPal. Merci d'indiquer votre nom en référence et de conserver le reçu. Une question ? Écrivez à <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};font-weight:600">${CONTACT_EMAIL}</a>.`;

    const body = `
      ${paragraph(`Thank you for choosing Roule Rodrigues. We've received your booking request — our team will confirm availability and payment details shortly, usually within a few hours (often via WhatsApp).`)}
      ${sectionLabel("Your booking · Votre réservation")}
      ${detailCard(summaryRows(b))}
      <div style="text-align:center;margin-bottom:6px">${primaryButton(cal.gcal, "📅 Add to calendar · Ajouter au calendrier")}</div>
      ${sectionLabel("How to pay")}
      ${detailCard(PAYMENT_ROWS(b))}
      ${paragraph(payEn)}
      ${sectionLabel("Before your pickup, please bring")}
      ${checkList(["A valid driver's licence", "Your booking confirmation", "A valid ID or passport if requested"])}
      ${paragraph(`Please arrive 10–15 minutes early so we can walk you through the vehicle together. Any question? Just reply to this email — we look forward to welcoming you!`)}
      ${sepFr()}
      ${frHeading(`Merci, ${b.name} !`)}
      ${paragraph(`Merci d'avoir choisi Roule Rodrigues. Nous avons bien reçu votre demande de réservation — notre équipe confirmera la disponibilité et les modalités de paiement très bientôt, généralement sous quelques heures (souvent via WhatsApp).`)}
      ${sectionLabel("Comment payer")}
      ${paragraph(payFr)}
      ${sectionLabel("À apporter le jour du retrait")}
      ${checkList(["Un permis de conduire valide", "Votre confirmation de réservation", "Une pièce d'identité ou un passeport si demandé"])}
      ${paragraph(`Merci d'arriver 10 à 15 minutes en avance afin que nous puissions vérifier le véhicule ensemble. Une question ? Répondez simplement à cet e-mail — au plaisir de vous accueillir !`)}
      ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! I just booked the ${b.scooter} for ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}.`, "💬 WhatsApp")}</div>` : ""}`;
    result.customer = await send(
      b.email,
      "Your booking request · Votre réservation 🛵",
      shell({
        preheader: "We've received your booking · Nous avons bien reçu votre réservation.",
        eyebrow: "Booking received · Réservation reçue",
        title: `Thank you, ${b.name}!`,
        body,
        logo,
      }),
      [{ name: "roule-rodrigues-booking.ics", content: Buffer.from(cal.ics, "utf8").toString("base64") }],
    );
  }

  // ── Owner notification (internal, English) ──
  const owner = process.env.OWNER_EMAIL;
  if (owner) {
    const body = `
      ${paragraph(`You have a new booking request. Details below — manage it in your admin dashboard under <strong>Bookings</strong>.`)}
      ${detailCard(
        summaryRows(b) +
          rows([
            ...(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []),
            ...(b.email ? ([["Email", b.email]] as [string, string][]) : []),
          ]),
      )}
      ${b.message ? paragraph(`<strong style="color:${C.ink}">Customer note:</strong> ${b.message}`) : ""}
      ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, thanks for your Roule Rodrigues booking request for the ${b.scooter}! `, "💬 Message " + b.name)}</div>` : ""}`;
    result.owner = await send(
      owner,
      `New booking: ${b.name} — ${b.scooter}`,
      shell({ eyebrow: "New booking request", title: b.name, body, logo }),
    );
  }

  return result;
}

// ── Reminder / feedback emails (sent by the daily cron) ──────────────────

/** Reminder sent the day before pickup. */
export async function sendPickupReminder(raw: BookingEmailData): Promise<boolean> {
  const to = raw.email;
  if (!to) return false;
  const b = await withVehicleName(raw);
  const { wa, logo } = await getBrand();
  const body = `
    ${paragraph(`Hi ${b.name}, this is a friendly reminder that your rental starts <strong>tomorrow</strong>. 🛵`)}
    ${detailCard(summaryRows(b))}
    ${paragraph(`Please bring your driver's licence and arrive a few minutes early. We can't wait to help you discover Rodrigues Island — see you tomorrow!`)}
    ${sepFr()}
    ${frHeading("À demain !")}
    ${paragraph(`Bonjour ${b.name}, petit rappel : votre location commence <strong>demain</strong>. 🛵 Merci d'apporter votre permis de conduire et d'arriver quelques minutes en avance. Nous avons hâte de vous aider à découvrir l'île Rodrigues — à demain !`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi! About my Roule Rodrigues pickup tomorrow (${b.scooter}) — `, "💬 WhatsApp")}</div>` : ""}`;
  return send(
    to,
    "Your rental is tomorrow · Votre location, c'est demain 🛵",
    shell({ preheader: "Pickup is tomorrow · Le retrait, c'est demain.", eyebrow: "Pickup reminder · Rappel de retrait", title: "See you tomorrow!", body, logo }),
  );
}

/** Reminder sent the day before the return is due. */
export async function sendReturnReminder(raw: BookingEmailData): Promise<boolean> {
  const to = raw.email;
  if (!to) return false;
  const b = await withVehicleName(raw);
  const { wa, logo } = await getBrand();
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
    ${sepFr()}
    ${frHeading("Rappel de retour")}
    ${paragraph(`Bonjour ${b.name}, petit rappel : votre véhicule est à rendre <strong>demain</strong> (${fmtDate(b.end_date)}).`)}
    ${sectionLabel("Avant de rendre le véhicule, merci de")}
    ${checkList([
      "Le rendre avec le niveau de carburant convenu",
      "Rapporter les clés et tous les accessoires fournis",
      "Nous prévenir immédiatement en cas de souci pendant la location",
    ])}
    ${paragraph(`Merci d'avoir choisi Roule Rodrigues — nous espérons que vous avez passé un moment inoubliable à Rodrigues, et au plaisir de vous revoir lors de votre prochaine visite ! 💛`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi! About my Roule Rodrigues return (${b.scooter}) — `, "💬 WhatsApp")}</div>` : ""}`;
  return send(
    to,
    "Your return is tomorrow · Votre retour, c'est demain",
    shell({ preheader: "Your vehicle is due back tomorrow · Retour du véhicule demain.", eyebrow: "Return reminder · Rappel de retour", title: "Return reminder", body, logo }),
  );
}

// ── Post-rental feedback request (sent the day after return) ──────────────
export async function sendFeedbackRequest(raw: BookingEmailData): Promise<boolean> {
  const to = raw.email;
  if (!to) return false;
  const b = await withVehicleName(raw);
  const { wa, logo } = await getBrand();
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#reviews`;
  const body = `
    ${paragraph(`Hi ${b.name}, we hope you loved exploring Rodrigues! 🌴 How was your ride with the ${b.scooter}?`)}
    ${paragraph(`A quick review means the world to a small island business — it takes about 30 seconds and helps other travellers discover us.`)}
    ${sepFr()}
    ${frHeading("Merci d'avoir roulé avec nous !")}
    ${paragraph(`Bonjour ${b.name}, nous espérons que vous avez adoré Rodrigues ! 🌴 Comment s'est passée votre balade avec le ${b.scooter} ? Un petit avis compte énormément pour une petite entreprise locale — cela prend 30 secondes et aide d'autres voyageurs à nous découvrir.`)}
    <div style="text-align:center">${primaryButton(reviewUrl, "⭐ Leave a review · Laisser un avis")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! Here's my feedback on the ${b.scooter}: `, "💬 WhatsApp")}</div>` : ""}`;
  return send(
    to,
    "How was your ride? · Votre avis ? 🛵",
    shell({ preheader: "A 30-second review helps other travellers · Votre avis compte.", eyebrow: "Your feedback · Votre avis", title: "Thanks for riding with us!", body, logo }),
  );
}

// ── Owner / admin reminders (sent the day before, internal English) ───────
function ownerActionEmail(b: BookingEmailData, kind: "deliver" | "collect", logo: string): string {
  const verb = kind === "deliver" ? "Deliver" : "Collect";
  const when = kind === "deliver" ? fmtDate(b.start_date) : fmtDate(b.end_date);
  const body = `
    ${paragraph(`<strong style="color:${C.ink}">${verb} tomorrow</strong> (${when}) for <strong>${b.name}</strong>.`)}
    ${detailCard(summaryRows(b) + rows(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []))}
    ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.scooter} ${kind === "deliver" ? "pickup" : "return"} tomorrow — `, "💬 Message " + b.name)}</div>` : ""}`;
  return shell({ eyebrow: `${verb} reminder`, title: `${verb} tomorrow`, body, logo });
}

/** Owner reminder: a scooter needs delivering tomorrow. */
export async function sendAdminPickupReminder(raw: BookingEmailData): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL;
  if (!owner) return false;
  const b = await withVehicleName(raw);
  const { logo } = await getBrand();
  return send(owner, `🛵 Deliver tomorrow: ${b.name} — ${b.scooter}`, ownerActionEmail(b, "deliver", logo));
}

/** Owner reminder: a scooter is due back tomorrow. */
export async function sendAdminReturnReminder(raw: BookingEmailData): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL;
  if (!owner) return false;
  const b = await withVehicleName(raw);
  const { logo } = await getBrand();
  return send(owner, `↩️ Collect tomorrow: ${b.name} — ${b.scooter}`, ownerActionEmail(b, "collect", logo));
}

// ── Stay · Eat · Do reservations ─────────────────────────────────────────
interface PlaceBookingEmailData {
  place_name: string;
  category: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  ref?: string | null; // RR-XXXXXX booking reference (for Manage Booking lookup)
  start_date: string;
  end_date: string;
  guests: number | null;
  quantity?: number | null;
  time_slot?: string | null;
  message: string | null;
}

function placeRows(b: PlaceBookingEmailData): string {
  const sameDay = b.start_date === b.end_date;
  const pairs: [string, string][] = [];
  if (b.ref) pairs.push(["Booking reference · Référence", `<b>${b.ref}</b> — manage at roulerodrig.com/manage-booking`]);
  pairs.push(["Place · Lieu", b.place_name]);
  pairs.push([sameDay ? "Date" : "Check-in · Arrivée", fmtDate(b.start_date)]);
  if (!sameDay) pairs.push(["Check-out · Départ", fmtDate(b.end_date)]);
  if (b.time_slot) pairs.push(["Time · Heure", b.time_slot]);
  const qty = b.quantity ?? 0;
  if (qty > 0) {
    const unit = b.category === "hotel" ? "Rooms · Chambres" : b.category === "restaurant" ? "Party size · Couverts" : "People · Personnes";
    pairs.push([unit, String(qty)]);
  }
  if (b.guests) pairs.push(["Guests · Invités", String(b.guests)]);
  return rows(pairs);
}

/** Customer confirmation + owner notification for a Stay·Eat·Do reservation. */
export async function sendPlaceBookingEmails(b: PlaceBookingEmailData): Promise<{ customer: boolean; owner: boolean }> {
  const result = { customer: false, owner: false };
  const { wa, logo } = await getBrand();

  if (b.email) {
    const body = `
      ${paragraph(`Hi ${b.name}, we've received your reservation request for <strong>${b.place_name}</strong>. Our team will confirm availability with the venue and get back to you shortly.`)}
      ${detailCard(placeRows(b))}
      ${paragraph(`<span style="color:${C.muted};font-size:13px">This is a request, not yet a confirmed reservation — we'll be in touch to finalise everything.</span>`)}
      ${sepFr()}
      ${frHeading("Merci pour votre réservation !")}
      ${paragraph(`Bonjour ${b.name}, nous avons bien reçu votre demande de réservation pour <strong>${b.place_name}</strong>. Notre équipe confirmera la disponibilité auprès de l'établissement et reviendra vers vous très vite.`)}
      ${paragraph(`<span style="color:${C.muted};font-size:13px">Il s'agit d'une demande, pas encore d'une réservation confirmée — nous vous recontacterons pour tout finaliser.</span>`)}
      ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! I just requested ${b.place_name} for ${fmtDate(b.start_date)}.`, "💬 WhatsApp")}</div>` : ""}`;
    result.customer = await send(
      b.email,
      `Your ${b.place_name} reservation · Votre réservation 🌴`,
      shell({ preheader: "We've received your reservation · Réservation bien reçue.", eyebrow: "Reservation received · Réservation reçue", title: "Thanks for your reservation!", body, logo }),
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
      shell({ eyebrow: "New reservation request", title: b.name, body, logo }),
    );
  }

  return result;
}

/** Customer reminder the day before a Stay·Eat·Do reservation. */
export async function sendPlaceReminder(b: PlaceBookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const body = `
    ${paragraph(`Hi ${b.name}, a friendly reminder — your reservation at <strong>${b.place_name}</strong> is <strong>tomorrow</strong> (${fmtDate(b.start_date)}). 🌴`)}
    ${detailCard(placeRows(b))}
    ${sepFr()}
    ${frHeading("À demain !")}
    ${paragraph(`Bonjour ${b.name}, petit rappel — votre réservation à <strong>${b.place_name}</strong> est <strong>demain</strong> (${fmtDate(b.start_date)}). 🌴`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi! About my ${b.place_name} reservation tomorrow — `, "💬 WhatsApp")}</div>` : ""}`;
  return send(
    b.email,
    `Reservation tomorrow · Réservation demain — ${b.place_name} 🌴`,
    shell({ preheader: "Your reservation is tomorrow · Votre réservation, c'est demain.", eyebrow: "Reservation reminder · Rappel", title: "See you tomorrow!", body, logo }),
  );
}

/** Customer feedback request the day after a Stay·Eat·Do reservation. */
export async function sendPlaceFeedbackRequest(b: PlaceBookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#reviews`;
  const body = `
    ${paragraph(`Hi ${b.name}, how was <strong>${b.place_name}</strong>? We'd love to hear about it — a quick review helps other travellers and the local business. 💛`)}
    ${sepFr()}
    ${frHeading("Merci de votre visite !")}
    ${paragraph(`Bonjour ${b.name}, comment s'est passé <strong>${b.place_name}</strong> ? Nous serions ravis d'avoir votre retour — un petit avis aide d'autres voyageurs et l'entreprise locale. 💛`)}
    <div style="text-align:center">${primaryButton(reviewUrl, "⭐ Leave a review · Laisser un avis")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! Here's my feedback on ${b.place_name}: `, "💬 WhatsApp")}</div>` : ""}`;
  return send(
    b.email,
    `How was ${b.place_name}? · Votre avis ? 🌴`,
    shell({ preheader: "A quick review helps other travellers · Votre avis compte.", eyebrow: "Your feedback · Votre avis", title: "Thanks for visiting!", body, logo }),
  );
}

/** Owner reminder: a Stay·Eat·Do reservation is happening tomorrow. */
export async function sendAdminPlaceReminder(b: PlaceBookingEmailData): Promise<boolean> {
  const owner = process.env.OWNER_EMAIL;
  if (!owner) return false;
  const { logo } = await getBrand();
  const body = `
    ${paragraph(`<strong style="color:${C.ink}">Reservation tomorrow</strong> (${fmtDate(b.start_date)}) — <strong>${b.name}</strong> at <strong>${b.place_name}</strong>.`)}
    ${detailCard(placeRows(b) + rows(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []))}
    ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.place_name} reservation tomorrow — `, "💬 Message " + b.name)}</div>` : ""}`;
  return send(owner, `🌴 Reservation tomorrow: ${b.name} — ${b.place_name}`, shell({ eyebrow: "Reservation reminder", title: "Reservation tomorrow", body, logo }));
}

// ── Instant enquiry auto-reply (bilingual) ───────────────────────────────
export async function sendEnquiryAck(to: string, name: string | null): Promise<boolean> {
  const { wa, logo } = await getBrand();
  const hiEn = name ? `Hi ${name},` : "Hi there,";
  const hiFr = name ? `Bonjour ${name},` : "Bonjour,";
  const body = `
    ${paragraph(`${hiEn} thanks for reaching out to Roule Rodrigues! 🛵 We've received your message and a real person will get back to you within a few hours (we're on island time, UTC+4).`)}
    ${paragraph(`Need a faster answer? Message us directly on WhatsApp — we usually reply within minutes.`)}
    ${sepFr()}
    ${frHeading("Merci de nous avoir contactés !")}
    ${paragraph(`${hiFr} merci d'avoir contacté Roule Rodrigues ! 🛵 Nous avons bien reçu votre message et une vraie personne vous répondra sous quelques heures (nous sommes à l'heure de l'île, UTC+4).`)}
    ${paragraph(`Besoin d'une réponse plus rapide ? Écrivez-nous directement sur WhatsApp — nous répondons généralement en quelques minutes.`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, "Hi Roule Rodrigues! I just sent an enquiry through your website. ", "💬 WhatsApp")}</div>` : ""}`;
  return send(
    to,
    "We've got your message · Message bien reçu 🛵",
    shell({ preheader: "We've received your message · Nous avons bien reçu votre message.", eyebrow: "Message received · Message reçu", title: "Thanks for getting in touch!", body, logo }),
  );
}

// ── Waitlist / saved-list welcome (lifecycle remarketing, bilingual) ─────
export async function sendWaitlistWelcome(to: string, source?: string): Promise<boolean> {
  const { wa, logo } = await getBrand();
  const savedList = source === "saved-list";
  const introEn = savedList
    ? "Thanks for saving your favourites on Roule Rodrigues! Your list is ready whenever you are — come back any time to pick up where you left off and book."
    : "Thanks for joining Roule Rodrigues! 🌴 We'll send you the best island tips, scooter deals and hidden spots from Rodrigues — no spam, ever.";
  const introFr = savedList
    ? "Merci d'avoir enregistré vos favoris sur Roule Rodrigues ! Votre liste est prête quand vous le souhaitez — revenez à tout moment pour reprendre là où vous vous êtes arrêté et réserver."
    : "Merci d'avoir rejoint Roule Rodrigues ! 🌴 Nous vous enverrons les meilleurs conseils, offres scooters et coins secrets de Rodrigues — jamais de spam.";
  const body = `
    ${paragraph(introEn)}
    ${sepFr()}
    ${frHeading(savedList ? "Votre liste est enregistrée" : "Bienvenue à bord !")}
    ${paragraph(introFr)}
    <div style="text-align:center">${primaryButton(SITE_URL, "Plan your trip · Planifiez votre voyage →")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, "Hi Roule Rodrigues! I'd love some help planning my trip. ", "💬 WhatsApp")}</div>` : ""}`;
  return send(
    to,
    savedList ? "Your list is saved · Votre liste est enregistrée 🛵" : "Welcome to Roule Rodrigues · Bienvenue 🛵🌴",
    shell({
      preheader: savedList ? "Your saved list is waiting · Votre liste vous attend." : "Island tips, deals and hidden spots · Conseils et offres de Rodrigues.",
      eyebrow: savedList ? "Your saved list · Votre liste" : "Welcome aboard · Bienvenue",
      title: savedList ? "Your saved list is waiting" : "Welcome aboard!",
      body,
      logo,
    }),
  );
}

/**
 * Weekly digest of questions Ti Roulé couldn't answer, so the owner can grow the
 * knowledge base (and SEO). Sent from the daily cron, once a week.
 */
export async function sendTiRouleMissesDigest(to: string, rows: { question: string; count: number }[]): Promise<boolean> {
  if (!to || !rows.length) return false;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const items = rows
    .slice(0, 25)
    .map(
      (r) =>
        `<tr><td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:14px;color:#111">${esc(r.question)}</td><td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:14px;color:#888;text-align:right;white-space:nowrap">${r.count}×</td></tr>`,
    )
    .join("");
  const body = `
    ${paragraph("Here are the questions visitors asked Ti Roulé this week that he couldn't quite answer yet. Each one is a chance to grow his knowledge — and a free SEO idea.")}
    <table style="width:100%;border-collapse:collapse;margin-top:8px">${items}</table>
    <div style="text-align:center;margin-top:18px">${primaryButton(`${SITE_URL}/admin`, "Open the admin dashboard →")}</div>`;
  return send(
    to,
    `Ti Roulé — ${rows.length} question${rows.length === 1 ? "" : "s"} to answer this week 🐢`,
    shell({
      preheader: "Top questions Ti Roulé couldn't answer this week.",
      eyebrow: "Ti Roulé · weekly",
      title: "This week's unanswered questions",
      body,
    }),
  );
}

/**
 * Tell a customer their pending vehicle request was released because someone
 * else paid the deposit first (first-to-pay-wins). No charge was ever made.
 */
export async function sendVehicleUnavailableEmail(o: {
  to: string;
  name?: string | null;
  vehicle: string;
  start: string;
  end: string;
  ref?: string | null;
}): Promise<boolean> {
  const first = (o.name ?? "").trim().split(/\s+/)[0] || "there";
  const dates = o.start === o.end ? fmtDate(o.start) : `${fmtDate(o.start)} → ${fmtDate(o.end)}`;
  const html = shell({
    eyebrow: "Booking update · Mise à jour",
    title: "That vehicle was just booked",
    preheader: "The vehicle you requested has been taken — you were not charged.",
    body: `
      <p>Hi ${first},</p>
      <p>The <b>${o.vehicle}</b> you requested for <b>${dates}</b> has just been secured by another
      customer who paid the deposit first, so your request${o.ref ? ` (<b>${o.ref}</b>)` : ""} has been released.</p>
      <p><b>You were not charged.</b> Plenty of other vehicles are available for your dates —</p>
      <p><a href="https://roulerodrig.com/browse/scooter" style="color:#F5C842;font-weight:700">Browse &amp; book another →</a></p>
      <hr style="border:none;border-top:1px solid #2a2a2a;margin:20px 0" />
      <p style="color:#888;font-size:13px">La voiture / le scooter que vous aviez demandé pour ${dates}
      vient d'être réservé par un autre client. Aucun montant ne vous a été débité —
      <a href="https://roulerodrig.com/browse/scooter" style="color:#F5C842">réservez-en un autre</a>.</p>`,
  });
  return send(o.to, "Update on your Roule Rodrigues booking", html);
}

// ── Marketplace order notifications (Milestone 4) ────────────────────────
// One generic template for order-lifecycle emails (status changed, etc.) —
// reuses the same shell/paragraph/detailCard building blocks as every other
// email so it looks like the same product, and the same best-effort send()
// (never throws, no-ops without a configured provider) as everything else.
export async function sendOrderNotificationEmail(o: {
  to: string;
  subject: string;
  heading: string;
  message: string;
  orderNumber?: string | null;
  /** Extra key/value rows under the message — items, totals, deadlines (M17). */
  details?: [string, string][];
  /** Action button — merchant dashboard or customer tracking link (M17). */
  cta?: { url: string; label: string };
}): Promise<boolean> {
  const { logo } = await getBrand();
  const pairs: [string, string][] = [
    ...(o.orderNumber ? ([["Order", o.orderNumber]] as [string, string][]) : []),
    ...(o.details ?? []),
  ];
  const body = `
    ${paragraph(o.message)}
    ${pairs.length ? detailCard(rows(pairs)) : ""}
    ${o.cta ? `<div style="text-align:center">${primaryButton(o.cta.url, o.cta.label)}</div>` : ""}`;
  return send(
    o.to,
    o.subject,
    shell({ eyebrow: "Order update", title: o.heading, body, logo }),
  );
}
