import "server-only";
// ── Email templates and senders ─────────────────────────────────────────────
//
// This file owns WHAT the emails look like. It no longer owns HOW they are
// delivered: every send goes through lib/email/send.ts, the central router that
// resolves provider, quota, reserve, idempotency and logging (M41).
//
// The local send() below is a thin adapter onto that router, kept so all 18
// template functions read exactly as they did — and so their callers across the
// API routes and the cron did not have to change at all.
//
// Still true, and still important: nothing here throws. A booking must never
// fail because a mail provider did.
import { createHash } from "node:crypto";
import { SITE_URL, CONTACT_EMAIL, PAYPAL_FEE_PERCENT } from "./site";
// Emails must show "BURGMAN 125cc", never the "burgman" ID the DB stores.
import { withVehicleName, vehicleCategory } from "./vehicle-name";
// A ride email must never invent its own words for a service, its own clock or
// its own price format: lib/rides/model.ts already owns all three, and the
// admin desk and the driver's WhatsApp offer read the same module. One
// authority, so an email can never describe a ride differently from the screen
// the owner is looking at.
import {
  RIDE_SERVICE_META,
  formatRidePrice,
  pickupTimeLabel,
  type RideService,
} from "./rides/model";
import { sendTransactionalEmail } from "./email/send";
import {
  placeEmailType,
  vehicleEmailType,
  type EmailType,
} from "./email/types";
import {
  getBrevoCredentials,
  invalidateBrevoCredentials,
  upsertBrevoContactRaw,
} from "./email/providers/brevo";
import { invalidateEmailConfigCache } from "./email/config";
import { resendProvider } from "./email/providers/resend";
import { brevoProvider } from "./email/providers/brevo";

