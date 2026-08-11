import "server-only";
import { sendTransactionalEmail } from "@/lib/email/send";
import { SITE_URL } from "@/lib/site";

// ── Telling an applicant what was decided ───────────────────────────────────
//
// /list-your-scooter promises "we'll be in touch". Approving an application in
// /admin updated `owner_applications.status` and stopped there, so the promise
// was kept only if the owner happened to phone the person themselves. This is
// the same defect the order lifecycle had before M4/M17 — a status change with
// no channel to the one person it concerns — and it got worse with M47, which
// added three categories (taxi driver, event organiser, delivery partner) whose
// applicants CANNOT create anything themselves and therefore have no other way
// to find out.
//
// dispatchNotification() is deliberately not reused: its NotificationEvent is
// order-shaped (it requires an orderNumber and a merchant/customer recipient),
// and bending an order abstraction around a partner application would make both
// harder to read. This sends directly through the M41 router instead.

export type ApplicationDecision = "approved" | "rejected";

/** Categories whose approval means WE still have to create something (M47). */
const ADMIN_CREATED: Record<string, string> = {
  taxi: "We'll add you to the Taxi page and call you to confirm your details before you go live.",
  event: "We'll create your organiser account and send the invite to this email address — watch for it.",
  delivery: "We'll be in touch to set up your delivery partner account and walk you through how orders reach you.",
};

/** Human noun per listing type, so the copy never says "your vehicle" to a chef. */
const NOUN: Record<string, string> = {
  vehicle: "vehicle", restaurant: "restaurant", stay: "stay",
  activity: "activity", experience: "experience",
  taxi: "taxi service", event: "events", delivery: "delivery application",
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function html(heading: string, paragraphs: string[], cta?: { url: string; label: string }) {
  // Deliberately plain and inline-styled. Email clients strip <style> blocks and
  // this message has to survive Gmail, Outlook and a Rodrigues phone on 3G.
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
  ${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${escapeHtml(p)}</p>`).join("")}
  ${cta ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="background:#F5C842;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;display:inline-block">${escapeHtml(cta.label)}</a></p>` : ""}
  <p style="font-size:12px;color:#777;margin:28px 0 0">Roulé Rodrigues · roulerodrig.com</p>
</div>`;
}

/**
 * Emails an applicant the decision. Never throws — an admin's click must not
 * fail because a mail provider did, exactly like every other send in this
 * codebase.
 *
 * Returns false when there is nothing to send to: email is optional on the
 * application form (phone is the required channel), so a decision on a
 * phone-only application legitimately sends nothing.
 */
export async function notifyApplicationDecision(app: {
  id: string;
  owner_name: string | null;
  email: string | null;
  listing_type: string | null;
  business_name: string | null;
}, decision: ApplicationDecision): Promise<boolean> {
  try {
    const to = (app.email ?? "").trim();
    if (!to) return false;

    const type = app.listing_type ?? "vehicle";
    const noun = NOUN[type] ?? "listing";
    const name = (app.owner_name ?? "").trim().split(/\s+/)[0] || "there";
    const what = (app.business_name ?? "").trim();

    const subject =
      decision === "approved"
        ? `Your Roulé Rodrigues application was approved`
        : `About your Roulé Rodrigues application`;

    const body =
      decision === "approved"
        ? html(
            "You're approved",
            [
              `Hi ${name} — good news. Your application${what ? ` for ${what}` : ""} to list your ${noun} on Roulé Rodrigues has been approved.`,
              // The M47 categories cannot self-serve, so the honest next step is
              // "we will do it", not "log in and finish setup".
              ADMIN_CREATED[type] ??
                "We'll be in touch shortly to finish setting up your listing and get it live.",
              "If anything has changed since you applied, just reply to this email or send us a WhatsApp.",
            ],
            { url: `${SITE_URL}/list-your-scooter`, label: "Roulé Rodrigues →" },
          )
        : html(
            "About your application",
            [
              `Hi ${name} — thank you for applying to list your ${noun} on Roulé Rodrigues.`,
              // No invented reason. The owner decides case by case and the real
              // explanation belongs in a conversation, not in a template that
              // guesses.
              "We're not able to take this one forward at the moment. That isn't a judgement on your business — we're a small island platform and we can only take on what we can support properly.",
              "If your situation changes, or if you think we've misunderstood something, please do get in touch. We're happy to look again.",
            ],
          );

    const res = await sendTransactionalEmail({
      type: "partner_application_decision",
      to,
      subject,
      html: body,
      // One decision email per application per outcome. A double-clicked
      // Approve button, or a status set back and forth, must not re-send.
      idempotencyKey: `partner_application_decision:${app.id}:${decision}`,
      relatedType: "owner_application",
      relatedId: app.id,
    });
    return res.ok;
  } catch (err) {
    console.error(`notifyApplicationDecision failed for application ${app.id}`, err);
    return false;
  }
}
