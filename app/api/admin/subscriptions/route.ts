import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { deleteVerdict, confirmationMatches } from "@/lib/admin/merchant-delete";
import { audit } from "@/lib/admin/audit";

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
  action: z.enum([
    "approve_merchant", "reject_merchant",
    "suspend", "reactivate", "approve_renewal", "set_plan",
    // Cancel is distinct from suspend: suspend is a platform sanction that can
    // be lifted; cancel is the merchant leaving, and is stamped with a date.
    "cancel", "start_trial", "end_trial",
  ]),
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

  // Plan prices travel with the list so the renewal control can pre-fill the
  // amount and warn when a plan is still unpriced — which is why every invoice
  // used to read Rs 0.00.
  const { data: settings } = await supabase
    .from("marketplace_settings")
    .select("plan_prices")
    .eq("id", "main")
    .maybeSingle();

  return NextResponse.json({
    merchants: data ?? [],
    planPrices: settings?.plan_prices ?? { starter: 0, standard: 0, premium: 0 },
  });
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

  // Merchant approval. onboard_merchant() creates every shop as 'pending', and
  // store_is_visible() requires 'approved' — but until M7 nothing anywhere
  // could write merchants.status, so a self-onboarded shop stayed invisible to
  // customers forever. No column grant exists for it either, which is correct:
  // only the service-role client behind this cookie-gated route may set it.
  if (action === "approve_merchant" || action === "reject_merchant") {
    const newStatus = action === "approve_merchant" ? "approved" : "rejected";
    const { error } = await supabase
      .from("merchants")
      .update({ status: newStatus })
      .eq("id", merchantId);
    if (error) {
      console.error(`${action} failed`, error);
      return NextResponse.json({ error: "Could not update that merchant." }, { status: 500 });
    }

    // A newly approved shop needs a subscription window, or it would be
    // approved and still blocked by merchant_subscription_active().
    if (newStatus === "approved" && !existing) {
      const days = periodDays ?? 30;
      await supabase.from("merchant_subscriptions").upsert(
        {
          merchant_id: merchantId,
          status: "trialing",
          plan: plan ?? "starter",
          current_period_end: new Date(Date.now() + days * 86_400_000).toISOString(),
          note: note ?? "Trial opened on approval",
          updated_at: nowIso,
        },
        { onConflict: "merchant_id" },
      );
    }
    return NextResponse.json({ ok: true, status: newStatus });
  }

  // Cancel — the merchant is leaving. cancelled_at is stamped so the merchant
  // page can say WHEN, rather than showing the generic "expired" copy.
  if (action === "cancel") {
    const { error } = await supabase
      .from("merchant_subscriptions")
      .upsert(
        { merchant_id: merchantId, status: "cancelled", plan: existing?.plan ?? "starter",
          current_period_end: existing?.current_period_end ?? nowIso,
          cancelled_at: nowIso, note: note ?? null, updated_at: nowIso },
        { onConflict: "merchant_id" },
      );
    if (error) {
      console.error("cancel failed", error);
      return NextResponse.json({ error: "Could not cancel that subscription." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  // Trial start / end. merchant_subscription_active() already treats 'trialing'
  // as selling, so these only move the status and the window — no new rules.
  if (action === "start_trial") {
    const days = periodDays ?? 30;
    const { error } = await supabase
      .from("merchant_subscriptions")
      .upsert(
        { merchant_id: merchantId, status: "trialing", plan: plan ?? existing?.plan ?? "starter",
          current_period_end: new Date(Date.now() + days * 86_400_000).toISOString(),
          cancelled_at: null, note: note ?? "Trial started by platform admin", updated_at: nowIso },
        { onConflict: "merchant_id" },
      );
    if (error) {
      console.error("start_trial failed", error);
      return NextResponse.json({ error: "Could not start that trial." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "trialing" });
  }

  // Ending a trial converts to active without extending the window — the
  // merchant keeps whatever time was left and is now billable.
  if (action === "end_trial") {
    const { error } = await supabase
      .from("merchant_subscriptions")
      .upsert(
        { merchant_id: merchantId, status: "active", plan: plan ?? existing?.plan ?? "starter",
          current_period_end: existing?.current_period_end ?? nowIso,
          note: note ?? "Trial ended by platform admin", updated_at: nowIso },
        { onConflict: "merchant_id" },
      );
    if (error) {
      console.error("end_trial failed", error);
      return NextResponse.json({ error: "Could not end that trial." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "active" });
  }

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
  //
  // The amount used to default to 0 with nothing to fall back to, so every
  // renewal invoice read "Rs 0.00" for a subscription the merchant had actually
  // paid for. It now falls back to the configured price for that plan; an
  // explicit `amount` still wins, for the case where a merchant paid something
  // different (pro-rata, a discount, a partial payment).
  const renewedPlan = plan ?? existing?.plan ?? "starter";
  const { data: priceSettings } = await supabase
    .from("marketplace_settings")
    .select("plan_prices")
    .eq("id", "main")
    .maybeSingle();
  const planPrice = Number(
    (priceSettings?.plan_prices as Record<string, number> | null)?.[renewedPlan] ?? 0,
  );

  await supabase.from("subscription_invoices").insert({
    merchant_id: merchantId,
    plan: renewedPlan,
    amount: amount ?? planPrice,
    currency: "MUR",
    period_start: periodStart,
    period_end: newEnd,
    status: "paid",
    paid_at: nowIso,
    note: note ?? "Renewal approved by platform admin",
  });

  return NextResponse.json({ ok: true, currentPeriodEnd: newEnd });
}

// ── Clearing a merchant ─────────────────────────────────────────────────────
//
// GET ?merchantId=…&preview=1 → what deleting would do, and whether it can.
// DELETE ?merchantId=…&confirm=<name> → does it.
//
// Why this is not just `.delete()`: three foreign keys onto `stores` are ON
// DELETE RESTRICT (orders, deliveries, event_organizer_assignments), so a raw
// delete on a merchant that ever traded fails with a Postgres error the
// operator cannot act on. See lib/admin/merchant-delete.ts for the rule; this
// route measures the footprint and enforces the verdict.

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const url = new URL(req.url);
  const merchantId = url.searchParams.get("merchantId") ?? "";
  const confirm = url.searchParams.get("confirm") ?? "";
  const archiveOnly = url.searchParams.get("mode") === "archive";
  if (!/^[0-9a-f-]{36}$/i.test(merchantId)) {
    return NextResponse.json({ error: "Invalid merchant id." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, display_name, stores(id, name)")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchant) return NextResponse.json({ error: "Merchant not found." }, { status: 404 });

  const name = String((merchant as { display_name?: string }).display_name ?? "");
  const storeIds = (((merchant as { stores?: { id: string }[] }).stores) ?? []).map((s) => s.id);

  // ARCHIVE: the answer for a merchant that has traded. Shops go 'closed' (out
  // of every public listing) and the merchant goes 'suspended'; not one row of
  // financial history is touched.
  if (archiveOnly) {
    if (storeIds.length) {
      const { error } = await supabase.from("stores").update({ status: "closed" }).in("id", storeIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { error: mErr } = await supabase.from("merchants").update({ status: "suspended" }).eq("id", merchantId);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    await audit(supabase, {
      action: "merchant.archive",
      entityType: "merchant",
      entityId: merchantId,
      diff: { name, stores: storeIds.length },
    });
    return NextResponse.json({ ok: true, archived: true });
  }

  if (!confirmationMatches(confirm, name)) {
    return NextResponse.json(
      { error: `Type the merchant's name exactly ("${name}") to confirm deletion.` },
      { status: 400 },
    );
  }

  const footprint = await merchantFootprint(supabase, merchantId, storeIds);
  const verdict = deleteVerdict(footprint);
  if (!verdict.canDelete) {
    // 409, not 500: nothing failed. The platform is refusing on purpose, and
    // the body tells the UI to offer Archive instead.
    return NextResponse.json({ error: verdict.message, blockers: verdict.blockers, suggestion: "archive" }, { status: 409 });
  }

  // The cascade does the rest: stores, products, variants, hours, coupons,
  // reviews, events, tickets, kitchens, staff, subscriptions, invoices.
  const { error } = await supabase.from("merchants").delete().eq("id", merchantId);
  if (error) {
    console.error("merchant delete failed", error);
    return NextResponse.json({ error: "Could not delete that merchant. Nothing was changed." }, { status: 500 });
  }

  await audit(supabase, {
    action: "merchant.delete",
    entityType: "merchant",
    entityId: merchantId,
    diff: { name, stores: storeIds.length },
  });
  return NextResponse.json({ ok: true, deleted: true });
}

/** Count everything that would either block the delete or be destroyed by it. */
async function merchantFootprint(
  supabase: Awaited<ReturnType<typeof getPrivileged>>,
  merchantId: string,
  storeIds: string[],
) {
  const head = { count: "exact" as const, head: true };
  // A merchant with no stores cannot have store-scoped rows; skipping the
  // queries also avoids `.in("store_id", [])`, which PostgREST treats as a
  // match-nothing filter but which is clearer not to send at all.
  const [orders, deliveries, assignments, invoices] = await Promise.all([
    storeIds.length
      ? supabase.from("orders").select("id", head).in("store_id", storeIds)
      : Promise.resolve({ count: 0 }),
    storeIds.length
      ? supabase.from("deliveries").select("id", head).in("store_id", storeIds)
      : Promise.resolve({ count: 0 }),
    storeIds.length
      ? supabase.from("event_organizer_assignments").select("id", head).in("store_id", storeIds)
      : Promise.resolve({ count: 0 }),
    supabase.from("subscription_invoices").select("id", head).eq("merchant_id", merchantId).eq("status", "paid"),
  ]);

  return {
    orders: orders.count ?? 0,
    deliveries: deliveries.count ?? 0,
    organizerAssignments: assignments.count ?? 0,
    paidInvoices: invoices.count ?? 0,
  };
}
