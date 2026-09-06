import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";

// Driver applications. apply_as_driver() is the authority: it can only ever
// produce `pending`, refuses a previously rejected or suspended applicant, and
// is idempotent so correcting a typo does not create a second record.
const BAD_INPUT = "RR089";
const BLOCKED = "RR090";
const NOT_SIGNED_IN = "RR080";

const schema = z.object({
  fullName: z.string().trim().min(1, "Please give your full name.").max(120),
  phone: z.string().trim().min(6, "Please give your number.").max(24),
  // Widened in M149. A pickup is not a van (an open bed protects nothing) and
  // a lorry is not a bigger van (it cannot reach half the tracks here, and
  // nobody wants their dinner delivered in one) -- so both are their own type,
  // and vehicle_can_handle() decides what reaches each of them.
  vehicleType: z.enum(["foot", "bicycle", "scooter", "car", "van", "pickup", "lorry"]),
  // What they are signing up to DO. Two booleans rather than one enum, because
  // the honest answer for most people here is both.
  canDeliver: z.boolean().default(true),
  canRunErrands: z.boolean().default(false),
  vehicleDetails: z.string().trim().max(160).optional(),
  licenceReference: z.string().trim().max(80).optional(),
  preferredHours: z.string().trim().max(160).optional(),
  experienceNote: z.string().trim().max(500).optional(),
  emergencyContact: z.string().trim().max(40).optional(),
  acceptTerms: z.literal(true, { message: "You must accept the driver terms." }),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "driver-apply", 5, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to apply." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  }
  const v = parsed.data;

  const { data, error } = await supabase.rpc("apply_as_driver", {
    p_full_name: v.fullName,
    p_phone: v.phone,
    p_vehicle_type: v.vehicleType,
    p_vehicle_details: v.vehicleDetails ?? null,
    p_licence_reference: v.licenceReference ?? null,
    p_service_zone_ids: [],
    p_preferred_hours: v.preferredHours ?? null,
    p_experience_note: v.experienceNote ?? null,
    p_emergency_contact: v.emergencyContact ?? null,
    p_accept_terms: true,
    p_can_deliver: v.canDeliver,
    p_can_run_errands: v.canRunErrands,
  });

  if (error) {
    if (error.code === BAD_INPUT) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === BLOCKED) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error.code === NOT_SIGNED_IN) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("apply_as_driver failed", error);
    return NextResponse.json({ error: "We couldn't send that. Please try again." }, { status: 500 });
  }

  // An application nobody sees is an application nobody approves — and a driver
  // waiting on silence gives up. Queued, so a messaging outage cannot lose it
  // or fail the applicant's submission.
  await enqueueNotification({
    type: "driver.applied",
    category: "deliveries",
    message: formatWhatsAppMessage({
      // The owner is the confirmation step, so the message has to say what
      // they would be confirming. "New application" alone made every applicant
      // look identical, and an errand runner on foot is a different decision
      // from a lorry driver.
      title: v.canRunErrands && !v.canDeliver
        ? "🧾 New errand runner application"
        : "🛵 New delivery driver application",
      lines: [
        `${v.fullName} — ${v.phone}`,
        `Wants: ${[v.canDeliver && "deliveries", v.canRunErrands && "errands"]
          .filter(Boolean)
          .join(" + ")}`,
        `Vehicle: ${v.vehicleType}${v.vehicleDetails ? ` (${v.vehicleDetails})` : ""}`,
      ],
      action: "Review it in Admin → Delivery drivers.",
    }),
    dedupeKey: `driver.applied:${(data as { driverId?: string })?.driverId ?? user.id}`,
  });

  return NextResponse.json(data);
}
