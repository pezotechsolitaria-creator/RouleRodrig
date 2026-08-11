import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Managed ticketing, from the platform's side: quote a fee, move the agreement
// along, record whether it has been paid.
//
// AUTH — the two-admin-identities rule (M25). /admin authenticates with a signed
// password cookie and has no Supabase user, so is_platform_admin() is never true
// for it; the cookie check below IS the security boundary, and the service-role
// client is how the write lands. The RPCs additionally refuse any caller that
// DOES have a session but is not a platform admin, so a signed-in organiser
// cannot reach them from either direction — and EXECUTE is revoked from
// `authenticated` besides, which the migration asserts.
//
// NO PRICING LIVES HERE. Fee type, amount, rate and the service description are
// all supplied per agreement by whoever is operating this screen. There is no
// default fee in this file, in the schema, or in the RPCs.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const feeSchema = z.object({
  action: z.literal("fee"),
  agreementId: z.string().uuid(),
  feeType: z.enum(["fixed", "percentage"]),
  // Minor units. Integer only — no float ever touches money in this codebase.
  amountCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  // Scaled by 1000, so 10% is 10000. Same convention as the marketplace
  // commission rate. Capped at 50% by the database as well as here.
  rateE5: z.number().int().min(0).max(50_000).nullable().optional(),
  includes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const statusSchema = z.object({
  action: z.literal("status"),
  agreementId: z.string().uuid(),
  status: z.enum(["approved", "active", "completed", "cancelled"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

const paymentSchema = z.object({
  action: z.literal("payment"),
  agreementId: z.string().uuid(),
  paymentStatus: z.enum(["unpaid", "invoiced", "paid", "waived"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

const bodySchema = z.discriminatedUnion("action", [feeSchema, statusSchema, paymentSchema]);

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "RR003") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (error.code === "RR004") return NextResponse.json({ error: error.message }, { status: 409 });
  if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_managed_ticketing_list");
  if (error) return rpcError(error, "Could not load managed ticketing.");
  return NextResponse.json({ agreements: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const p = parsed.data;
  const supabase = await getPrivileged();

  if (p.action === "fee") {
    // Shape is re-validated in the RPC and again by a CHECK constraint; this is
    // the friendliest of the three, not the authoritative one.
    if (p.feeType === "fixed" && (p.amountCents === null || p.amountCents === undefined)) {
      return NextResponse.json({ error: "A fixed fee needs an amount." }, { status: 400 });
    }
    if (p.feeType === "percentage" && (p.rateE5 === null || p.rateE5 === undefined)) {
      return NextResponse.json({ error: "A percentage fee needs a rate." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("admin_set_managed_ticketing_fee", {
      p_agreement_id: p.agreementId,
      p_fee_type: p.feeType,
      p_amount_cents: p.feeType === "fixed" ? p.amountCents ?? null : null,
      p_rate_e5: p.feeType === "percentage" ? p.rateE5 ?? null : null,
      p_includes: p.includes?.trim() || null,
    });
    if (error) return rpcError(error, "Could not save that fee.");
    return NextResponse.json(data);
  }

  if (p.action === "status") {
    const { data, error } = await supabase.rpc("admin_update_managed_ticketing_status", {
      p_agreement_id: p.agreementId,
      p_status: p.status,
      p_reason: p.reason?.trim() || null,
    });
    if (error) return rpcError(error, "Could not change that status.");
    return NextResponse.json(data);
  }

  const { data, error } = await supabase.rpc("admin_set_managed_ticketing_payment", {
    p_agreement_id: p.agreementId,
    p_payment_status: p.paymentStatus,
    p_note: p.note?.trim() || null,
  });
  if (error) return rpcError(error, "Could not record that payment.");
  return NextResponse.json(data);
}
