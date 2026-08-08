import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { MONETIZATION_MODELS, MAX_COMMISSION_RATE } from "@/lib/marketplace/fees";

// Platform monetization: how Roulé Rodrigues earns from the marketplace.
//
// AUTH NOTE — the same two-admin-identities situation documented in
// app/api/admin/delivery-zones: `/admin` authenticates with a signed password
// cookie and has no Supabase user, so is_platform_admin() can never be true for
// it. The cookie check below IS the security boundary; the service-role client
// is how the write lands. The RPCs additionally refuse any caller that DOES
// have a session but is not in platform_admins (M25), so a signed-in merchant
// cannot reach them either way.
//
// Nothing here computes money. The route validates shape and hands the decision
// to admin_set_monetization(), which is the only thing that may change it and
// which writes an audit_logs row with the before/after on every call.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const settingsSchema = z.object({
  model: z.enum(MONETIZATION_MODELS as [string, ...string[]]),
  // A RATE, not a percentage: 0.10 means 10%. The UI converts, the wire carries
  // the same units the database stores, so there is no place for a factor-of-100
  // mistake to hide between them.
  defaultCommissionRate: z
    .number()
    .min(0, "Commission cannot be negative.")
    .max(MAX_COMMISSION_RATE, "Commission cannot exceed 50%."),
});

const planSchema = z.object({
  slug: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  // Minor units, like every other amount in this system. Ceiling guards a
  // slipped decimal turning Rs 599 into Rs 59,900.
  priceCents: z.number().int().min(0).max(10_000_000),
  commissionRate: z.number().min(0).max(MAX_COMMISSION_RATE).nullable().optional(),
  maxProducts: z.number().int().min(1).max(100_000).nullable().optional(),
  maxStaff: z.number().int().min(1).max(1000).nullable().optional(),
  allowsSelling: z.boolean(),
  isActive: z.boolean(),
});

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const supabase = await getPrivileged();
  const [{ data: settings, error }, { data: plans }, { data: overview }] = await Promise.all([
    supabase
      .from("marketplace_settings")
      .select("monetization_model, default_commission_rate")
      .eq("id", "main")
      .maybeSingle(),
    supabase.from("subscription_plans").select("*").order("sort_order"),
    // One aggregated round trip rather than walking order history in Node —
    // this is the query that would otherwise become an N+1 as orders grow.
    supabase.rpc("admin_financial_overview"),
  ]);

  if (error) {
    console.error("admin monetization load failed", error);
    return NextResponse.json({ error: "Failed to load monetization settings." }, { status: 500 });
  }

  return NextResponse.json({
    model: settings?.monetization_model ?? "subscription",
    defaultCommissionRate: Number(settings?.default_commission_rate ?? 0),
    plans: plans ?? [],
    overview: overview ?? null,
  });
}

export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_set_monetization", {
    p_model: parsed.data.model,
    p_default_rate: parsed.data.defaultCommissionRate,
    // The audit row otherwise records only "somebody holding the service key".
    p_actor_note: "admin_dashboard",
  });

  if (error) {
    if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === "RR003") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    console.error("admin_set_monetization failed", error);
    return NextResponse.json({ error: "Could not save the monetization settings." }, { status: 500 });
  }
  return NextResponse.json(data);
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
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const p = parsed.data;

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_set_subscription_plan", {
    p_slug: p.slug,
    p_name: p.name,
    p_description: p.description?.trim() || null,
    p_price_cents: p.priceCents,
    p_commission_rate: p.commissionRate ?? null,
    p_max_products: p.maxProducts ?? null,
    p_max_staff: p.maxStaff ?? null,
    p_allows_selling: p.allowsSelling,
    p_is_active: p.isActive,
    p_actor_note: "admin_dashboard",
  });

  if (error) {
    if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === "RR003") return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    console.error("admin_set_subscription_plan failed", error);
    return NextResponse.json({ error: "Could not save that plan." }, { status: 500 });
  }
  return NextResponse.json(data);
}
