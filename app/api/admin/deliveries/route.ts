import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { notifySweepResult } from "@/lib/delivery/notify";

// The delivery control centre's API. Read the board, or pull one of the two
// levers. Every write is an RPC that validates and audits — this route decides
// nothing, which is why an admin cannot fake a completion from here either.
const NOT_FOUND = "RR003";
// The RPCs raise this with a sentence written for the operator to act on —
// "a driver must be able to do at least one kind of work" is the whole answer,
// and flattening it to "Something went wrong" would leave a dead toggle.
const BAD_INPUT = "RR089";
const HAS_PACKAGE = "RR091";
const NOT_VIA_ADMIN = "RR092";
// Checked before the RPC so a malformed id is a 400 the operator can read,
// not a 500 from Postgres failing to cast it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // ── One driver's last 30 days ──────────────────────────────────────────
  // On demand, never in the board payload. The control centre re-reads itself
  // every 15 seconds, and a month of finished work per driver does not change
  // on that cadence — shipping it with the board would multiply every poll by
  // the size of the roster to render something nobody has opened.
  //
  // Same numbers the DRIVER sees: admin_driver_log and driver_delivery_log both
  // call delivery_log_for, so when somebody queries their pay the two screens
  // meant to settle it cannot disagree.
  const url = new URL(req.url);
  const driverLog = url.searchParams.get("driverLog");
  if (driverLog) {
    if (!UUID.test(driverLog)) {
      return NextResponse.json({ error: "Invalid driver." }, { status: 400 });
    }
    const rawDays = Number(url.searchParams.get("days") ?? "30");
    const days = Number.isFinite(rawDays)
      ? Math.min(Math.max(Math.trunc(rawDays), 1), 90)
      : 30;
    const { data: log, error: logError } = await admin.rpc("admin_driver_log", {
      p_driver_id: driverLog,
      p_days: days,
    });
    if (logError) {
      if (logError.code === NOT_FOUND) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      console.error("admin_driver_log failed", logError);
      return NextResponse.json({ error: "Could not load that history." }, { status: 500 });
    }
    return NextResponse.json(log ?? { days, rows: [], totals: null });
  }

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
  // Which KINDS of work this person may take. Separate from driver_status,
  // deliberately: turning errands off is not a punishment and must not read as
  // one — somebody can be excellent with parcels and not somebody you want
  // handling a customer's cash.
  z.object({
    action: z.literal("driver_roles"),
    driverId: z.string().uuid(),
    canDeliver: z.boolean(),
    canRunErrands: z.boolean(),
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
          : input.action === "driver_roles"
            ? admin.rpc("admin_set_driver_roles", {
                p_driver_id: input.driverId,
                p_can_deliver: input.canDeliver,
                p_can_run_errands: input.canRunErrands,
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
    if (error.code === BAD_INPUT) return NextResponse.json({ error: error.message }, { status: 400 });
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
