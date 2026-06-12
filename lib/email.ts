// Lightweight email sender using the Resend REST API (no SDK dependency).
// Gracefully no-ops when RESEND_API_KEY is not configured, so bookings never
// break just because email isn't set up yet.

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
}

const BRAND = "#F5C842";

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[email] RESEND_API_KEY not set — skipping email to", to);
    return false;
  }
  const from = process.env.RESEND_FROM || "Roule Rodrigues <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}

function summaryRows(b: BookingEmailData): string {
  const rows: [string, string][] = [
    ["Scooter", b.scooter],
    ["Pickup", fmtDate(b.start_date)],
    ["Return", fmtDate(b.end_date)],
    ["Duration", `${b.days} day${b.days !== 1 ? "s" : ""}`],
  ];
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
          <p style="color:#888;font-size:12px;line-height:1.6;margin:0">
            This is a request, not a confirmed reservation. We'll be in touch shortly to finalise everything.
          </p>
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
    <p style="color:#888;font-size:13px;line-height:1.6;margin:16px 0 0">
      Please bring a valid driving licence. See you soon — message us on WhatsApp if anything changes.
    </p>`;
  return send(b.email, "Reminder: your Roule Rodrigues pickup is tomorrow 🛵", reminderShell("Your ride is almost here!", body));
}

/** Reminder sent on the return day. */
export async function sendReturnReminder(b: BookingEmailData): Promise<boolean> {
  if (!b.email) return false;
  const body = `
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${b.name}, just a reminder that your scooter is due back <strong>today</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee">${summaryRows(b)}</table>
    <p style="color:#888;font-size:13px;line-height:1.6;margin:16px 0 0">
      Thanks for riding with us! We'd love a quick review of your experience. 💛
    </p>`;
  return send(b.email, "Reminder: your scooter return is today", reminderShell("Return reminder", body));
}
