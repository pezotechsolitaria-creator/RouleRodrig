import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { canResendInvite, normalizePhone, type PersonKind } from "@/lib/admin/people";

// ── Creating an account FOR somebody ────────────────────────────────────────
//
// Plenty of the people who sell and deliver on this island will not fill in a
// sign-up form. So an admin sits with them, types their details once, and the
// platform emails them a way in. Self-service onboarding is untouched and
// remains the default — this is the assisted path beside it.
//
// ── THE LINE THIS ROUTE MUST NOT CROSS ─────────────────────────────────────
// The admin creates the ACCOUNT. The person owns it. Nobody here generates,
// sees, transmits or stores a password — there is no password until the person
// chooses one on Supabase's own sign-up screen. What the admin creates is a row
// with an email address on it; signing in with that exact address is what turns
// it into theirs (claim_merchant_invite / claim_driver_invite).
//
// That is not a design this route invented. It is the mechanism the event door
// and the kitchen have used since M43 and M50 — admin_invite_organizer +
// claim_organizer_invite, admin_add_kitchen_staff + claim_kitchen_invites — and
// the ONLY reason merchants and drivers could not use it was that
// merchants.owner_id and delivery_drivers.user_id were NOT NULL, so the row
// could not exist before the person did. M108 made them nullable behind a
// CHECK that still demands one or the other.
//
// Consequently there is no new authentication system here, no token to leak and
// nothing secret in the audit trail: the only thing recorded is who was invited
// and at what address.

const FEATURE = "Admin-assisted onboarding";

const MERCHANT = z.object({
  kind: z.literal("merchant"),
  email: z.string().trim().toLowerCase().email().max(254),
  businessName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  category: z.string().trim().max(60).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(600).optional().default(""),
});

const DRIVER = z.object({
  kind: z.literal("driver"),
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  vehicleType: z.string().trim().min(1).max(40),
  vehicleDetails: z.string().trim().max(200).optional().default(""),
});

const CREATE = z.discriminatedUnion("kind", [MERCHANT, DRIVER]);

/** Create the account and send the invitation. */
export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, FEATURE);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const parsed = CREATE.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // ── PHONE, BEFORE POSTGRES SEES IT ───────────────────────────────────────
  // delivery_drivers.phone is CHECKed against E.164. An admin typing a local
  // number the way it is written here — "5835 5588" — would otherwise get a
  // raw 23514 constraint violation, which is useless to somebody sitting next
  // to the driver. M108's live assertion hit this exact wall.
  let phone = "";
  if (input.kind === "driver") {
    const e164 = normalizePhone(input.phone);
    if (!e164) {
      return NextResponse.json(
        { error: "That phone number does not look right. Local numbers are fine — 5835 5588 — or use +230…" },
        { status: 400 },
      );
    }
    phone = e164;
  } else if (input.phone) {
    // Optional for a merchant, so an unparseable one is kept as typed rather
    // than rejected: merchants.contact_phone has no CHECK, and refusing to
    // create a shop over a phone number would be the wrong trade.
    phone = normalizePhone(input.phone) ?? input.phone;
  }

  try {
    const rpc =
      input.kind === "merchant"
        ? await admin.rpc("admin_invite_merchant", {
            p_email: input.email,
            p_business_name: input.businessName,
            p_owner_name: input.ownerName || null,
            p_phone: phone || null,
            p_category: input.category || null,
            p_address: input.address || null,
            p_description: input.description || null,
          })
        : await admin.rpc("admin_invite_driver", {
            p_email: input.email,
            p_full_name: input.fullName,
            p_phone: phone,
            p_vehicle_type: input.vehicleType,
            p_vehicle_details: input.vehicleDetails || null,
          });

    if (rpc.error) {
      // RR005 is the function's own "you typed something impossible" code.
      if (rpc.error.code === "RR005") {
        return NextResponse.json({ error: rpc.error.message }, { status: 400 });
      }
      throw rpc.error;
    }

    const result = (rpc.data ?? {}) as {
      merchantId?: string;
      driverId?: string;
      storeId?: string;
      created?: boolean;
      claimed?: boolean;
      status?: string;
    };
    const id = result.merchantId ?? result.driverId ?? "";

    // Inviting the same person twice is a mistake an admin WILL make — usually
    // because the first invitation went to spam and they assume it failed. The
    // function returns the existing row rather than creating a second one, and
    // the honest answer here is "they are already here", with the id so the UI
    // can offer to open them and resend.
    if (!result.created) {
      return NextResponse.json(
        {
          error: result.claimed
            ? "Somebody with that email address already has an account here."
            : "That address has already been invited. Open them to resend the invitation.",
          duplicate: true,
          id,
          claimed: !!result.claimed,
        },
        { status: 409 },
      );
    }

    const name = input.kind === "merchant" ? input.businessName : input.fullName;
    const invited = await sendInvite(input.kind, {
      id,
      email: input.email,
      name: input.kind === "merchant" ? input.ownerName || input.businessName : input.fullName,
      context: input.kind === "merchant" ? input.businessName : null,
    });

    // The RPC writes its own `*.invited` audit row inside the transaction, the
    // way admin_invite_organizer does. This second line records what the RPC
    // cannot know: whether the person was actually TOLD. An invitation nobody
    // received is the failure mode this whole feature exists to prevent, and it
    // has to be visible in the trail rather than inferred from its absence.
    await audit(admin, {
      action: `people.invite_sent`,
      entityType: input.kind,
      entityId: id,
      diff: { email: input.email, name, delivered: invited },
    });

    return NextResponse.json({
      success: true,
      id,
      storeId: result.storeId ?? null,
      invited,
      email: input.email,
    });
  } catch (err) {
    return failed(err, "That account could not be created.");
  }
}

