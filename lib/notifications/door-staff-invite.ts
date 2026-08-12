import "server-only";
import { sendTransactionalEmail } from "@/lib/email/send";
import { SITE_URL } from "@/lib/site";

// ── Telling someone they've been given the door ────────────────────────────
//
// organizer_add_door_staff() created an `event_organizers` row with
// status='invited' and stopped. Nothing anywhere told the person. The organiser
// watched them appear in the staff list and reasonably assumed an invitation
// had gone out; the invitee got silence, never signed up, and on the night
// nobody could scan.
//
// Same defect the partner applications had: a row written, a promise implied,
// and no channel to the one person it concerns.
//
// The invite is CLAIMED BY EMAIL — claim_organizer_invite() matches on the
// address — so the only instruction that really matters is "sign up with this
// exact address". Getting it wrong is the single way to end up locked out,
// which is why it gets its own block rather than a sentence they can skim.

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
 *
 * `highlight` renders as its own bordered block rather than bold text inside a
 * paragraph — the address is the whole instruction, and bold inside a wall of
 * text is exactly what people skip.
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

export async function notifyDoorStaffInvited(input: {
  email: string;
  name: string;
  eventName: string | null;
  assignmentId: string;
  /**
   * Where the invitation lands them. Defaults to the event door.
   *
   * The kitchen route reused this email wholesale and inherited /organizer, so
   * a cook who clicked "Create your account" signed in and arrived at the
   * events console with no kitchen in sight. An invitation that lands on the
   * wrong screen is worse than none — it teaches the person the thing does not
   * work.
   */
  destination?: "/organizer" | "/kitchen";
  role?: "door" | "kitchen";
}): Promise<boolean> {
  try {
    const to = input.email.trim().toLowerCase();
    if (!to) return false;

    const event = input.eventName?.trim() || "an event";
    const name = input.name?.trim() || "there";

    const kitchen = input.role === "kitchen";
    const dest = input.destination ?? "/organizer";

    const body = render({
      heading: kitchen ? "You're on the kitchen team" : "You're on the door",
      paragraphs: [
        kitchen
          ? `Hi ${name} — you've been added to ${event} on Roulé Rodrigues.`
          : `Hi ${name} — you've been added to ${event} on Roulé Rodrigues as door staff.`,
        kitchen
          ? "You'll see each order as it comes in and tap one button per step. There's nothing to install — it runs in your browser."
          : "On the night you'll scan tickets at the entrance from your phone. There's nothing to install — it runs in your browser.",
        "Create your account with the exact email address below. That address is how your access is matched, so signing up with a different one will leave you without it.",
      ],
      highlight: { label: "Sign up with this address", value: to },
      cta: { url: `${SITE_URL}/login?next=${dest}`, label: "Create your account →" },
    });

    const res = await sendTransactionalEmail({
      type: "organizer_ticket_order_notification",
      to,
      subject: kitchen ? `You're on the kitchen team at ${event}` : `You're on the door for ${event}`,
      html: body,
      // One invite per assignment. A double-clicked Add button, or someone
      // removed and re-added, must not spam them.
      idempotencyKey: `door_staff_invite:${input.assignmentId}`,
      relatedType: "event_organizer_assignment",
      relatedId: input.assignmentId,
    });
    return res.ok;
  } catch (err) {
    // Best effort by construction: the assignment is already committed, so a
    // mail provider having a bad minute must not turn the organiser's click
    // into an error or undo the access they just granted.
    console.error("notifyDoorStaffInvited failed", err);
    return false;
  }
}
