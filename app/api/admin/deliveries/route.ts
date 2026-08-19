import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { notifySweepResult } from "@/lib/delivery/notify";

// The delivery control centre's API. Read the board, or pull one of the two
// levers. Every write is an RPC that validates and audits — this route decides
// nothing, which is why an admin cannot fake a completion from here either.
const NOT_FOUND = "RR003";
const HAS_PACKAGE = "RR091";
const NOT_VIA_ADMIN = "RR092";

function guard(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("admin_delivery_board");
  if (error) {
    console.error("admin_delivery_board failed", error);
    return NextResponse.json({ error: "Could not load the board." }, { status: 500 });
  }
  return NextResponse.json(data);
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reassign"),
    deliveryId: z.string().uuid(),
    force: z.boolean().default(false),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("force_status"),
    deliveryId: z.string().uuid(),
    // `delivered` is absent by construction — the RPC refuses it too, so this
    // is defence in depth rather than the only guard.
    status: z.enum([
      "searching_driver", "cancelled", "failed_delivery",
      "returned_to_merchant", "requires_admin",
    ]),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("driver_status"),
    driverId: z.string().uuid(),
    status: z.enum(["approved", "rejected", "suspended", "inactive", "pending"]),
    reason: z.string().trim().max(300).optional(),
  }),
  // Manual sweep, for when an operator does not want to wait for the cron.
  z.object({ action: z.literal("sweep") }),
]);

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid action." }, { status: 400 });
  }
  const input = parsed.data;
  const admin = await getPrivileged();

  const call =
    input.action === "reassign"
      ? admin.rpc("admin_reassign_delivery", {
          p_delivery_id: input.deliveryId,
          p_force: input.force,
          p_note: input.note ?? null,
        })
      : input.action === "force_status"
        ? admin.rpc("admin_force_delivery_status", {
            p_delivery_id: input.deliveryId,
            p_status: input.status,
            p_note: input.note ?? null,
          })
        : input.action === "driver_status"
          ? admin.rpc("admin_set_driver_status", {
              p_driver_id: input.driverId,
              p_status: input.status,
              p_reason: input.reason ?? null,
            })
          : admin.rpc("sweep_delivery_escalations");

  const { data, error } = await call;

  if (error) {
    if (error.code === NOT_FOUND) return NextResponse.json({ error: "Not found." }, { status: 404 });
    // 409 with the real message: "this driver already has the package" is the
    // whole point of the refusal, and a generic error would hide it.
    if (error.code === HAS_PACKAGE) {
      return NextResponse.json({ error: error.message, needsForce: true }, { status: 409 });
    }
    if (error.code === NOT_VIA_ADMIN) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("delivery admin action failed", { action: input.action, error });
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  // The sweep's ids ARE the purpose of its return value: SQL cannot reach a
  // phone. The cron path notifies; this path silently did not, so an owner who
  // pressed the button himself got every write and none of the messages —
  // including the one telling a driver his job had just been taken off him.
  // The dedupe keys make a double-send from cron and button impossible.
  if (input.action === "sweep") await notifySweepResult(data);

  return NextResponse.json(data);
}