/** Send the invitation again. Same link, same address, nothing else changes. */
export async function PATCH(req: NextRequest) {
  const gate = await guardAdminApi(req, FEATURE);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const parsed = z
    .object({ kind: z.enum(["merchant", "driver"]), id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { kind, id } = parsed.data;

  try {
    const table = kind === "merchant" ? "merchants" : "delivery_drivers";
    const owner = kind === "merchant" ? "owner_id" : "user_id";
    const nameCol = kind === "merchant" ? "display_name" : "full_name";
    const { data: row, error } = await admin
      .from(table)
      .select(`id, ${owner}, ${nameCol}, invite_email, invited_at`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: "That record no longer exists." }, { status: 404 });

    const r = row as Record<string, unknown>;
    // ── THE COOLDOWN IS ENFORCED HERE, NOT IN THE BUTTON ────────────────────
    // A disabled button is not a rate limit. The same rule the screen uses to
    // grey out Resend is re-run on the server, so a repeated request — from an
    // impatient double-click or from curl — is refused rather than mailing
    // somebody five times.
    const verdict = canResendInvite({
      claimed: !!r[owner],
      inviteEmail: (r.invite_email as string) ?? null,
      invitedAt: (r.invited_at as string) ?? null,
    });
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.reason, waitMs: verdict.waitMs ?? 0 }, { status: 429 });
    }

    const email = String(r.invite_email);
    const name = String(r[nameCol] ?? "");
    const sentAt = new Date().toISOString();

    // Stamp BEFORE sending: if the mail provider is slow and the operator
    // clicks again, the cooldown above is already in force. A resend that is
    // recorded but not delivered is recoverable; one delivered five times is
    // not.
    const { error: stampErr } = await admin.from(table).update({ invited_at: sentAt }).eq("id", id);
    if (stampErr) throw stampErr;

    const invited = await sendInvite(kind, {
      id,
      email,
      name,
      context: kind === "merchant" ? name : null,
      // Without this the provider's idempotency key is unchanged and it would
      // swallow the resend as a duplicate — the button would look like it
      // worked while sending nothing at all.
      attempt: Date.parse(sentAt),
    });

    await audit(admin, {
      action: "people.invite_resent",
      entityType: kind,
      entityId: id,
      diff: { email, delivered: invited },
    });

    return NextResponse.json({ success: true, invited });
  } catch (err) {
    return failed(err, "That invitation could not be sent again.");
  }
}

/**
 * One way to send it, shared by create and resend so the two cannot drift into
 * sending different emails or landing people on different screens.
 */
async function sendInvite(
  kind: PersonKind,
  input: { id: string; email: string; name: string; context: string | null; attempt?: number },
): Promise<boolean> {
  try {
    const { notifyInvited } = await import("@/lib/notifications/invite");
    return await notifyInvited({
      email: input.email,
      name: input.name,
      context: input.context,
      assignmentId: input.id,
      role: kind,
      attempt: input.attempt,
    });
  } catch (err) {
    // Never fail the creation over the email. The account exists, the desk is
    // told `invited: false`, and Resend is right there.
    console.error("invite email failed", err);
    return false;
  }
}
