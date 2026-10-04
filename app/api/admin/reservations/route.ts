import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { DESK_FILTERS, type DeskFilter } from "@/lib/reservations/admin-actions";
import { listDesk, readReservation, readSettings, saveMethod, savePolicy } from "@/lib/reservations/admin";
import { PAYMENT_METHOD_IDS, PRODUCT_TYPES } from "@/lib/reservations/policy";
import { adminAction } from "@/lib/reservations/server";

// The Reservation Center (/admin/reservations).
//
//   GET  ?filter=new&q=…   the desk: counts per filter + the rows
//   GET  ?id=<uuid>        one reservation: row, audit trail, questions,
//                          payments recorded, messages queued
//   GET  ?settings=1       payment methods + policies
//   POST { action: "act", id, op, payload }   a state change, via the
//        reservation_admin RPC — the database decides whether it is legal
//   POST { action: "method" | "policy", … }   settings
//
// Confirm holds the date. It does not take payment.

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "The Reservation Center");
  if (gate instanceof NextResponse) return gate;
  const sp = new URL(req.url).searchParams;
  try {
    const id = sp.get("id");
    if (id) {
      if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
      const detail = await readReservation(gate.admin, id);
      if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });
      return NextResponse.json(detail, { headers: NO_STORE });
    }
    if (sp.get("settings")) return NextResponse.json(await readSettings(gate.admin), { headers: NO_STORE });
    const f = sp.get("filter") ?? "new";
    const filter: DeskFilter = (DESK_FILTERS as readonly string[]).includes(f) ? (f as DeskFilter) : "new";
    return NextResponse.json(await listDesk(gate.admin, filter, (sp.get("q") ?? "").slice(0, 80)), { headers: NO_STORE });
  } catch (e) {
    return failed(e, "Failed to load reservations");
  }
}

const i18n = z.object({ en: z.string().max(600), fr: z.string().max(600).optional(), cr: z.string().max(600).optional() });

const policy = z.object({
  mode: z.enum(["full", "deposit_percent", "deposit_fixed", "pay_at_pickup", "none"]),
  deposit_percent: z.number().int().min(1).max(100).nullable().optional(),
  deposit_fixed_mur: z.number().int().min(1).max(1_000_000).nullable().optional(),
  allowed_methods: z.array(z.enum(PAYMENT_METHOD_IDS)).max(5),
  deadline_hours: z.number().int().min(1).max(24 * 14),
  hold_capacity_on: z.literal("confirm").default("confirm"),
});

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("act"),
    id: z.string().uuid(),
    op: z.enum(["review", "confirm", "request_info", "decline", "cancel", "mark_paid", "allow_cash", "ready", "start", "complete", "note"]),
    payload: z
      .object({
        amount_mur: z.number().int().min(0).max(10_000_000).optional(),
        deposit_due_mur: z.number().int().min(0).max(10_000_000).optional(),
        deadline_hours: z.number().int().min(1).max(24 * 14).optional(),
        fields: z.array(z.string().regex(/^[a-z_]{2,30}$/)).max(8).optional(),
        note: z.string().max(2000).optional(),
        reason: z.string().max(500).optional(),
        method: z.enum(PAYMENT_METHOD_IDS).optional(),
        external_ref: z.string().max(120).optional(),
        received_at: z.string().datetime({ offset: true }).optional(),
      })
      .strict()
      .default({}),
  }),
  z.object({
    action: z.literal("method"),
    id: z.enum(PAYMENT_METHOD_IDS),
    enabled: z.boolean().optional(),
    label_i18n: i18n.optional(),
    instructions_i18n: i18n.optional(),
    sort: z.number().int().min(0).max(1000).optional(),
  }),
  z.object({
    action: z.literal("policy"),
    scope_type: z.enum(["product_type", "product"]),
    scope_id: z.string().trim().min(1).max(120),
    policy: policy.nullable(),
  }),
]);

const ERRORS: Record<string, string> = {
  illegal: "That move isn't allowed from this status.",
  illegal_payment: "That payment change isn't allowed from this payment status.",
  conflict: "Not enough places left on that date/time. Decline, or offer another slot.",
  not_found: "Reservation not found.",
  reason_required: "Write a short reason — the guest sees it.",
  fields_required: "Choose what you need from the guest.",
  amount_required: "Enter the amount received.",
  method: "Choose how it was paid.",
  not_confirmed: "Payments are recorded on confirmed reservations only.",
};

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "The Reservation Center");
  if (gate instanceof NextResponse) return gate;
  const raw = await readJson(req);
  if (raw instanceof NextResponse) return raw;
  const parsed = body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  const b = parsed.data;
  try {
    if (b.action === "act") {
      const res = await adminAction(b.id, b.op, { ...b.payload, actor: "admin", actor_label: "Roulé" });
      if (!res.ok) {
        const code = String(res.error ?? "failed");
        return NextResponse.json({ ...res, error: ERRORS[code] ?? code, code }, { status: code === "not_found" ? 404 : 409 });
      }
      return NextResponse.json(res);
    }
    if (b.action === "method") {
      const { action: _a, id, ...patch } = b;
      void _a;
      await saveMethod(gate.admin, id, patch as Parameters<typeof saveMethod>[2]);
      return NextResponse.json({ ok: true });
    }
    // policy
    if (b.scope_type === "product_type" && !(PRODUCT_TYPES as readonly string[]).includes(b.scope_id)) {
      return NextResponse.json({ error: "Unknown product type." }, { status: 400 });
    }
    if (b.policy?.mode === "deposit_percent" && !b.policy.deposit_percent) {
      return NextResponse.json({ error: "Set the deposit percentage." }, { status: 400 });
    }
    if (b.policy?.mode === "deposit_fixed" && !b.policy.deposit_fixed_mur) {
      return NextResponse.json({ error: "Set the deposit amount." }, { status: 400 });
    }
    await savePolicy(gate.admin, b.scope_type, b.scope_id, b.policy);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 400) return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    return failed(e, "The action failed");
  }
}