interface BookingEmailData {
  /** Booking row id. Only used to derive a stable idempotency key — never shown
   *  to the customer (they see `ref`, the RR-XXXXXX form of the same id). */
  id?: string | null;
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
function waButton(
  phone: string | null | undefined,
  text: string,
  label: string,
): string {
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
  if (brandCache && Date.now() - brandCache.at < EMAIL_CFG_TTL)
    return brandCache;
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
        // JUST the branding node. Selecting "data" pulled the whole site_content
        // blob — 148,807 bytes — to read one logo URL out of 2,028 of them, on
        // every email that needed a header image. The alias pins the response
        // key so PostgREST's path-naming cannot quietly rename it.
        .select("branding:data->branding")
        .eq("id", "main")
        .maybeSingle();
      const branding = (
        data as { branding?: { logo?: string; logoMark?: string } } | null
      )?.branding;
      // The MARK first. This header renders the image at height:38px — the full
      // lockup's tagline lines ("TOURS · RENTALS · ACTIVITIES · EXPERIENCES")
      // are illegible at that size, and an email header is the one place a
      // customer decides whether the message looks like a real business.
      logo = (branding?.logoMark ?? branding?.logo ?? "").toString().trim();
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
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

// (Sender-string parsing moved to lib/email/providers/types.ts — it is a
//  transport concern, and both provider adapters need it.)

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
function shell(opts: {
  preheader?: string;
  eyebrow?: string;
  title: string;
  body: string;
  logo?: string;
}): string {
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
  const fUtc = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const m = /^(\d{1,2}):(\d{2})$/.exec((b.pickup_time ?? "").trim());

  let dtStartLine: string;
  let dtEndLine: string;
  let gdates: string;
  if (m) {
    const start = new Date(
      `${b.start_date}T${m[1].padStart(2, "0")}:${m[2]}:00+04:00`,
    );
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

const EMAIL_CFG_TTL = 5 * 60 * 1000;

/**
 * Drop every cached email setting — provider credentials, router config
 * (limits/thresholds/reserve/routing) and the brand lockup. Called after an
 * admin save so the next send uses the new settings immediately rather than up
 * to five minutes later.
 */
export function invalidateEmailConfig(): void {
  invalidateBrevoCredentials();
  invalidateEmailConfigCache();
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
  // Keyed on the TRANSACTIONAL list, because that is the list a booker actually
  // joins since M41 — checking the marketing list would report "Brevo is sending
  // the reminders" about a list nobody joins any more, and customers would get
  // no reminder at all.
  //
  // NOTE: nothing calls this today. Audited across the whole repo — the cron
  // always sends its own reminders, so the documented "Brevo automations take
  // over" behaviour has never actually happened. Kept because the switch is
  // still the right design if the owner does build those automations, but the
  // duplicate risk it describes is theoretical until something reads it.
  const { key, transactionalListId } = await getBrevoCredentials();
  return !!(key && transactionalListId);
}

/**
 * Create/update a Brevo CONTACT so Brevo automations (confirmation,
 * instructions, pre-trip reminder) can render real booking data. Best-effort:
 * never throws, no-ops without a key. The automation workflows themselves are
 * built inside Brevo, not in code.
 *
 * ── MARKETING CONSENT (M41) ───────────────────────────────────────────────
 * `list` now has to be stated, and every booking flow passes "transactional".
 *
 * Until M41 this function put every customer who booked anything into the single
 * configured `brevo_list_id` — which doubles as the CAMPAIGN audience. So
 * renting a scooter silently subscribed you to marketing, and the first
 * promotional campaign would have gone to people who never agreed to receive
 * one. Booking something is consent to be told about that booking; it is not
 * consent to be marketed to, and the two audiences are now separate lists.
 *
 * The marketing list is reachable only by an explicit opt-in (currently
 * /api/waitlist). When a booking form later grows a real consent checkbox, it
 * passes "marketing" here and nothing else about this function changes.
 */
export async function upsertBrevoContact(c: {
  email: string;
  firstName?: string | null;
  phone?: string | null;
  vehicle?: string | null;
  bookingId?: string | null;
  pickupDate?: string | null; // ISO date
  pickupTime?: string | null; // HH:MM
  returnDate?: string | null; // ISO date
  returnTime?: string | null; // HH:MM
  /** Which audience to join. Defaults to transactional — the safe choice, so a
   *  new call site cannot subscribe someone to marketing by omission. */
  list?: "transactional" | "marketing" | "none";
}): Promise<boolean> {
  if (!c.email) return false;
  // These become Brevo contact attributes (auto-created on first use), so the
  // automation email templates can render {{ contact.VEHICLE }}, etc.
  const attributes: Record<string, string> = {};
  if (c.firstName) attributes.FIRSTNAME = c.firstName.slice(0, 80);
  if (c.phone) attributes.PHONE = c.phone.slice(0, 30);
  if (c.vehicle) attributes.VEHICLE = c.vehicle.slice(0, 80);
  if (c.bookingId) attributes.BOOKING_ID = c.bookingId.slice(0, 40);
  if (c.pickupDate) {
    attributes.PICKUP_DATE = fmtDate(c.pickupDate); // display text, e.g. "12 Jul 2026"
    attributes.PICKUP_ON = c.pickupDate.slice(0, 10); // ISO date for date-triggered automations
  }
  if (c.pickupTime) attributes.PICKUP_TIME = fmtTime(c.pickupTime);
  if (c.returnDate) {
    attributes.RETURN_DATE = fmtDate(c.returnDate);
    attributes.RETURN_ON = c.returnDate.slice(0, 10);
  }
  if (c.returnTime) attributes.RETURN_TIME = fmtTime(c.returnTime);
  return upsertBrevoContactRaw({
    email: c.email,
    attributes,
    list: c.list ?? "transactional",
  });
}

/**
 * Sends one email via whichever provider is configured:
 *   • Resend  — set RESEND_API_KEY (+ RESEND_FROM). Needs a verified domain.
 *   • Brevo   — key + sender from Admin → Alerts & Email (or BREVO_API_KEY /
 *               BREVO_FROM env). Works with just a verified sender email
 *               (e.g. a Gmail) — no domain required.
 * No-ops cleanly when neither is set, so the app never breaks.
 */
/**
 * Which provider WOULD handle a send right now — names only, never a key.
 *
 * Guest checkout is entirely email-dependent (confirmation, tracking link,
 * payment reminder, expiry warning), and until now there was no way to answer
 * "is mail actually configured on production?" without opening the Vercel
 * dashboard. `send()` no-ops silently when nothing is set, which is the right
 * runtime behaviour and the worst possible diagnostic — the site looks healthy
 * while every customer email is discarded. Surfaced through /api/health.
 *
 * Resend is checked first because `send()` checks it first; keeping the order
 * identical is what stops this from reporting a provider that isn't the one
 * doing the work.
 */
export async function emailProviderName(): Promise<
  "resend" | "brevo" | "unconfigured"
> {
  try {
    const { getEmailConfig } = await import("./email/config");
    const cfg = await getEmailConfig();
    // Report the DEFAULT provider first when it can actually send — that is the
    // one carrying almost all traffic. Falls through to the other so a partially
    // configured setup still reports the provider that would do the work.
    const order =
      cfg.defaultProvider === "resend"
        ? ["resend", "brevo"]
        : ["brevo", "resend"];
    for (const name of order) {
      const impl = name === "resend" ? resendProvider : brevoProvider;
      if (!cfg.providers[name as "resend" | "brevo"].enabled) continue;
      if ((await impl.health()).configured) return name as "resend" | "brevo";
    }
  } catch {
    /* config lookup failed — report unconfigured rather than guessing */
  }
  return "unconfigured";
}

interface SendOpts {
  to: string;
  subject: string;
  html: string;
  type: EmailType;
  /** Stable per-event key. Omit only when the send has no once-only identity. */
  key?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  attachments?: Attachment[];
  /** Admin test send only — pin the provider and skip failover. */
  forceProvider?: "resend" | "brevo";
}

/**
 * Adapter onto the central router. Returns a plain boolean because that is what
 * all 18 template functions and their callers already expect.
 *
 * A DEDUPED send reports `true`: the logical email is in the customer's inbox,
 * which is exactly what the cron needs to know before stamping
 * `pickup_reminded`. Treating "already sent" as a failure would make the cron
 * retry it every single day.
 */
async function send(opts: SendOpts): Promise<boolean> {
  const result = await sendTransactionalEmail({
    type: opts.type,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
    idempotencyKey: opts.key ?? null,
    relatedType: opts.relatedType ?? null,
    relatedId: opts.relatedId ?? null,
    ...(opts.forceProvider ? { forceProvider: opts.forceProvider } : {}),
  });
  return result.ok;
}

/** Stable idempotency suffix for a booking: the reference if we have it, else
 *  the row id. Both derive from the same UUID, so either identifies the booking
 *  uniquely and forever. Returns null when neither is available, which disables
 *  idempotency for that send rather than inventing a key that could collide. */
function bookingKeyPart(b: {
  ref?: string | null;
  id?: string | null;
}): string | null {
  return (b.ref ?? "").trim() || (b.id ?? "").trim() || null;
}

const keyFor = (type: EmailType, part: string | null): string | null =>
  part ? `${type}:${part}` : null;

// Bilingual "Label EN · Label FR" rows so a single detail card serves both
// languages without duplicating the whole table.
function summaryRows(b: BookingEmailData): string {
  const pairs: [string, string][] = [];
  if (b.ref)
    pairs.push([
      "Booking reference · Référence",
      `<b>${b.ref}</b> — manage at roulerodrig.com/manage-booking`,
    ]);
  pairs.push(["Vehicle · Véhicule", b.scooter]);
  if (b.asset_label) pairs.push(["Unit · Unité", b.asset_label]);
  pairs.push(
    [
      "Pickup · Retrait",
      fmtDate(b.start_date) +
        (b.pickup_time ? ` · ${fmtTime(b.pickup_time)}` : ""),
    ],
    [
      "Return · Retour",
      fmtDate(b.end_date) +
        (b.return_time ? ` · ${fmtTime(b.return_time)}` : ""),
    ],
    ["Duration · Durée", `${b.days} day${b.days !== 1 ? "s" : ""}`],
  );

  // Full, itemised cost so the customer sees exactly what the booking costs for
  // their dates — rental for N days, delivery, total, then the deposit that
  // confirms it and the balance due at pickup.
  const total = typeof b.total_amount === "number" ? b.total_amount : null;
  const delivery = typeof b.delivery_fee === "number" ? b.delivery_fee : null;

  if (total != null && delivery != null) {
    const rental = total - delivery;
    pairs.push([
      `Rental · Location (${b.days} day${b.days !== 1 ? "s" : ""})`,
      rs(rental),
    ]);
    pairs.push([
      "Delivery · Livraison",
      delivery > 0 ? `${rs(delivery)} (drop-off + pickup)` : "Free · Gratuite",
    ]);
    pairs.push(["Total · Total", rs(total)]);
    if (typeof b.deposit_amount === "number" && b.deposit_amount > 0) {
      const pct = b.deposit_pct ?? 0;
      pairs.push([
        `Deposit to confirm · Acompte (${pct}%)`,
        rs(b.deposit_amount),
      ]);
      pairs.push([
        "Balance at pickup · Solde au retrait",
        rs(total - b.deposit_amount),
      ]);
    }
  } else if (b.total_price) {
    // Fallback for older/edge bookings without the numeric breakdown.
    pairs.push(["Estimated total · Total estimé", b.total_price]);
  }
  return rows(pairs);
}

// ── Where owner alerts actually go ─────────────────────────────────────────
//
// Seven internal emails — new booking, new reservation, the three daily
// reminders, the Ti Roulé digest and the payment alert — used to read
// process.env.OWNER_EMAIL directly and `return false` when it was unset.
//
// On 2026-08-13 the owner checked Vercel: OWNER_EMAIL was not there, and had
// never been. So every one of those had been silently doing nothing, for
// months, with no error, no log and nothing in /admin to say so. He had never
// received a single "new booking" email and had no way to know that was even a
// thing that could be true.
//
// The variable being unset is not the bug. A notification system that turns
// itself off completely when one environment variable is missing, and says
// nothing, is the bug. So it now falls back to the site's own published contact
// address — already the reply-to fallback in the Brevo provider, already
// printed inside customer emails — which is a mailbox that demonstrably exists.
// OWNER_EMAIL still wins when set, because a personal inbox is read faster than
// a shared one.
/**
 * Where owner alerts go — new booking, new ride, new enquiry.
 *
 * ── WHY THIS IS ASYNC NOW ─────────────────────────────────────────
 * It read one environment variable, OWNER_EMAIL, which was never set on any
 * environment — so every owner alert quietly fell back to the contact address
 * on the domain. The mail was sent, Brevo delivered it, and it landed in a
 * mailbox the owner does not read. Nothing failed anywhere, which is exactly
 * why it went unnoticed: `email_log` said `sent`, and it was.
 *
 * The address the business depends on should not need a redeploy to change, so
 * it is a stored setting now. Precedence, most specific first:
 *
 *   1. OWNER_EMAIL          — an environment can still force it
 *   2. emailConfig.ownerEmail — what the owner set, no deploy needed
 *   3. CONTACT_EMAIL        — unchanged last resort
 */
export async function ownerInbox(): Promise<string> {
  const fromEnv = (process.env.OWNER_EMAIL ?? "").trim();
  if (fromEnv) return fromEnv;
  try {
    const { getEmailConfig } = await import("./email/config");
    const cfg = await getEmailConfig();
    if (cfg.ownerEmail) return cfg.ownerEmail;
  } catch {
    /* a config read must never cost an alert — fall through */
  }
  return CONTACT_EMAIL;
}

/** True when the owner has chosen an address rather than inheriting the fallback. */
export async function ownerInboxIsExplicit(): Promise<boolean> {
  if ((process.env.OWNER_EMAIL ?? "").trim()) return true;
  try {
    const { getEmailConfig } = await import("./email/config");
    return !!(await getEmailConfig()).ownerEmail;
  } catch {
    return false;
  }
}

/**
 * Sends a confirmation to the customer (if they gave an email) and a
 * notification to the business owner (if OWNER_EMAIL is set).
 * Never throws — returns a small status object.
 */
export async function sendBookingEmails(
  raw: BookingEmailData,
): Promise<{ customer: boolean; owner: boolean }> {
  const b = await withVehicleName(raw);
  const result = { customer: false, owner: false };
  const { wa, logo } = await getBrand();
  // Resolved from the RAW fleet id, before withVehicleName() rewrites `scooter`
  // to the display name. Cars and scooters are separate email domains.
  const vcat = await vehicleCategory(raw.scooter);
  const keyPart = bookingKeyPart(raw);
  const customerType = vehicleEmailType("booking_confirmation", vcat);

  // ── Customer confirmation (bilingual EN + FR, with add-to-calendar) ──
  if (b.email) {
    const cal = buildCalendar(b);

    // ── A BOOKING REQUEST IS NOT AN INVOICE ────────────────────────────────
    //
    // M91 made vehicle bookings owner-approved: submitting ASKS for the
    // vehicle, and /manage-booking refuses to show a pay button until the owner
    // says yes ("Nothing is charged until then"). This template has exactly one
    // caller — POST /api/bookings, at creation — so the booking is ALWAYS
    // `pending` when this email is sent.
    //
    // It used to branch on `deposit_amount > 0`, which /api/bookings ALWAYS
    // sets (route.ts writes serverBreakdown.deposit unconditionally). So the
    // "please pay a X% deposit … using the details above" line fired on every
    // single booking, above a card printing the bank and account number, while
    // the page it sent people to refused to take the money. A customer who did
    // as they were told wired a deposit for a vehicle nobody had confirmed was
    // free — the exact involuntary refund M91 was built to prevent. The correct
    // branch existed directly below it and was unreachable.
    //
    // The deposit is now quoted as a figure to EXPECT, never as an instruction,
    // and the account details appear only in sendAvailabilityConfirmed() below
    // — sent after approval, linking straight to /manage-booking.
    const depositKnown =
      typeof b.deposit_amount === "number" && b.deposit_amount > 0;
    const expectEn = depositKnown
      ? ` When it is confirmed, a ${b.deposit_pct}% deposit of <b>${rs(b.deposit_amount as number)}</b> secures the vehicle and the rest is paid at pickup.`
      : "";
    const expectFr = depositKnown
      ? ` Une fois confirmée, un acompte de ${b.deposit_pct}% soit <b>${rs(b.deposit_amount as number)}</b> réserve le véhicule, le solde se règle au retrait.`
      : "";
    const payEn = `<b>No payment is due yet.</b> We check the vehicle is free for your dates first — usually within a few hours.${expectEn} We will then email you a link to pay by bank transfer or PayPal. You will never be charged for a vehicle we cannot provide. Any question? Email <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};font-weight:600">${CONTACT_EMAIL}</a> and a real person will answer.`;
    const payFr = `<b>Aucun paiement n'est dû pour l'instant.</b> Nous vérifions d'abord que le véhicule est libre à ces dates — généralement sous quelques heures.${expectFr} Nous vous enverrons ensuite un lien pour régler par virement bancaire ou PayPal. Vous ne serez jamais débité pour un véhicule que nous ne pouvons pas fournir. Une question ? Écrivez à <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};font-weight:600">${CONTACT_EMAIL}</a>.`;

    const body = `
      ${paragraph(`Thank you for choosing Roule Rodrigues. We've received your booking request — our team will confirm availability and payment details shortly, usually within a few hours (often via WhatsApp).`)}
      ${sectionLabel("Your booking · Votre réservation")}
      ${detailCard(summaryRows(b))}
      <div style="text-align:center;margin-bottom:6px">${primaryButton(cal.gcal, "📅 Add to calendar · Ajouter au calendrier")}</div>
      ${/* The bank and account number used to sit here, in the email that goes
            out BEFORE anyone has confirmed the vehicle is free. They now live
            only in sendAvailabilityConfirmed(), which is sent after approval. */ ""}
      ${sectionLabel("What happens next")}
      ${paragraph(payEn)}
      ${sectionLabel("Before your pickup, please bring")}
      ${checkList(["A valid driver's licence", "Your booking confirmation", "A valid ID or passport if requested"])}
      ${paragraph(`Please arrive 10–15 minutes early so we can walk you through the vehicle together. Any question? Just reply to this email — we look forward to welcoming you!`)}
      ${sepFr()}
      ${frHeading(`Merci, ${b.name} !`)}
      ${paragraph(`Merci d'avoir choisi Roule Rodrigues. Nous avons bien reçu votre demande de réservation — notre équipe confirmera la disponibilité et les modalités de paiement très bientôt, généralement sous quelques heures (souvent via WhatsApp).`)}
      ${sectionLabel("La suite")}
      ${paragraph(payFr)}
      ${sectionLabel("À apporter le jour du retrait")}
      ${checkList(["Un permis de conduire valide", "Votre confirmation de réservation", "Une pièce d'identité ou un passeport si demandé"])}
      ${paragraph(`Merci d'arriver 10 à 15 minutes en avance afin que nous puissions vérifier le véhicule ensemble. Une question ? Répondez simplement à cet e-mail — au plaisir de vous accueillir !`)}
      ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! I just booked the ${b.scooter} for ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}.`, "💬 WhatsApp")}</div>` : ""}`;
    result.customer = await send({
      to: b.email,
      subject: "Your booking request · Votre réservation 🛵",
      html: shell({
        preheader:
          "We've received your booking · Nous avons bien reçu votre réservation.",
        eyebrow: "Booking received · Réservation reçue",
        title: `Thank you, ${b.name}!`,
        body,
        logo,
      }),
      type: customerType,
      key: keyFor(customerType, keyPart),
      relatedType: "booking",
      relatedId: keyPart,
      attachments: [
        {
          name: "roule-rodrigues-booking.ics",
          content: Buffer.from(cal.ics, "utf8").toString("base64"),
        },
      ],
    });
  }

  // ── Owner notification (internal, English) ──
  const owner = await ownerInbox();
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
    result.owner = await send({
      to: owner,
      subject: `New booking: ${b.name} — ${b.scooter}`,
      html: shell({
        eyebrow: "New booking request",
        title: b.name,
        body,
        logo,
      }),
      type: "owner_booking_alert",
      key: keyFor("owner_booking_alert", keyPart),
      relatedType: "booking",
      relatedId: keyPart,
    });
  }

  return result;
}

/**
 * The owner's own words, on their way into an HTML email.
 *
 * unavailable_note is free text he types in /admin and the customer reads. An
 * apostrophe or an ampersand would otherwise break the markup; a stray tag
 * would be rendered.
 */
function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── M91: the two answers to "is it available?" ─────────────────────────────
//
// The owner checks with the partner before anybody pays. These are the only
// two things the customer can hear back, and BOTH must arrive — a request that
// gets neither is worse than the instant-confirm-then-refund flow it replaced,
// because at least that one ended.
//
// Bilingual like every other customer email on this site.

/** Available — pay to confirm, by a stated deadline. */
export async function sendAvailabilityConfirmed(b: {
  id: string;
  email: string | null;
  name: string;
  scooter: string;
  start_date: string;
  end_date: string;
  amountDue: number | null;
  payBy: string;
}): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const ref = "RR-" + b.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  const payUrl = `${SITE_URL}/manage-booking`;
  const by = new Date(b.payBy);
  const byEn = by.toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const byFr = by.toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const body = `
    ${paragraph(`Good news ${b.name} — <strong>${b.scooter}</strong> is free for your dates and we're holding it for you.`)}
    ${detailCard(
      rows([
        ["Reference", ref],
        ["Vehicle", b.scooter],
        ["Dates", `${fmtDate(b.start_date)} → ${fmtDate(b.end_date)}`],
        ...(b.amountDue != null
          ? ([["To pay now", rs(b.amountDue)]] as [string, string][])
          : []),
        ["Held until", byEn],
      ]),
    )}
    ${paragraph(`Pay by <strong>${byEn}</strong> and it's yours. After that we have to release it to other customers — we'll tell you if that happens, and you can always ask us to look again.`)}
    ${paragraph(`<a href="${payUrl}" style="color:${C.ink};font-weight:600">Pay and confirm your booking</a> — you'll need your reference <strong>${ref}</strong> and this email address.`)}
    ${sepFr()}
    ${frHeading("Disponible — à confirmer")}
    ${paragraph(`Bonne nouvelle ${b.name} — <strong>${b.scooter}</strong> est libre à vos dates et nous vous le réservons.`)}
    ${paragraph(`Réglez avant le <strong>${byFr}</strong> et il est à vous. Passé ce délai, nous devons le remettre à disposition — nous vous préviendrons, et vous pourrez toujours nous redemander.`)}
    ${paragraph(`<a href="${payUrl}" style="color:${C.ink};font-weight:600">Payer et confirmer</a> — avec votre référence <strong>${ref}</strong> et cette adresse e-mail.`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! About booking ${ref} — `, "💬 WhatsApp")}</div>` : ""}`;

  return send({
    to: b.email,
    subject: `It's available — confirm your ${b.scooter} · Disponible 🛵`,
    html: shell({
      preheader: `Held until ${byEn}. Pay to confirm.`,
      eyebrow: "Available · Disponible",
      title: "It's yours to confirm",
      body,
      logo,
    }),
    type: "booking_availability_confirmed",
    key: keyFor("booking_availability_confirmed", b.id),
    relatedType: "booking",
    relatedId: b.id,
  });
}

/** Not available — say so quickly, and never leave them waiting. */
export async function sendVehicleUnavailable(b: {
  id: string;
  email: string | null;
  name: string;
  scooter: string;
  start_date: string;
  end_date: string;
  note: string | null;
}): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const ref = "RR-" + b.id.replace(/-/g, "").slice(0, 6).toUpperCase();

  const body = `
    ${paragraph(`${b.name}, we're sorry — <strong>${b.scooter}</strong> isn't free for ${fmtDate(b.start_date)} → ${fmtDate(b.end_date)}. You have not been charged anything.`)}
    ${b.note ? paragraph(`<strong style="color:${C.ink}">From us:</strong> ${escapeHtml(b.note)}`) : ""}
    ${paragraph(`We'd still like to get you on the road. Reply to this email or message us on WhatsApp and we'll find you something that works for those dates.`)}
    ${paragraph(`<a href="${SITE_URL}/browse/scooters" style="color:${C.ink};font-weight:600">See what else is available</a>`)}
    ${sepFr()}
    ${frHeading("Indisponible")}
    ${paragraph(`${b.name}, nous sommes désolés — <strong>${b.scooter}</strong> n'est pas libre du ${fmtDate(b.start_date)} au ${fmtDate(b.end_date)}. Rien ne vous a été débité.`)}
    ${paragraph(`Écrivez-nous ou contactez-nous sur WhatsApp : nous vous trouverons un véhicule équivalent pour ces dates.`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! ${ref} wasn't available — what else do you have for those dates?`, "💬 Find me another")}</div>` : ""}`;

  return send({
    to: b.email,
    subject: `Not available for those dates · Indisponible — ${ref}`,
    html: shell({
      preheader: "You have not been charged. Let's find you another vehicle.",
      eyebrow: "Availability · Disponibilité",
      title: "We couldn't get you that one",
      body,
      logo,
    }),
    type: "booking_unavailable",
    key: keyFor("booking_unavailable", b.id),
    relatedType: "booking",
    relatedId: b.id,
  });
}

/**
 * A request that expired before anyone answered it.
 *
 * The nightly sweep cancels a pending booking after HOLD_EXPIRY_HOURS and did
 * it in total silence: the customer asked for a scooter, nobody replied, and 48
 * hours later the request was closed without a word. The block immediately
 * below that one in the cron says plainly that letting a booking lapse in
 * silence is a defect and refuses to repeat it for approved rows — pending rows
 * were getting exactly that treatment anyway.
 *
 * Deliberately NOT sendVehicleUnavailable(): that email says the vehicle is not
 * free for those dates, which in this case nobody ever checked. Saying it to
 * cover a missed reply invents an availability fact and blames the fleet for a
 * human delay. This says the true thing, which is also the more repairable one
 * — the dates may well still be open.
 */
export async function sendRequestExpired(b: {
  id: string;
  email: string | null;
  name: string;
  scooter: string;
  start_date: string;
  end_date: string;
}): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const ref = "RR-" + b.id.replace(/-/g, "").slice(0, 6).toUpperCase();

  const body = `
    ${paragraph(`${b.name}, your request for <strong>${b.scooter}</strong> (${fmtDate(b.start_date)} → ${fmtDate(b.end_date)}) has expired because we did not get back to you in time. That one is on us, and <strong>you have not been charged anything</strong>.`)}
    ${paragraph(`If you still want it, reply to this email or message us on WhatsApp and we will sort it today — those dates may well still be free.`)}
    ${paragraph(`<a href="${SITE_URL}/browse/scooter" style="color:${C.ink};font-weight:600">Book again in a minute</a>`)}
    ${sepFr()}
    ${frHeading("Demande expirée")}
    ${paragraph(`${b.name}, votre demande pour <strong>${b.scooter}</strong> (${fmtDate(b.start_date)} → ${fmtDate(b.end_date)}) a expiré : nous ne vous avons pas répondu à temps. Cela vient de nous, et <strong>rien ne vous a été débité</strong>.`)}
    ${paragraph(`Si vous le voulez toujours, répondez à cet e-mail ou écrivez-nous sur WhatsApp — les dates sont peut-être encore libres.`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! My request ${ref} expired — is the ${b.scooter} still free?`, "💬 Ask again")}</div>` : ""}`;

