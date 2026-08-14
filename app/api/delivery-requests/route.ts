import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";

// POST /api/delivery-requests — post a Deliver Anything job.
//
// A thin, Zod-validated pass-through, exactly like /api/checkout. Every rule
// that matters lives in create_delivery_request(): identity comes from the
// session when there is one, the budget shape is enforced there, and so is the
// open-request cap. Nothing here is trusted to decide any of it.
const SAFE_RPC_ERROR = "P0001";

const schema = z
  .object({
    kind: z.enum(["package", "shop_and_deliver"]),
    what: z.string().trim().min(3, "Say what needs moving.").max(500),
    pickupText: z.string().trim().min(2, "Where should we collect it?").max(200),
    pickupNote: z.string().trim().max(300).optional(),
    dropoffText: z.string().trim().min(2, "Where should we deliver it?").max(200),
    dropoffNote: z.string().trim().max(300).optional(),
    sizeClass: z.enum(["standard", "large"]).default("standard"),
    // Minor units, like every other amount in this system. Bounded by int4,
    // which is what the column is.
    maxBudget: z.number().int().min(0).max(2_147_483_647).optional(),
    contactName: z.string().trim().min(2, "Tell us your name.").max(120),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{6,15}$/, "Enter a phone number with its country code, e.g. +230…"),
    guestEmail: z.string().trim().email().max(200).optional(),
    pickupLat: z.number().min(-90).max(90).optional(),
    pickupLng: z.number().min(-180).max(180).optional(),
    dropoffLat: z.number().min(-90).max(90).optional(),
    dropoffLng: z.number().min(-180).max(180).optional(),
  })
  // Mirrored from the table CHECK and the RPC. Caught here first only so the
  // customer gets the message beside the field rather than as a failed request.
  .refine((v) => v.kind !== "shop_and_deliver" || (v.maxBudget ?? 0) > 0, {
    message: "Set the most we may spend on the item.",
    path: ["maxBudget"],
  });

export async function POST(req: NextRequest) {
  // Same shape as checkout's guard. Posting a request costs drivers attention,
  // so the cap is tighter than a read.
  const limited = await guardShared(req, "delivery-request", 5, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isGuest = !user;

  if (isGuest && !v.guestEmail) {
    return NextResponse.json(
      { error: "Enter your email so we can send you the quotes." },
      { status: 400 },
    );
  }
  if (isGuest && !hasServiceRole()) {
    // The RPC is not granted to `anon`, so a guest structurally cannot reach it
    // without the key. Fail loudly rather than silently demanding a login.
    console.error("delivery-requests: SUPABASE_SERVICE_ROLE_KEY missing — guest posting unavailable");
    return NextResponse.json(
      { error: "This is temporarily unavailable. Please sign in and try again." },
      { status: 503 },
    );
  }

  // Signed in → the customer's OWN session, so auth.uid() is set inside the RPC
  // and the request is filed against their account. Guest → service role, the
  // same split checkout uses.
  const client = isGuest ? await getPrivileged() : supabase;

  const { data, error } = await client.rpc("create_delivery_request", {
    p_kind: v.kind,
    p_what: v.what,
    p_pickup_text: v.pickupText,
    p_dropoff_text: v.dropoffText,
    p_contact_name: v.contactName,
    p_contact_phone: v.contactPhone,
    p_size_class: v.sizeClass,
    p_max_budget: v.maxBudget ?? null,
    p_pickup_note: v.pickupNote ?? null,
    p_dropoff_note: v.dropoffNote ?? null,
    p_pickup_lat: v.pickupLat ?? null,
    p_pickup_lng: v.pickupLng ?? null,
    p_dropoff_lat: v.dropoffLat ?? null,
    p_dropoff_lng: v.dropoffLng ?? null,
    // Ignored by the RPC whenever auth.uid() is set.
    p_guest_email: isGuest ? v.guestEmail : null,
  });

  if (error) {
    // The RPC's refusals are written for a person to read — the budget shape,
    // the open-request cap — so they are passed straight through rather than
    // flattened into "something went wrong".
    if (error.code === SAFE_RPC_ERROR) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("create_delivery_request failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ id: data as string }, { status: 201 });
}
