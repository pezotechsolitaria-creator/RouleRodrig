import "server-only";
import { sendTransactionalEmail } from "@/lib/email/send";
import { SITE_URL } from "@/lib/site";

// ── Telling someone an account is waiting for them ─────────────────────────
//
// This began as the door-staff invite. organizer_add_door_staff() created an
// `event_organizers` row with status='invited' and stopped. Nothing anywhere
// told the person. The organiser watched them appear in the staff list and
// reasonably assumed an invitation had gone out; the invitee got silence, never
// signed up, and on the night nobody could scan.
//
// The kitchen then reused it, and M108 reuses it again for merchants and
// delivery partners created by an admin. It is deliberately ONE email for all
// four, because the mechanism underneath is one mechanism: a row is written
// with an address on it, and the person CLAIMS it by signing in with that exact
// address. There is no password, no token in the link, and no secret to leak —
// the address is the whole credential path, which is why it gets its own
// bordered block rather than a sentence inside a paragraph people skim.
//
// ── WHY THIS IS NOT FOUR TEMPLATES ────────────────────────────────────────
// Four copies would drift, and the sentence that must never drift is the one
// about signing up with the exact address. Getting that wrong is the single way
// to end up locked out, and it is identical for a cook, a doorman, a shop owner
// and a driver.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Deliberately plain and inline-styled: email clients strip <style> blocks, and
 * this has to survive Gmail, Outlook and a Rodrigues phone on 3G.
 */
function render(opts: {
  heading: string;
  paragraphs: string[];
  highlight?: { label: string; value: string };
  cta: { url: string; label: string };
}): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(opts.heading)}</h1>
  ${opts.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${escapeHtml(p)}</p>`).join("")}
  ${
    opts.highlight
      ? `<div style="border:1px solid #e5e5e5;border-left:4px solid #F5C842;border-radius:8px;padding:14px 16px;margin:0 0 18px;background:#fafafa">
    <p style="font-size:12px;color:#777;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(opts.highlight.label)}</p>
    <p style="font-size:16px;font-weight:bold;margin:0;word-break:break-all">${escapeHtml(opts.highlight.value)}</p>
  </div>`
      : ""
  }
  <p style="margin:24px 0 0"><a href="${opts.cta.url}" style="background:#F5C842;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;display:inline-block">${escapeHtml(opts.cta.label)}</a></p>
  <p style="font-size:12px;color:#777;margin:28px 0 0">Roulé Rodrigues · roulerodrig.com</p>
</div>`;
}

export type InviteRole = "door" | "kitchen" | "merchant" | "driver" | "organizer";

/** Where the invitation lands them. An invite to the wrong screen teaches the
 *  person the thing does not work — the kitchen inherited /organizer once and
 *  cooks arrived at the events console with no kitchen in sight. */
const DESTINATION: Record<InviteRole, string> = {
  door: "/organizer",
  kitchen: "/kitchen",
  merchant: "/merchant",
  driver: "/driver",
  // The organiser's own console, not the door-scanner view. "door" is somebody
  // the organiser hands a phone to on the night; this is the person who owns
  // the event and sets the tickets.
  organizer: "/organizer",
};