  return send({
    to: b.email,
    subject: `Your request expired — sorry · Demande expirée — ${ref}`,
    html: shell({
      preheader: "We did not reply in time. Nothing was charged.",
      eyebrow: "Booking request · Demande",
      title: "We didn't get back to you in time",
      body,
      logo,
    }),
    type: "booking_request_expired",
    key: keyFor("booking_request_expired", b.id),
    relatedType: "booking",
    relatedId: b.id,
  });
}

// ── STAYS AND EXPERIENCES: THE SAME TWO HALVES (M127) ────────────────────
//
// The owner: "do like for vehicle, add a new step like AVAILABILITY then I
// confirm in the admin dashboard and if available they go to the payment step,
// if not send customers emails and propose them other suggestions."
//
// The boats, the therapist and the guesthouses are not his, so confirming a
// charter he cannot get means taking money and giving it back. These are the
// two outcomes of that check, and BOTH must exist: a customer told "we are
// checking" who then gets nothing is worse off than under the old
// pay-immediately flow, because at least that one ended.

/** Available — pay by a stated deadline to confirm. */
export async function sendPlaceAvailabilityConfirmed(b: {
  id: string;
  email: string | null;
  name: string;
  placeName: string;
  category?: string | null;
  when: string;
  amountDue: number | null;
  payBy: string;
}): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const ref = "RR-" + b.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  const payUrl = `${SITE_URL}/track`;
  const by = new Date(b.payBy);
  const byEn = by.toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const byFr = by.toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const amount =
    b.amountDue && b.amountDue > 0
      ? `Rs ${b.amountDue.toLocaleString("en-US")}`
      : null;

  const body = `
    ${paragraph(`Good news ${escapeHtml(b.name)} — <strong>${escapeHtml(b.placeName)}</strong> is free for ${escapeHtml(b.when)}, and we are holding it for you.`)}
    ${amount ? paragraph(`To confirm it, pay <strong>${amount}</strong> by <strong>${byEn}</strong>.`) : paragraph(`Confirm it by <strong>${byEn}</strong>.`)}
    ${paragraph(`We can only hold it until then — after that the slot goes back to whoever wants it. Nothing has been charged yet.`)}
    ${paragraph(`<a href="${payUrl}" style="color:${C.ink};font-weight:600">Confirm and pay (${ref})</a>`)}
    ${sepFr()}
    ${frHeading("Disponible")}
    ${paragraph(`Bonne nouvelle ${escapeHtml(b.name)} — <strong>${escapeHtml(b.placeName)}</strong> est libre pour ${escapeHtml(b.when)}, et nous vous le réservons.`)}
    ${amount ? paragraph(`Pour confirmer, réglez <strong>${amount}</strong> avant le <strong>${byFr}</strong>.`) : paragraph(`Confirmez avant le <strong>${byFr}</strong>.`)}
    ${paragraph(`Passé ce délai, la réservation est relâchée. Rien ne vous a encore été débité.`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! I'd like to confirm ${ref}.`, "💬 Confirm on WhatsApp")}</div>` : ""}`;

  return send({
    to: b.email,
    subject: `Available — confirm by ${byEn} · Disponible — ${ref}`,
    html: shell({
      preheader: "It's free for your dates. Pay by the date inside to confirm.",
      eyebrow: "Availability · Disponibilité",
      title: "Good news — it's available",
      body,
      logo,
    }),
    // One resolved type, used for BOTH the router and the dedupe key — two
    // different values here would let the same email send twice.
    type: placeEmailType("availability_confirmed", b.category),
    key: keyFor(placeEmailType("availability_confirmed", b.category), b.id),
    relatedType: "place_booking",
    relatedId: b.id,
  });
}

