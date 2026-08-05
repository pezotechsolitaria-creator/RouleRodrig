import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Platform administration of merchant subscriptions.
//
// AUTH NOTE: this project has two distinct admin identities. `/admin` uses a
// signed password cookie (lib/auth.ts) and has no Supabase user, so
// is_platform_admin() — which reads platform_admins by auth.uid() — can never
// be true for it. Every other app/api/admin/* route therefore gates on the
// cookie and then uses the service-role client. This route follows that same
// established pattern rather than inventing a second admin system.
//
// The security boundary is consequently verifySession() at this layer. That is
// why the whole module refuses to do anything before isAuthed() passes, and why
// the write handler whitelists its fields instead of forwarding a body.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

// getPrivileged() silently falls back to the ordinary cookie/anon client when
// SUPABASE_SERVICE_ROLE_KEY is unset. Since M6 revoked write access on the
// subscription tables from every client role, that fallback produces a
// confusing "permission denied" 500 rather than an honest "not configured".
// Reads can even half-succeed, which is worse. Fail loudly instead.
function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const patchSchema = z.object({
  merchantId: z.string().uuid(),
  action: z.enum(["suspend", "reactivate", "approve_renewal", "set_plan"]),
  plan: z.enum(["starter", "standard", "premium"]).optional(),
  // Renewal length in days; bounded so a slip can't grant a decade.
  periodDays: z.number().int().min(1).max(366).optional(),
  amount: z.number().int().min(0).max(100_000_00).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const supabase = await getPrivileged();

  let query = supabase
    .from("merchants")
    .select(
      "id, display_name, contact_email, status, created_at, " +
        "merchant_subscriptions(plan, status, current_period_end, grace_days, started_at), " +
        "stores(id, name, slug, status)",
    )
    .order("created_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("admin subscriptions list failed", error);
    return NextResponse.json({ error: "Failed to load merchants." }, { status: 500 });
  }

  return NextResponse.json({ merchants: data ?? [] });
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { merchantId, action, plan, periodDays, amount, note } = parsed.data;

  const supabase = await getPrivileged();
  const { data: existing } = await supabase
    .from("merchant_subscriptions")
    .select("merchant_id, plan, status, current_period_end")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (action === "suspend") {
    const { error } = await supabase
      .from("merchant_subscriptions")
      .upsert(
        { merchant_id: merchantId, status: "suspended", plan: existing?.plan ?? "starter",
          current_period_end: existing?.current_period_end ?? nowIso, note: note ?? null, updated_at: nowIso },
        { onConflict: "merchant_id" },
      );
    if (error) {
      console.error("suspend failed", error);
      return NextResponse.json({ error: "Could not suspend that merchant." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "suspended" });
  }

  if (action === "reactivate") {
    // Reactivating a merchant whose period has already lapsed would leave them
    // instantly expired again, so extend to at least today + the given window.
    const days = periodDays ?? 30;
    const end = new Date(Date.now() + days * 86_400_000).toISOString();
    const { error } = await supabase
      .from("merchant_subscriptions")
      .upsert(
        { merchant_id: merchantId, status: "active", plan: plan ?? existing?.plan ?? "starter",
          current_period_end: end, note: note ?? null, updated_at: nowIso },
        { onConflict: "merchant_id" },
      );
    if (error) {
      console.error("reactivate failed", error);
      return NextResponse.json({ error: "Could not reactivate that merchant." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "active", currentPeriodEnd: end });
  }

  if (action === "set_plan") {
    if (!plan) return NextResponse.json({ error: "A plan is required." }, { status: 400 });
    const { error } = await supabase
      .from("merchant_subscriptions")
      .upsert(
        { merchant_id: merchantId, plan, status: existing?.status ?? "active",
          current_period_end: existing?.current_period_end ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
          updated_at: nowIso },
        { onConflict: "merchant_id" },
      );
    if (error) {
      console.error("set_plan failed", error);
      return NextResponse.json({ error: "Could not change that plan." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, plan });
  }

  // approve_renewal — extend from whichever is later, the current period end or
  // now, so an early renewal adds time rather than throwing it away, and a late
  // one doesn't back-date into the past.
  const days = periodDays ?? 30;
  const base = existing?.current_period_end && new Date(existing.current_period_end).getTime() > Date.now()
    ? new Date(existing.current_period_end).getTime()
    : Date.now();
  const newEnd = new Date(base + days * 86_400_000).toISOString();
  const periodStart = existing?.current_period_end ?? nowIso;

  const { error } = await supabase
    .from("merchant_subscriptions")
    .upsert(
      { merchant_id: merchantId, status: "active", plan: plan ?? existing?.plan ?? "starter",
        current_period_end: newEnd, note: note ?? null, updated_at: nowIso },
      { onConflict: "merchant_id" },
    );
  if (error) {
    console.error("approve_renewal failed", error);
    return NextResponse.json({ error: "Could not approve that renewal." }, { status: 500 });
  }

  // Record it in billing history so the merchant can see what was renewed.
  await supabase.from("subscription_invoices").insert({
    merchant_id: merchantId,
    plan: plan ?? existing?.plan ?? "starter",
    amount: amount ?? 0,
    currency: "MUR",
    period_start: periodStart,
    period_end: newEnd,
    status: "paid",
    paid_at: nowIso,
    note: note ?? "Renewal approved by platform admin",
  });

  return NextResponse.json({ ok: true, currentPeriodEnd: newEnd });
}