function copyFor(role: InviteRole, name: string, context: string) {
  switch (role) {
    case "kitchen":
      return {
        subject: `You are on the kitchen team at ${context}`,
        heading: "You're on the kitchen team",
        paragraphs: [
          `Hi ${name} — you have been added to ${context} on Roulé Rodrigues.`,
          "You will see each order as it comes in and tap one button per step. There is nothing to install — it runs in your browser.",
        ],
        cta: "Create your account →",
      };
    case "organizer":
      return {
        subject: "Your events on Roulé Rodrigues are ready for you",
        heading: "Your events are ready for you",
        paragraphs: [
          `Hi ${name} — we have set up ${context} on Roulé Rodrigues so you do not have to fill in a sign-up form.`,
          "Create your account and the events become yours: you set the ticket types, the prices and when they go on sale, and you scan people in at the door.",
          "Nobody at Roulé Rodrigues has a password for your account, and nobody can create one. You choose it yourself on the next screen.",
        ],
        cta: "Set up your account →",
      };
    case "merchant":
      return {
        subject: "Your shop on Roulé Rodrigues is ready for you",
        heading: "Your shop is ready for you",
        paragraphs: [
          `Hi ${name} — we have set up ${context} on Roulé Rodrigues so you do not have to fill in a sign-up form.`,
          "Create your account and the shop becomes yours: you set your prices, your opening hours and what you sell, and only you can change them.",
          "Nobody at Roulé Rodrigues has a password for your account, and nobody can create one. You choose it yourself on the next screen.",
        ],
        cta: "Set up your account →",
      };
    case "driver":
      return {
        subject: "Your delivery account on Roulé Rodrigues is ready",
        heading: "You're set up to deliver",
        paragraphs: [
          `Hi ${name} — we have set up your delivery account on Roulé Rodrigues so you do not have to fill in a sign-up form.`,
          "Create your account and you will see delivery jobs on your phone, go online when you want to work, and go offline when you do not. There is nothing to install.",
          "Nobody at Roulé Rodrigues has a password for your account, and nobody can create one. You choose it yourself on the next screen.",
        ],
        cta: "Set up your account →",
      };
    default:
      return {
        subject: `You are on the door for ${context}`,
        heading: "You're on the door",
        paragraphs: [
          `Hi ${name} — you have been added to ${context} on Roulé Rodrigues as door staff.`,
          "On the night you will scan tickets at the entrance from your phone. There is nothing to install — it runs in your browser.",
        ],
        cta: "Create your account →",
      };
  }
}

/**
 * Send it. Returns whether the provider accepted it.
 *
 * Best effort by construction: the row is already committed before this runs,
 * so a mail provider having a bad minute must not turn the admin's click into
 * an error or undo the access it just granted. The screen is told `invited:
 * false` instead, and offers Resend — which is the honest outcome, and the
 * reason `canResendInvite()` exists in lib/admin/people.ts.
 */
export async function notifyInvited(input: {
  email: string;
  name: string;
  /** The event, kitchen or shop this is about. Ignored for drivers. */
  context: string | null;
  /** Idempotency scope: one invite per assignment/merchant/driver id. */
  assignmentId: string;
  role: InviteRole;
  /**
   * Bumped by the admin's Resend button so the idempotency key changes.
   * Without it the provider would swallow every resend as a duplicate, and the
   * button would appear to work while sending nothing.
   */
  attempt?: number;
}): Promise<boolean> {
  try {
    const to = input.email.trim().toLowerCase();
    if (!to) return false;

    const name = input.name?.trim() || "there";
    const context = input.context?.trim() || "Roulé Rodrigues";
    const { subject, heading, paragraphs, cta } = copyFor(input.role, name, context);
    const dest = DESTINATION[input.role];

    const body = render({
      heading,
      paragraphs: [
        ...paragraphs,
        "Create your account with the exact email address below. That address is how your access is matched, so signing up with a different one will leave you without it.",
      ],
      highlight: { label: "Sign up with this address", value: to },
      cta: { url: `${SITE_URL}/login?next=${dest}`, label: cta },
    });

    const res = await sendTransactionalEmail({
      // An invitation is the person's ONLY route to their own account, which
      // puts it in the same class as a password reset: it may be queued, but it
      // must never be dropped to protect a reserve. Volume is a handful ever.
      type: "account_invitation",
      to,
      subject,
      html: body,
      // One invite per assignment. A double-clicked Add button, or someone
      // removed and re-added, must not spam them — but an explicit Resend must
      // actually send, hence `attempt`.
      idempotencyKey: `invite:${input.role}:${input.assignmentId}${input.attempt ? `:${input.attempt}` : ""}`,
      relatedType: input.role === "door" || input.role === "kitchen" ? "event_organizer_assignment" : input.role,
      relatedId: input.assignmentId,
    });
    return res.ok;
  } catch (err) {
    console.error("notifyInvited failed", err);
    return false;
  }
}