/** Not available — say so quickly, and never leave them waiting. */
export async function sendPlaceUnavailable(b: {
  id: string;
  email: string | null;
  name: string;
  placeName: string;
  category?: string | null;
  when: string;
  note: string | null;
}): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const ref = "RR-" + b.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  // Where to send them next depends on what they wanted. A guest who asked for
  // a fishing trip is not helped by a list of guesthouses.
  const isStay = (b.category ?? "").toLowerCase() === "hotel";
  const nextUrl = isStay
    ? `${SITE_URL}/explore`
    : `${SITE_URL}/experiences/boat`;

  const body = `
    ${paragraph(`${escapeHtml(b.name)}, we are sorry — <strong>${escapeHtml(b.placeName)}</strong> is not free for ${escapeHtml(b.when)}. <strong>You have not been charged anything.</strong>`)}
    ${b.note ? paragraph(`<strong style="color:${C.ink}">From us:</strong> ${escapeHtml(b.note)}`) : ""}
    ${paragraph(`We would still like to sort you out. Reply to this email or message us on WhatsApp and we will find something that works for those dates.`)}
    ${paragraph(`<a href="${nextUrl}" style="color:${C.ink};font-weight:600">See what else is available</a>`)}
    ${sepFr()}
    ${frHeading("Indisponible")}
    ${paragraph(`${escapeHtml(b.name)}, nous sommes désolés — <strong>${escapeHtml(b.placeName)}</strong> n'est pas libre pour ${escapeHtml(b.when)}. <strong>Rien ne vous a été débité.</strong>`)}
    ${b.note ? paragraph(`<strong style="color:${C.ink}">De notre part :</strong> ${escapeHtml(b.note)}`) : ""}
    ${paragraph(`Écrivez-nous ou contactez-nous sur WhatsApp : nous vous trouverons une alternative pour ces dates.`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! ${ref} wasn't available — what else do you suggest?`, "💬 Suggest me something")}</div>` : ""}`;

  return send({
    to: b.email,
    subject: `Not available for those dates · Indisponible — ${ref}`,
    html: shell({
      preheader: "You have not been charged. Let's find you something else.",
      eyebrow: "Availability · Disponibilité",
      title: "We couldn't get you that one",
      body,
      logo,
    }),
    // One resolved type, used for BOTH the router and the dedupe key — two
    // different values here would let the same email send twice.
    type: placeEmailType("unavailable", b.category),
    key: keyFor(placeEmailType("unavailable", b.category), b.id),
    relatedType: "place_booking",
    relatedId: b.id,
  });
}

// ── Reminder / feedback emails (sent by the daily cron) ──────────────────

/** Reminder sent the day before pickup. */
export async function sendPickupReminder(
  raw: BookingEmailData,
): Promise<boolean> {
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
  const type = vehicleEmailType(
    "pickup_reminder",
    await vehicleCategory(raw.scooter),
  );
  return send({
    to,
    subject: "Your rental is tomorrow · Votre location, c'est demain 🛵",
    html: shell({
      preheader: "Pickup is tomorrow · Le retrait, c'est demain.",
      eyebrow: "Pickup reminder · Rappel de retrait",
      title: "See you tomorrow!",
      body,
      logo,
    }),
    type,
    key: keyFor(type, bookingKeyPart(raw)),
    relatedType: "booking",
    relatedId: bookingKeyPart(raw),
  });
}

/** Reminder sent the day before the return is due. */
export async function sendReturnReminder(
  raw: BookingEmailData,
): Promise<boolean> {
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
  const type = vehicleEmailType(
    "return_reminder",
    await vehicleCategory(raw.scooter),
  );
  return send({
    to,
    subject: "Your return is tomorrow · Votre retour, c'est demain",
    html: shell({
      preheader:
        "Your vehicle is due back tomorrow · Retour du véhicule demain.",
      eyebrow: "Return reminder · Rappel de retour",
      title: "Return reminder",
      body,
      logo,
    }),
    type,
    key: keyFor(type, bookingKeyPart(raw)),
    relatedType: "booking",
    relatedId: bookingKeyPart(raw),
  });
}

// ── Post-rental feedback request (sent the day after return) ──────────────
export async function sendFeedbackRequest(
  raw: BookingEmailData,
): Promise<boolean> {
  const to = raw.email;
  if (!to) return false;
  const b = await withVehicleName(raw);
  const { wa, logo } = await getBrand();
  // ── #reviews DOES NOT EXIST ───────────────────────────────────
  // Checked against the live homepage: the only ids on it are #contact,
  // #explore, #rr-splash and #rto-compact. So every "Leave a review" button
  // this platform has ever emailed dropped the customer at the top of the
  // homepage with no idea what to do next — which is the whole review funnel,
  // silently broken, on a site whose reviews section reads
  // "Be the first to leave a review".
  //
  // #contact is the section that actually holds the reviews and the button
  // that opens the form. GOOGLE_REVIEW_URL still wins when it is set, and a
  // Google Business Profile review link is the better destination once one
  // exists — see the profile recommendation in the audit.
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#contact`;
  const body = `
    ${paragraph(`Hi ${b.name}, we hope you loved exploring Rodrigues! 🌴 How was your ride with the ${b.scooter}?`)}
    ${paragraph(`A quick review means the world to a small island business — it takes about 30 seconds and helps other travellers discover us.`)}
    ${sepFr()}
    ${frHeading("Merci d'avoir roulé avec nous !")}
    ${paragraph(`Bonjour ${b.name}, nous espérons que vous avez adoré Rodrigues ! 🌴 Comment s'est passée votre balade avec le ${b.scooter} ? Un petit avis compte énormément pour une petite entreprise locale — cela prend 30 secondes et aide d'autres voyageurs à nous découvrir.`)}
    <div style="text-align:center">${primaryButton(reviewUrl, "⭐ Leave a review · Laisser un avis")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! Here's my feedback on the ${b.scooter}: `, "💬 WhatsApp")}</div>` : ""}`;
  const type = vehicleEmailType(
    "feedback_request",
    await vehicleCategory(raw.scooter),
  );
  return send({
    to,
    subject: "How was your ride? · Votre avis ? 🛵",
    html: shell({
      preheader:
        "A 30-second review helps other travellers · Votre avis compte.",
      eyebrow: "Your feedback · Votre avis",
      title: "Thanks for riding with us!",
      body,
      logo,
    }),
    type,
    key: keyFor(type, bookingKeyPart(raw)),
    relatedType: "booking",
    relatedId: bookingKeyPart(raw),
  });
}

