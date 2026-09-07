import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdminApi, readJson } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { PERSON_KINDS, type PersonKind } from "@/lib/admin/people";

// ── FILLING IN WHAT A CLIENT LEFT BLANK ─────────────────────────────────────
//
// The desk could already SAY a profile was incomplete and name the missing
// fields. It could not do anything about it — so an admin sat looking at
// "Phone number" in red with no way to type the number the person had just read
// out to them on WhatsApp, which on this island is how most of these details
// actually arrive.
//
// Only the fields missingProfileFields() names are writable here, and only the
// ones actually sent. This is not a general-purpose editor for somebody else's
// account: it fills gaps, and every write is recorded with what was typed.
//
// WHAT IT DELIBERATELY CANNOT TOUCH: status, verification, approval, bank
// details, or anything a person must assert about themselves. An admin typing
// in a phone number they were told is help. An admin marking somebody verified
// from the same box is a different power, and it has its own action with its
// own audit entry and its own required reason.

const FEATURE = "people";

const Body = z.object({
  kind: z.string(),
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
  fields: z
    .object({
      phone: z.string().trim().max(40).optional(),
      email: z.string().trim().email().max(254).optional(),
      segment: z.string().trim().max(120).optional(),
    })
    .refine((f) => Object.values(f).some((v) => v && v.length > 0), {
      message: "Nothing was filled in.",
    }),
});

/**
 * Where each kind's contact details actually live.
 *
 * A record rather than a switch, so a fifth kind fails the build here instead
 * of silently writing nothing and reporting success. The nulls are load-bearing
 * and each one is a real fact about the schema, not an omission.
 */
const TARGET: Record<
  PersonKind,
  { table: string; key: string; phone: string | null; email: string | null; segment: string | null }
> = {
  merchant: {
    table: "merchants",
    key: "id",
    phone: "contact_phone",
    email: "contact_email",
    // A merchant's category lives on the STORE's category_hint, not on the
    // merchant, and which store is not a question this endpoint can answer.
    segment: null,
  },
  driver: {
    table: "delivery_drivers",
    key: "id",
    phone: "phone",
    // A driver's address exists only while the invitation is outstanding;
    // afterwards it lives on auth.users and is theirs, not ours.
    email: null,
    segment: "vehicle_type",
  },
  kitchen: {
    table: "stores",
    key: "id",
    phone: "phone",
    email: null,
    // The collection point is food_kitchens.pickup_hint, written separately.
    segment: null,
  },
  service: {
    table: "stores",
    key: "id",
    phone: "phone",
    email: null,
    // The trade itself is trade_providers.trade, written separately.
    segment: null,
  },
  taxi: {
    table: "taxi_drivers",
    key: "id",
    phone: "phone",
    // taxi_drivers has no email column. A taxi driver is reached on their
    // phone or by their driver_token link, never by email.
    email: null,
    segment: "vehicle_type",
  },
  organizer: {
    table: "event_organizers",
    key: "id",
    phone: "contact_phone",
    // invite_email only, and re-sending an invitation is its own action.
    email: null,
    segment: null,
  },
};

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, FEATURE);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const raw = await readJson(req);
  if (raw instanceof NextResponse) return raw;

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { id, fields, reason } = parsed.data;

  if (!PERSON_KINDS.includes(parsed.data.kind as PersonKind)) {
    return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  }
  const kind = parsed.data.kind as PersonKind;
  const target = TARGET[kind];

  const patch: Record<string, string> = {};
  if (fields.phone && target.phone) patch[target.phone] = fields.phone;
  if (fields.email && target.email) patch[target.email] = fields.email;
  if (fields.segment && target.segment) patch[target.segment] = fields.segment;

  // A kitchen's collection point is on food_kitchens, not on the store row, so
  // it is written separately rather than silently dropped.
  const pickupHint = kind === "kitchen" && fields.segment ? fields.segment.trim() : null;
  // Same shape for a trade: the store row carries the phone, the extension row
  // carries what they actually do.
  const trade = kind === "service" && fields.segment ? fields.segment.trim() : null;

  if (Object.keys(patch).length === 0 && !pickupHint && !trade) {
    return NextResponse.json(
      { error: "None of those fields can be set for this kind of person." },
      { status: 400 },
    );
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from(target.table).update(patch).eq(target.key, id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (pickupHint) {
    const { error } = await admin
      .from("food_kitchens")
      .update({ pickup_hint: pickupHint })
      .eq("store_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (trade) {
    const { error } = await admin
      .from("trade_providers")
      .update({ trade })
      .eq("store_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await audit(admin, {
    action: "people.complete_profile",
    entityType: kind,
    entityId: id,
    // The VALUES are recorded, not merely that something changed: the point of
    // the trail is answering "who typed this number, and when".
    diff: {
      filled: {
        ...patch,
        ...(pickupHint ? { pickup_hint: pickupHint } : {}),
        ...(trade ? { trade } : {}),
      },
      reason: reason ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    filled: Object.keys(patch).length + (pickupHint ? 1 : 0) + (trade ? 1 : 0),
  });
}
