import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardFoodAdmin, readJson, failed } from "@/lib/food/guard";
import { normalizePickupCode } from "@/lib/orders/pickup";

// The food counter's handoff.
//
// Two steps on purpose, exactly as M30 designed for merchants: PREVIEW is
// read-only and shows who this is and what is in the bag; REDEEM commits. The
// person handing food across a counter should be able to check a code without
// having already spent it — and a single-use token that is spent by looking at
// it is a token that gets spent by accident.
//
// Both go through the M54 admin RPCs, which refuse any order that is not a
// kitchen order. The food operator can never close a merchant shop's sale from
// here, even with a hand-crafted request.

const NOT_AUTHORIZED = "RR020";
const NOT_FOUND_CODE = "RR021";
const EXPIRED_CODE = "RR022";
const WRONG_STATUS_CODE = "RR023";
const BURNED_CODE = "RR024";

const schema = z.object({
  code: z
    .string()
    .trim()
    .max(32)
    .transform(normalizePickupCode)
    .refine((c) => c.length === 8, "Enter the full 8-character code."),
  // Absent or false = preview. Committing is an explicit act.
  redeem: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid code." }, { status: 400 });
  }

  const fn = parsed.data.redeem ? "admin_redeem_pickup_code" : "admin_preview_pickup_code";
  const { data, error } = await admin.rpc(fn, { p_code: parsed.data.code });

  if (error) {
    // The RPC's messages are written for the person at the counter, so they are
    // passed through rather than replaced with something generic.
    if (error.code === NOT_AUTHORIZED) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === EXPIRED_CODE) return NextResponse.json({ error: error.message }, { status: 410 });
    if (error.code === WRONG_STATUS_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === BURNED_CODE) return NextResponse.json({ error: error.message }, { status: 429 });
    return failed(error, "Could not check that code.");
  }

  return NextResponse.json(data);
}