// ── Owner / admin reminders (sent the day before, internal English) ───────
function ownerActionEmail(
  b: BookingEmailData,
  kind: "deliver" | "collect",
  logo: string,
): string {
  const verb = kind === "deliver" ? "Deliver" : "Collect";
  const when = kind === "deliver" ? fmtDate(b.start_date) : fmtDate(b.end_date);
  const body = `
    ${paragraph(`<strong style="color:${C.ink}">${verb} tomorrow</strong> (${when}) for <strong>${b.name}</strong>.`)}
    ${detailCard(summaryRows(b) + rows(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []))}
    ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.scooter} ${kind === "deliver" ? "pickup" : "return"} tomorrow — `, "💬 Message " + b.name)}</div>` : ""}`;
  return shell({
    eyebrow: `${verb} reminder`,
    title: `${verb} tomorrow`,
    body,
    logo,
  });
}

/** Owner reminder: a scooter needs delivering tomorrow. */
export async function sendAdminPickupReminder(
  raw: BookingEmailData,
): Promise<boolean> {
  const owner = await ownerInbox();
  const b = await withVehicleName(raw);
  const { logo } = await getBrand();
  return send({
    to: owner,
    subject: `🛵 Deliver tomorrow: ${b.name} — ${b.scooter}`,
    html: ownerActionEmail(b, "deliver", logo),
    type: "owner_pickup_reminder",
    key: keyFor("owner_pickup_reminder", bookingKeyPart(raw)),
    relatedType: "booking",
    relatedId: bookingKeyPart(raw),
  });
}

/** Owner reminder: a scooter is due back tomorrow. */
export async function sendAdminReturnReminder(
  raw: BookingEmailData,
): Promise<boolean> {
  const owner = await ownerInbox();
  const b = await withVehicleName(raw);
  const { logo } = await getBrand();
  return send({
    to: owner,
    subject: `↩️ Collect tomorrow: ${b.name} — ${b.scooter}`,
    html: ownerActionEmail(b, "collect", logo),
    type: "owner_return_reminder",
    key: keyFor("owner_return_reminder", bookingKeyPart(raw)),
    relatedType: "booking",
    relatedId: bookingKeyPart(raw),
  });
}

// ── Stay · Eat · Do reservations ─────────────────────────────────────────
interface PlaceBookingEmailData {
  /** Row id — idempotency key only, never shown to the customer. */
  id?: string | null;
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
  if (b.ref)
    pairs.push([
      "Booking reference · Référence",
      `<b>${b.ref}</b> — manage at roulerodrig.com/manage-booking`,
    ]);
  pairs.push(["Place · Lieu", b.place_name]);
  pairs.push([sameDay ? "Date" : "Check-in · Arrivée", fmtDate(b.start_date)]);
  if (!sameDay) pairs.push(["Check-out · Départ", fmtDate(b.end_date)]);
  if (b.time_slot) pairs.push(["Time · Heure", b.time_slot]);
  const qty = b.quantity ?? 0;
  if (qty > 0) {
    const unit =
      b.category === "hotel"
        ? "Rooms · Chambres"
        : b.category === "restaurant"
          ? "Party size · Couverts"
          : "People · Personnes";
    pairs.push([unit, String(qty)]);
  }
  if (b.guests) pairs.push(["Guests · Invités", String(b.guests)]);
  return rows(pairs);
}

// ── "Someone says they have paid" ──────────────────────────────────────────
//
// The gap this closes: after M83 a customer can upload a bank slip against a
// rental or an activity, and after M49 against a shop or food order — but every
// one of those paths ended with the money sitting there until the owner
// happened to open /admin. A booking that is paid and unseen is a guest who
// arrives to nothing.
//
// Owner-only and internal, so it is English and blunt: what, who, how much, and
// whether there is a file to look at. It deliberately does NOT confirm anything
// — a customer saying they paid is a claim, and the owner is the one who checks
// it against the bank.
export async function sendPaymentReportedAlert(input: {
  kind: "vehicle" | "activity" | "order";
  /** RR-XXXXXX for bookings, the order number for orders. */
  reference: string;
  customer: string;
  item: string | null;
  amount: number | null;
  /** False when they pressed "I have paid" but attached nothing. */
  hasReceipt: boolean;
  phone?: string | null;
  email?: string | null;
  /** Where in /admin this is dealt with. */
  adminPath?: string;
}): Promise<boolean> {
  const owner = await ownerInbox();
  const { logo } = await getBrand();

  const where =
    input.kind === "vehicle"
      ? "Bookings"
      : input.kind === "activity"
        ? "Stay & Activity Bookings"
        : "Orders";

  const body = `
    ${paragraph(
      `<strong>${input.customer}</strong> says they have paid by bank transfer. Nothing is confirmed until you check it — open <strong>${where}</strong> in your admin dashboard${
        input.hasReceipt ? " and open the payment proof they attached" : ""
      }.`,
    )}
    ${detailCard(
      rows([
        ["Reference", input.reference],
        ...(input.item ? ([["What", input.item]] as [string, string][]) : []),
        ...(input.amount != null
          ? ([
              ["Amount they owe", `Rs ${input.amount.toLocaleString("en-US")}`],
            ] as [string, string][])
          : []),
        [
          "Proof attached",
          input.hasReceipt
            ? "Yes — open it in admin"
            : "NO FILE — worth chasing",
        ],
        ...(input.phone
          ? ([["Phone", input.phone]] as [string, string][])
          : []),
        ...(input.email
          ? ([["Email", input.email]] as [string, string][])
          : []),
      ]),
    )}
    ${input.phone ? `<div style="text-align:center">${waButton(input.phone, `Hi ${input.customer}, thanks — checking your transfer now.`, "💬 Message " + input.customer)}</div>` : ""}`;

  return send({
    to: owner,
    subject: `Payment reported: ${input.customer} — ${input.reference}`,
    html: shell({
      preheader: input.hasReceipt
        ? "A customer sent proof of payment."
        : "A customer says they paid — no file attached.",
      eyebrow: "Payment reported",
      title: input.customer,
      body,
      logo,
    }),
    type: "owner_payment_reported",
    // One alert per booking per declaration. Re-uploading a better photo of the
    // same slip should not mail the owner twice.
    key: keyFor("owner_payment_reported", input.reference),
    relatedType: input.kind === "order" ? "order" : "booking",
    relatedId: input.reference,
  });
}

