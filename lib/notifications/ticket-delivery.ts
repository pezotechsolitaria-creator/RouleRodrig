import "server-only";
import { sendTransactionalEmail } from "@/lib/email/send";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

// ── "Your tickets are ready" ────────────────────────────────────────────────
//
// The events checkout tells the buyer, in as many words, "Email — your ticket
// goes here." Until this file existed that was false: M41 registered
// ticket_qr_delivery as `planned`, M35 issued tickets into a table, and the only
// way to ever see one was to find your way back to the tracking page unprompted.
// A promise in UI copy is a commitment, and this is the code that keeps it.
//
// ── WHY THE QR IS A LINK, NOT AN IMAGE IN THE EMAIL ─────────────────────────
// Embedding it would be nicer and is not worth what it costs. A QR has to be a
// raster to survive Gmail — data: URIs in <img> are stripped by Gmail, and SVG
// is not rendered by Outlook — which means generating a PNG server-side, which
// means a canvas dependency in a serverless function for one image. The link
// costs the buyer one tap and works in every client, including the text-only
// preview on a locked phone at a venue entrance.
//
// The ?ref= link carries only the ORDER NUMBER. The email address is still
// typed on arrival, so the link alone — forwarded, screenshotted, or sitting in
// a mail provider's logs — does not open anybody's tickets. That is the same
// rule /orders/track already follows for the confirmation email.

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function html(heading: string, paragraphs: string[], cta: { url: string; label: string }) {
  // Plain and inline-styled: email clients strip <style>, and this has to
  // survive Gmail, Outlook and a Rodrigues phone on 3G.
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
  ${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${escapeHtml(p)}</p>`).join("")}
  <p style="margin:24px 0 0"><a href="${cta.url}" style="background:#2F80ED;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;display:inline-block">${escapeHtml(cta.label)}</a></p>
  <p style="font-size:12px;color:#777;margin:28px 0 0">Roulé Rodrigues · roulerodrig.com</p>
</div>`;
}

function whenLabel(iso: string | null, timeZone: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone ?? "Indian/Mauritius",
      weekday: "long", day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/**
 * Emails the buyer that their tickets exist, with a link to them.
 *
 * Never throws and never blocks: it is called after the organiser has already
 * confirmed a payment, and a mail provider having a bad minute must not undo
 * that or fail their click. Returns false when there was nothing to send.
 */
/**
 * Send (or RE-send) the ticket email for an order.
 *
 * `resendToken` exists for one real support case: the buyer says the email never
 * arrived. The normal send is idempotent per order — Postgres enforces exactly
 * once, which is right for a double-tapped Confirm button — but that same
 * guarantee makes a naive resend a silent no-op: the operator sees "sent" and
 * nothing leaves. Passing a token varies the key so the resend actually happens,
 * and the caller is expected to write an audit line so repeats are visible.
 */
export async function notifyTicketsIssued(orderId: string, resendToken?: string): Promise<boolean> {
  try {
    if (!hasServiceRole()) {
      // Loud, because this is a promise to a paying customer going unkept.
      console.error("notifyTicketsIssued: SUPABASE_SERVICE_ROLE_KEY missing — ticket email not sent");
      return false;
    }
    const supabase = await getPrivileged();

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_number, customer_email, customer_name, customer_id, store_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !order) {
      console.error("notifyTicketsIssued: order not readable", error);
      return false;
    }

    const to = (order.customer_email ?? "").trim();
    if (!to) return false;

    // Only an EVENT order gets this. A marketplace order reaching here would
    // otherwise be told it has tickets.
    const { data: ev } = await supabase
      .from("events")
      .select("starts_at, timezone, venue_name, venue_address, stores(name, slug)")
      .eq("store_id", order.store_id)
      .maybeSingle();
    if (!ev) return false;

    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    const tickets = count ?? 0;
    if (tickets === 0) return false;

    const store = (ev as { stores?: { name?: string; slug?: string } }).stores;
    const eventName = store?.name ?? "your event";
    const when = whenLabel((ev as { starts_at: string }).starts_at, (ev as { timezone: string }).timezone);
    const venue = (ev as { venue_name: string | null }).venue_name;
    const address = (ev as { venue_address: string | null }).venue_address;
    const first = (order.customer_name ?? "").trim().split(/\s+/)[0] || "there";

    // A guest has no session, so /orders/[id] can never show them anything —
    // they travel by order number, exactly as at checkout.
    const url = order.customer_id
      ? `${SITE_URL}/orders/${order.id}`
      : `${SITE_URL}/orders/track?ref=${encodeURIComponent(order.order_number)}`;

    const lines = [
      `Hi ${first} — your payment for ${eventName} is confirmed and your ${
        tickets === 1 ? "ticket is" : `${tickets} tickets are`
      } ready.`,
      when ? `When: ${when}` : null,
      venue ? `Where: ${venue}${address ? `, ${address}` : ""}` : null,
      `Open the link below to see your ${tickets === 1 ? "QR code" : "QR codes"} and show ${
        tickets === 1 ? "it" : "them"
      } at the entrance.${order.customer_id ? "" : " You'll be asked for the email address you booked with."}`,
      `Each ${tickets === 1 ? "code admits one person" : "code admits one person"}, once. A screenshot is fine — but if you send it on, whoever arrives second will be turned away.`,
    ].filter((l): l is string => l !== null);

    const res = await sendTransactionalEmail({
      type: "ticket_qr_delivery",
      to,
      subject: `Your ${tickets === 1 ? "ticket" : "tickets"} for ${eventName}`,
      html: html(
        tickets === 1 ? "Your ticket is ready" : "Your tickets are ready",
        lines,
        { url, label: tickets === 1 ? "View my ticket →" : "View my tickets →" },
      ),
      // Exactly once per order. An organiser who double-taps Confirm, or a
      // status moved back and forth, must not send a second copy — and Postgres
      // enforces that rather than this function remembering.
      idempotencyKey: resendToken
        ? `ticket_qr_delivery:${orderId}:resend:${resendToken}`
        : `ticket_qr_delivery:${orderId}`,
      relatedType: "order",
      relatedId: orderId,
    });
    return res.ok;
  } catch (err) {
    console.error(`notifyTicketsIssued failed for order ${orderId}`, err);
    return false;
  }
}