/** Customer confirmation + owner notification for a Stay·Eat·Do reservation. */
export async function sendPlaceBookingEmails(
  b: PlaceBookingEmailData,
): Promise<{ customer: boolean; owner: boolean }> {
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
    const type = placeEmailType("booking_confirmation", b.category);
    result.customer = await send({
      to: b.email,
      subject: `Your ${b.place_name} reservation · Votre réservation 🌴`,
      html: shell({
        preheader: "We've received your reservation · Réservation bien reçue.",
        eyebrow: "Reservation received · Réservation reçue",
        title: "Thanks for your reservation!",
        body,
        logo,
      }),
      type,
      key: keyFor(type, bookingKeyPart(b)),
      relatedType: "place_booking",
      relatedId: bookingKeyPart(b),
    });
  }

  const owner = await ownerInbox();
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
    result.owner = await send({
      to: owner,
      subject: `New reservation: ${b.name} — ${b.place_name}`,
      html: shell({
        eyebrow: "New reservation request",
        title: b.name,
        body,
        logo,
      }),
      type: "owner_place_booking_alert",
      key: keyFor("owner_place_booking_alert", bookingKeyPart(b)),
      relatedType: "place_booking",
      relatedId: bookingKeyPart(b),
    });
  }

  return result;
}

/** Customer reminder the day before a Stay·Eat·Do reservation. */
export async function sendPlaceReminder(
  b: PlaceBookingEmailData,
): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  const body = `
    ${paragraph(`Hi ${b.name}, a friendly reminder — your reservation at <strong>${b.place_name}</strong> is <strong>tomorrow</strong> (${fmtDate(b.start_date)}). 🌴`)}
    ${detailCard(placeRows(b))}
    ${sepFr()}
    ${frHeading("À demain !")}
    ${paragraph(`Bonjour ${b.name}, petit rappel — votre réservation à <strong>${b.place_name}</strong> est <strong>demain</strong> (${fmtDate(b.start_date)}). 🌴`)}
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi! About my ${b.place_name} reservation tomorrow — `, "💬 WhatsApp")}</div>` : ""}`;
  const type = placeEmailType("reminder", b.category);
  return send({
    to: b.email,
    subject: `Reservation tomorrow · Réservation demain — ${b.place_name} 🌴`,
    html: shell({
      preheader:
        "Your reservation is tomorrow · Votre réservation, c'est demain.",
      eyebrow: "Reservation reminder · Rappel",
      title: "See you tomorrow!",
      body,
      logo,
    }),
    type,
    key: keyFor(type, bookingKeyPart(b)),
    relatedType: "place_booking",
    relatedId: bookingKeyPart(b),
  });
}

/** Customer feedback request the day after a Stay·Eat·Do reservation. */
export async function sendPlaceFeedbackRequest(
  b: PlaceBookingEmailData,
): Promise<boolean> {
  if (!b.email) return false;
  const { wa, logo } = await getBrand();
  // ── #reviews DOES NOT EXIST ───────────────────────────────────
  // Checked against the live homepage: the only ids on it are #contact,
  // #explore, #rr-splash and #rto-compact. So every "Leave a review" button
  // this platform has ever emailed dropped the customer at the top of the
  // homepage with no idea what to do next — which is the whole review funnel,
  // silently broken, on a site whose reviews section reads
  // "Be the first to leave a review".
  //
  // #contact is the section that actually holds the reviews and the button
  // that opens the form. GOOGLE_REVIEW_URL still wins when it is set, and a
  // Google Business Profile review link is the better destination once one
  // exists — see the profile recommendation in the audit.
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || `${SITE_URL}/#contact`;
  const body = `
    ${paragraph(`Hi ${b.name}, how was <strong>${b.place_name}</strong>? We'd love to hear about it — a quick review helps other travellers and the local business. 💛`)}
    ${sepFr()}
    ${frHeading("Merci de votre visite !")}
    ${paragraph(`Bonjour ${b.name}, comment s'est passé <strong>${b.place_name}</strong> ? Nous serions ravis d'avoir votre retour — un petit avis aide d'autres voyageurs et l'entreprise locale. 💛`)}
    <div style="text-align:center">${primaryButton(reviewUrl, "⭐ Leave a review · Laisser un avis")}</div>
    ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! Here's my feedback on ${b.place_name}: `, "💬 WhatsApp")}</div>` : ""}`;
  const type = placeEmailType("feedback_request", b.category);
  return send({
    to: b.email,
    subject: `How was ${b.place_name}? · Votre avis ? 🌴`,
    html: shell({
      preheader: "A quick review helps other travellers · Votre avis compte.",
      eyebrow: "Your feedback · Votre avis",
      title: "Thanks for visiting!",
      body,
      logo,
    }),
    type,
    key: keyFor(type, bookingKeyPart(b)),
    relatedType: "place_booking",
    relatedId: bookingKeyPart(b),
  });
}

/** Owner reminder: a Stay·Eat·Do reservation is happening tomorrow. */
export async function sendAdminPlaceReminder(
  b: PlaceBookingEmailData,
): Promise<boolean> {
  const owner = await ownerInbox();
  const { logo } = await getBrand();
  const body = `
    ${paragraph(`<strong style="color:${C.ink}">Reservation tomorrow</strong> (${fmtDate(b.start_date)}) — <strong>${b.name}</strong> at <strong>${b.place_name}</strong>.`)}
    ${detailCard(placeRows(b) + rows(b.phone ? ([["Phone", b.phone]] as [string, string][]) : []))}
    ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${b.place_name} reservation tomorrow — `, "💬 Message " + b.name)}</div>` : ""}`;
  return send({
    to: owner,
    subject: `🌴 Reservation tomorrow: ${b.name} — ${b.place_name}`,
    html: shell({
      eyebrow: "Reservation reminder",
      title: "Reservation tomorrow",
      body,
      logo,
    }),
    type: "owner_place_reminder",
    key: keyFor("owner_place_reminder", bookingKeyPart(b)),
    relatedType: "place_booking",
    relatedId: bookingKeyPart(b),
  });
}

// ── RIDES: TAXI, TRANSFERS AND PRIVATE HIRE ──────────────────────────────
//
// A ride was the one way of buying from this business that emailed nobody.
// /api/rides created the request and stopped: the customer who typed their
// address got no confirmation, and the owner learned about the job only if he
// happened to open /admin/rides. Every other public route tells somebody.
//
// So: the same two emails as every other booking flow — a bilingual
// confirmation to the customer, and an English-only alert to the owner — built
// from the same shell, cards and rows, because a taxi request is not a
// different company from a scooter rental.
interface RideEmailData {
  /** RR-XXXXXX, returned by create_ride_request(). The only handle the customer
   *  has, and the idempotency part for both sends. Null disables idempotency
   *  rather than inventing a key that could collide — same rule as
   *  bookingKeyPart(). */
  reference: string | null;
  service: RideService;
  whenKind: string | null;
  scheduledAt: string | null;
  pickup: string;
  /** Null for a private day hire — there is genuinely nowhere to go (M98). */
  dropoff: string | null;
  passengers: number;
  luggage: number;
  /** Minor units, computed server-side by quote_ride(). Null when the ride
   *  cannot be priced, which is still a ride worth taking. */
  price: number | null;
  flightRef: string | null;
  meetGreet: boolean;
  notes: string | null;
  name: string;
  phone: string;
  email: string | null;
}

/** Bilingual "Label EN · Label FR" rows, shared by both ride emails exactly as
 *  summaryRows() and placeRows() are shared by theirs. */
function rideRows(b: RideEmailData): string {
  const meta = RIDE_SERVICE_META[b.service];
  const pairs: [string, string][] = [];
  if (b.reference)
    pairs.push([
      "Reference · Référence",
      `<b>${b.reference}</b> — follow at roulerodrig.com/taxi/track`,
    ]);
  pairs.push(["Service", meta ? meta.label : b.service]);
  pairs.push(["Pickup · Prise en charge", escapeHtml(b.pickup)]);
  pairs.push([
    "Drop-off · Destination",
    b.dropoff
      ? escapeHtml(b.dropoff)
      : "Day hire — no fixed destination · Mise à disposition",
  ]);
  // pickupTimeLabel() owns the scheduled rendering, in Indian/Mauritius, so
  // this email can never show a different time from the admin desk or from the
  // WhatsApp the driver is holding. Only the "now" case is restated here, to
  // carry its French half.
  pairs.push([
    "When · Quand",
    b.whenKind === "now" || !b.scheduledAt
      ? "As soon as possible · Dès que possible"
      : pickupTimeLabel(b.whenKind, b.scheduledAt),
  ]);
  pairs.push(["Passengers · Passagers", String(b.passengers)]);
  if (b.luggage > 0) pairs.push(["Luggage · Bagages", String(b.luggage)]);
  if (b.flightRef)
    pairs.push(["Flight / ferry · Vol ou ferry", escapeHtml(b.flightRef)]);
  if (b.meetGreet)
    pairs.push(["Meet & greet · Accueil à l'arrivée", "Yes · Oui"]);
  pairs.push([
    "Price · Prix",
    b.price != null
      ? formatRidePrice(b.price)
      : "Price on request · Prix sur demande",
  ]);
  return rows(pairs);
}

/**
 * Customer confirmation (only when an email was given — the field is optional
 * on /taxi/book and most people leave it blank) + owner alert for a taxi,
 * transfer or private hire request.
 * Never throws — returns a small status object, like every sender here.
 */
export async function sendRideEmails(
  b: RideEmailData,
): Promise<{ customer: boolean; owner: boolean }> {
  const result = { customer: false, owner: false };
  const { wa, logo } = await getBrand();
  const meta = RIDE_SERVICE_META[b.service];
  const label = meta ? meta.label : b.service;
  const what = label.toLowerCase();
  const trackUrl = `${SITE_URL}/taxi/track${b.reference ? `?ref=${encodeURIComponent(b.reference)}` : ""}`;

  // ── Customer confirmation (bilingual EN + FR) ──
  // The phone number is the channel that always exists — the email address is
  // optional and the driver never sees it — which is why the copy points at the
  // phone rather than promising a reply to this message.
  if (b.email) {
    const body = `
      ${paragraph(`Hi ${escapeHtml(b.name)}, we've received your ${what} request. This is a <strong>request</strong>, not a confirmed ride yet — we're offering it to drivers now, and one of them usually accepts within a few minutes.`)}
      ${sectionLabel("Your ride · Votre course")}
      ${detailCard(rideRows(b))}
      ${paragraph(`We'll reach you on <strong>${escapeHtml(b.phone)}</strong> — by call or WhatsApp — as soon as a driver takes it, and your driver will use that same number to find you. Please keep your phone nearby.`)}
      ${checkList([
        "Your driver's name and number appear on the tracking page the moment they accept",
        "You pay the driver directly at the end of the trip — nothing is charged here",
        "Need to change or cancel? Reply to this email, or message us on WhatsApp",
      ])}
      <div style="text-align:center">${primaryButton(trackUrl, "Follow my ride · Suivre ma course")}</div>
      ${b.reference ? paragraph(`<span style="color:${C.muted};font-size:13px">You'll need your reference <b>${b.reference}</b> and the phone number above to open it.</span>`) : ""}
      ${sepFr()}
      ${frHeading("Nous cherchons votre chauffeur")}
      ${paragraph(`Bonjour ${escapeHtml(b.name)}, nous avons bien reçu votre demande de course. Il s'agit d'une <strong>demande</strong>, pas encore d'une course confirmée — nous la proposons aux chauffeurs maintenant, et l'un d'eux l'accepte généralement en quelques minutes.`)}
      ${paragraph(`Nous vous joindrons au <strong>${escapeHtml(b.phone)}</strong> — par appel ou WhatsApp — dès qu'un chauffeur l'accepte, et il utilisera ce même numéro pour vous retrouver. Gardez votre téléphone à portée de main.`)}
      ${checkList([
        "Le nom et le numéro de votre chauffeur s'affichent sur la page de suivi dès qu'il accepte",
        "Vous réglez le chauffeur directement à la fin de la course — rien n'est débité ici",
        "Besoin de modifier ou d'annuler ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp",
      ])}
      ${wa ? `<div style="text-align:center">${waButton(wa, `Hi Roule Rodrigues! About my ride${b.reference ? ` ${b.reference}` : ""} — `, "💬 WhatsApp")}</div>` : ""}`;
    result.customer = await send({
      to: b.email,
      subject: "Your ride request · Votre demande de course 🚕",
      html: shell({
        preheader:
          "We're finding your driver · Nous cherchons votre chauffeur.",
        eyebrow: "Request received · Demande reçue",
        title: "We're finding your driver",
        body,
        logo,
      }),
      type: "ride_request_confirmation",
      key: keyFor("ride_request_confirmation", b.reference),
      relatedType: "ride",
      relatedId: b.reference,
    });
  }

  // ── Owner alert (internal, English — same convention as every other one) ──
  const owner = await ownerInbox();
  if (owner) {
    const body = `
      ${paragraph(`New <strong>${label}</strong> request from <strong>${escapeHtml(b.name)}</strong>. Drivers are being offered it automatically — open <strong>Rides</strong> in your admin dashboard to watch it, or to place it by hand if nobody accepts.`)}
      ${detailCard(
        rideRows(b) +
          rows([
            ...(b.phone
              ? ([["Phone", escapeHtml(b.phone)]] as [string, string][])
              : []),
            ...(b.email
              ? ([["Email", escapeHtml(b.email)]] as [string, string][])
              : []),
          ]),
      )}
      ${b.notes ? paragraph(`<strong style="color:${C.ink}">Note:</strong> ${escapeHtml(b.notes)}`) : ""}
      ${b.phone ? `<div style="text-align:center">${waButton(b.phone, `Hi ${b.name}, this is Roule Rodrigues about your ${what} request — `, "💬 Message " + b.name)}</div>` : ""}
      ${paragraph(`<span style="color:${C.muted};font-size:12px">Manage this in your admin dashboard → Rides.</span>`)}`;
    result.owner = await send({
      to: owner,
      subject: `New ride: ${b.name} — ${label}`,
      html: shell({
        eyebrow: "New ride request",
        title: escapeHtml(b.name),
        body,
        logo,
      }),
      type: "owner_ride_alert",
      key: keyFor("owner_ride_alert", b.reference),
      relatedType: "ride",
      relatedId: b.reference,
    });
  }

  return result;
}

// ── Instant enquiry auto-reply (bilingual) ───────────────────────────────
export async function sendEnquiryAck(
  to: string,
  name: string | null,
): Promise<boolean> {
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
  // Keyed by address + UTC day. A contact submission has no id available here
  // (the anon INSERT cannot return one under RLS), and this is the honest
  // middle ground: a double-submitted form gets ONE auto-reply, while a
  // genuine second enquiry tomorrow still gets its own.
  return send({
    to,
    subject: "We've got your message · Message bien reçu 🛵",
    html: shell({
      preheader:
        "We've received your message · Nous avons bien reçu votre message.",
      eyebrow: "Message received · Message reçu",
      title: "Thanks for getting in touch!",
      body,
      logo,
    }),
    type: "enquiry_ack",
    key: `enquiry_ack:${to.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`,
  });
}

/**
 * The other half of the enquiry: tell the owner a lead arrived.
 *
 * sendEnquiryAck promises the sender that "a real person will get back to you
 * within a few hours". Nothing told the real person. The enquiry sat in
 * contact_submissions behind a badge in /admin, which is exactly as reliable as
 * remembering to look — and unlike a booking there is no row anywhere else to
 * trip over later.
 *
 * Owner-facing, so English only, like every other internal alert here.
 */
export async function sendOwnerEnquiryAlert(e: {
  name: string | null;
  email: string | null;
  phone: string | null;
  scooter?: string | null;
  dates?: string | null;
  message: string | null;
}): Promise<boolean> {
  const owner = await ownerInbox();
  if (!owner) return false;
  const { logo } = await getBrand();
  const who = (e.name ?? "").trim() || (e.email ?? "").trim() || "Someone";
  const reply = (e.email ?? "").trim();

  const body = `
    ${paragraph(`<strong>${escapeHtml(who)}</strong> sent an enquiry through the website.${reply ? ` They have had the automatic acknowledgement, which promises a reply from a real person within a few hours.` : ` They left no email address, so nothing has answered them — the phone number below is the only way back.`}`)}
    ${detailCard(
      rows([
        ...(e.name
          ? ([["Name", escapeHtml(e.name)]] as [string, string][])
          : []),
        ...(reply
          ? ([
              [
                "Email",
                `<a href="mailto:${encodeURI(reply)}" style="color:${C.ink};font-weight:600">${escapeHtml(reply)}</a>`,
              ],
            ] as [string, string][])
          : []),
        ...(e.phone
          ? ([["Phone", escapeHtml(e.phone)]] as [string, string][])
          : []),
        ...(e.scooter
          ? ([["Interested in", escapeHtml(e.scooter)]] as [string, string][])
          : []),
        ...(e.dates
          ? ([["Dates", escapeHtml(e.dates)]] as [string, string][])
          : []),
      ]),
    )}
    ${e.message ? paragraph(`<strong style="color:${C.ink}">Message:</strong> ${escapeHtml(e.message)}`) : ""}
    ${e.phone ? `<div style="text-align:center">${waButton(e.phone, `Hi ${who}, this is Roule Rodrigues — thanks for your message. `, "💬 Message " + who)}</div>` : ""}
    ${paragraph(`<span style="color:${C.muted};font-size:12px">Manage this in your admin dashboard → Enquiries.</span>`)}`;

  return send({
    to: owner,
    subject: `New enquiry: ${who}`,
    html: shell({
      eyebrow: "New enquiry",
      title: escapeHtml(who),
      body,
      logo,
    }),
    type: "owner_enquiry_alert",
    // Keyed on the CONTENT, not on the address + day the acknowledgement uses.
    // A double-tapped Send must not mail the owner twice; a second, DIFFERENT
    // enquiry from the same person the same afternoon is a second lead and has
    // to arrive. Keying it the way the ack is keyed would silently swallow it,
    // which is the exact failure this email exists to end. The contact INSERT is
    // anonymous and returns no id under RLS, so there is no row id to key on.
    key: `owner_enquiry_alert:${createHash("sha256")
      .update(
        `${(e.email ?? "").toLowerCase()}|${e.phone ?? ""}|${e.name ?? ""}|${e.message ?? ""}`,
      )
      .digest("hex")
      .slice(0, 16)}:${new Date().toISOString().slice(0, 10)}`,
  });
}

// ── Waitlist / saved-list welcome (lifecycle remarketing, bilingual) ─────
// ── AUTH EMAIL, ON THE TRANSPORT THAT ACTUALLY WORKS ─────────────────────
//
// Password resets and confirmations were the ONLY customer mail this site did
// not send. Supabase Auth sent them, over its own SMTP, which is three
// problems at once:
//
//   1. It is documented as suitable for testing only, and it rate-limits hard —
//      "you can only request this after 43 seconds" is a real 429 from it.
//   2. It sends from Supabase's shared sender, so the one email that MUST be
//      trusted is the one email with none of this domain's SPF, DKIM or DMARC
//      behind it. Everything else the business sends is authenticated; the
//      password reset was not, which is exactly backwards.
//   3. It is invisible to email_log, so "did it send?" had no answer here.
//
// generateLink() mints the same link WITHOUT sending anything, so the token
// stays Supabase's and the delivery becomes ours.
export async function sendAuthLink(o: {
  to: string;
  kind: "recovery" | "confirm";
  link: string;
}): Promise<boolean> {
  const { logo } = await getBrand();
  const recovery = o.kind === "recovery";

  const leadEn = recovery
    ? "Somebody asked to reset the password for this email address on Roule Rodrigues. Tap the button to choose a new one."
    : "Welcome to Roule Rodrigues. Tap the button to confirm this address and finish setting up your account.";
  const leadFr = recovery
    ? "Quelqu’un a demandé à réinitialiser le mot de passe de cette adresse sur Roule Rodrigues. Touchez le bouton pour en choisir un nouveau."
    : "Bienvenue chez Roule Rodrigues. Touchez le bouton pour confirmer cette adresse et terminer la création de votre compte.";
  const label = recovery
    ? "🔑 Set a new password · Nouveau mot de passe"
    : "✅ Confirm my email · Confirmer mon adresse";

  // The sentence that matters most to somebody who did NOT ask for this, said
  // in both languages: doing nothing is a complete answer.
  const ignoreEn = recovery
    ? "The link expires in one hour and can be used once. If you did not ask for this, ignore this email — your password stays exactly as it is."
    : "The link expires in one hour. If you did not create this account, ignore this email and nothing further will happen.";
  const ignoreFr = recovery
    ? "Le lien expire dans une heure et ne peut servir qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail — votre mot de passe reste inchangé."
    : "Le lien expire dans une heure. Si vous n’avez pas créé ce compte, ignorez cet e-mail et rien ne se passera.";

  const body = `
    ${paragraph(leadEn)}
    <div style="text-align:center;margin-bottom:6px">${primaryButton(o.link, label)}</div>
    ${paragraph(ignoreEn)}
    ${sepFr()}
    ${frHeading(recovery ? "Nouveau mot de passe" : "Confirmez votre adresse")}
    ${paragraph(leadFr)}
    ${paragraph(ignoreFr)}`;

  return send({
    to: o.to,
    subject: recovery
      ? "Set a new password · Nouveau mot de passe"
      : "Confirm your email · Confirmez votre adresse",
    html: shell({
      preheader: recovery
        ? "A link to choose a new password · Un lien pour choisir un nouveau mot de passe."
        : "Confirm your email address · Confirmez votre adresse e-mail.",
      eyebrow: recovery ? "Password reset · Mot de passe" : "Welcome · Bienvenue",
      title: recovery ? "Set a new password" : "Confirm your email",
      body,
      logo,
    }),
    type: recovery ? "password_reset" : "email_verification",
    // NO idempotency key, deliberately. Each request mints a fresh token, and
    // de-duplicating would swallow the second attempt of somebody who genuinely
    // did not receive the first — the exact situation this exists to rescue.
  });
}

export async function sendWaitlistWelcome(
  to: string,
  source?: string,
  /** Admin "send a test email" path. Sends the same template but as the
   *  `admin_test` type with NO idempotency key — otherwise the second test to
   *  the same address would be silently deduped and report success without an
   *  email arriving, which is the exact opposite of what a test button is for.
   *  `provider` pins the send so a newly-configured provider can be proven,
   *  rather than the test quietly succeeding through the other one. */
  opts?: { test?: boolean; provider?: "resend" | "brevo" },
): Promise<boolean> {
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
  return send({
    to,
    subject: savedList
      ? "Your list is saved · Votre liste est enregistrée 🛵"
      : "Welcome to Roule Rodrigues · Bienvenue 🛵🌴",
    type: opts?.test ? "admin_test" : "waitlist_welcome",
    // Source is part of the key: joining the waitlist and saving a list are two
    // different emails, and one must not suppress the other.
    key: opts?.test
      ? null
      : `waitlist_welcome:${source ?? "default"}:${to.toLowerCase()}`,
    ...(opts?.provider ? { forceProvider: opts.provider } : {}),
    html: shell({
      preheader: savedList
        ? "Your saved list is waiting · Votre liste vous attend."
        : "Island tips, deals and hidden spots · Conseils et offres de Rodrigues.",
      eyebrow: savedList
        ? "Your saved list · Votre liste"
        : "Welcome aboard · Bienvenue",
      title: savedList ? "Your saved list is waiting" : "Welcome aboard!",
      body,
      logo,
    }),
  });
}

/**
 * Weekly digest of questions Ti Roulé couldn't answer, so the owner can grow the
 * knowledge base (and SEO). Sent from the daily cron, once a week.
 */
export async function sendTiRouleMissesDigest(
  to: string,
  rows: { question: string; count: number }[],
): Promise<boolean> {
  if (!to || !rows.length) return false;
  const esc = (s: string) =>
    s.replace(
      /[&<>"]/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[
          c
        ] as string,
    );
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
  return send({
    to,
    subject: `Ti Roulé — ${rows.length} question${rows.length === 1 ? "" : "s"} to answer this week 🐢`,
    html: shell({
      preheader: "Top questions Ti Roulé couldn't answer this week.",
      eyebrow: "Ti Roulé · weekly",
      title: "This week's unanswered questions",
      body,
    }),
    type: "owner_tiroule_digest",
    // One digest per UTC week. The cron already gates on "is it Monday?", but a
    // re-run or a manual trigger on the same Monday would otherwise resend it.
    key: `owner_tiroule_digest:${new Date().toISOString().slice(0, 10)}`,
  });
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
  /** Fleet id or name, so the email is routed as car or scooter. Optional: the
   *  caller only has the display name in some paths, and vehicleCategory()
   *  resolves either — defaulting to scooter exactly as pricing does. */
  vehicleId?: string | null;
}): Promise<boolean> {
  const first = (o.name ?? "").trim().split(/\s+/)[0] || "there";
  const dates =
    o.start === o.end
      ? fmtDate(o.start)
      : `${fmtDate(o.start)} → ${fmtDate(o.end)}`;
  const html = shell({
    eyebrow: "Booking update · Mise à jour",
    title: "That vehicle was just booked",
    preheader:
      "The vehicle you requested has been taken — you were not charged.",
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
  const type = vehicleEmailType(
    "booking_status",
    await vehicleCategory(o.vehicleId ?? o.vehicle),
  );
  return send({
    to: o.to,
    subject: "Update on your Roule Rodrigues booking",
    html,
    type,
    key: keyFor(type, (o.ref ?? "").trim() || null),
    relatedType: "booking",
    relatedId: (o.ref ?? "").trim() || null,
  });
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
  /**
   * Routing type. Passed in rather than derived because one template serves the
   * whole order lifecycle — placed, accepted, paid, expired, merchant copy —
   * and those are different email types with different priorities. Defaults to
   * the generic status type so an unmigrated caller still routes and logs.
   */
  type?: EmailType;
  /** Stable per-event key, e.g. `marketplace_order_status:<orderId>:accepted`. */
  idempotencyKey?: string | null;
  orderId?: string | null;
}): Promise<boolean> {
  const { logo } = await getBrand();
  const pairs: [string, string][] = [
    ...(o.orderNumber
      ? ([["Order", o.orderNumber]] as [string, string][])
      : []),
    ...(o.details ?? []),
  ];
  const body = `
    ${paragraph(o.message)}
    ${pairs.length ? detailCard(rows(pairs)) : ""}
    ${o.cta ? `<div style="text-align:center">${primaryButton(o.cta.url, o.cta.label)}</div>` : ""}`;
  return send({
    to: o.to,
    subject: o.subject,
    html: shell({ eyebrow: "Order update", title: o.heading, body, logo }),
    type: o.type ?? "marketplace_order_status",
    key: o.idempotencyKey ?? null,
    relatedType: "order",
    relatedId: o.orderId ?? o.orderNumber ?? null,
  });
}
