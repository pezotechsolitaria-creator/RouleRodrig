import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refundCapture } from "@/lib/paypal";
import { SITE_URL } from "@/lib/site";
import { activeProvider, providerById } from "./providers";
import { coversRodrigues, displayNetworks } from "./networks";
import { margin } from "./pricing";
import { productsFor, planRowFor } from "./catalogue";
import { eurPerUsd } from "./fx";
import { curateDestination, type Candidate } from "./curate";
import { DESTINATIONS, HOME_CODE, WORLD_DESTINATIONS, destinationByCode } from "./destinations";
import { emailDelivered, loadOrder, orderUrl, provisionOrder, EsimError } from "./service";

// ── The owner's eSIM desk ────────────────────────────────────────────────────
// Every function takes the privileged client that guardAdminApi() handed the
// route, so nothing here can be reached without the admin cookie.

export type SyncReport = {
  seen: number;
  created: number;
  updated: number;
  retired: number;
  mauritiusCoveringRodrigues: number;
  mauritiusSkipped: string[];
  curated: Record<string, number>;
};

/**
 * Pulls the wholesaler's catalogue for EVERY destination into esim_plans,
 * then restocks each destination's shelf (except Mauritius, the owner's).
 *
 *   · NEW products arrive INACTIVE, priced by suggestRetailEurCents().
 *   · EXISTING products get today's cost and networks; their price moves only
 *     if the owner never typed one AND the old price would now lose money.
 *   · Products the wholesaler dropped become available = false.
 *   · Rodrigues coverage is recomputed every time.
 */
export async function syncCatalog(db: SupabaseClient): Promise<SyncReport> {
  const provider = activeProvider();
  if (!provider.configured()) throw new EsimError(503, `The eSIM supplier (${provider.id}) is not configured — set its keys in Vercel.`);
  const packages = await provider.listCatalogue(DESTINATIONS.map((d) => d.code));
  const rate = await eurPerUsd();

  const { data: existing, error } = await db
    .from("esim_plans")
    .select("id, provider_code, period_num, retail_eur_cents, retail_locked, available")
    .eq("provider", provider.id);
  if (error) throw error;
  const byKey = new Map((existing ?? []).map((p) => [`${p.provider_code}:${p.period_num ?? 0}`, p]));
  const seenKeys = new Set<string>();
  const report: SyncReport = { seen: packages.length, created: 0, updated: 0, retired: 0, mauritiusCoveringRodrigues: 0, mauritiusSkipped: [], curated: {} };
  const now = new Date().toISOString();

  for (const pkg of packages) {
    if (pkg.countryCodes.includes(HOME_CODE)) {
      if (coversRodrigues(pkg.mauritiusNetworks)) report.mauritiusCoveringRodrigues++;
      else report.mauritiusSkipped.push(`${pkg.code} (${pkg.mauritiusNetworks.map((n) => n.name).join(", ") || "no network listed"})`);
    }
    for (const prod of productsFor(pkg)) {
      const key = `${prod.code}:${prod.period ?? 0}`;
      seenKeys.add(key);
      const { suggested_retail_eur_cents, ...row } = planRowFor(prod, rate);
      const common = { ...row, available: true, synced_at: now, provider_payload: pkg.raw as object };
      const found = byKey.get(key);
      if (!found) {
        const { error: e } = await db.from("esim_plans").insert({
          provider: provider.id,
          retail_eur_cents: suggested_retail_eur_cents,
          active: false,
          sort_order: 500 + Math.round(pkg.dataMb / 100),
          ...common,
        });
        if (e) throw e;
        report.created++;
      } else {
        const patch: Record<string, unknown> = { ...common };
        // The region a row was first filed under is kept: it is history, and
        // the shelves are listings now.
        delete patch.region;
        if (!found.retail_locked && margin(found.retail_eur_cents, row.wholesale_usd_micros, rate).netEurCents < 100) {
          patch.retail_eur_cents = suggested_retail_eur_cents;
        }
        const { error: e } = await db.from("esim_plans").update(patch).eq("id", found.id);
        if (e) throw e;
        report.updated++;
      }
    }
  }

  for (const [key, row] of byKey) {
    if (!seenKeys.has(key) && row.available) {
      await db.from("esim_plans").update({ available: false, synced_at: now }).eq("id", row.id);
      report.retired++;
    }
  }

  report.curated = await curateAll(db);
  return report;
}

// ── Automatic shelves ────────────────────────────────────────────────────────

const CANDIDATE_COLS = "id, data_mb, per_day, validity_days, country_codes, retail_eur_cents, wholesale_usd_micros, available, hidden";

/**
 * Restocks every destination the owner has not curated by hand. A destination
 * with ANY owner-made listing is his, and is left exactly as he set it —
 * "reset to automatic" (curateOne with reset) hands it back.
 */
export async function curateAll(db: SupabaseClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const d of WORLD_DESTINATIONS) out[d.code] = await curateOne(db, d.code, { reset: false });
  return out;
}

export async function curateOne(db: SupabaseClient, code: string, opts: { reset: boolean }): Promise<number> {
  if (code === HOME_CODE) throw new EsimError(409, "Mauritius & Rodrigues is curated by hand — its plans must cover Rodrigues.");
  if (!destinationByCode(code)) throw new EsimError(404, "Unknown destination.");

  if (opts.reset) {
    await db.from("esim_listings").delete().eq("country_code", code);
  } else {
    const { data: manual } = await db.from("esim_listings").select("plan_id").eq("country_code", code).eq("auto", false).limit(1);
    if (manual && manual.length) return -1; // the owner's shelf
  }

  const { data: plans, error } = await db
    .from("esim_plans")
    .select(CANDIDATE_COLS)
    .contains("country_codes", [code])
    .eq("available", true)
    .eq("hidden", false);
  if (error) throw error;
  const picks = curateDestination(code, (plans ?? []) as Candidate[], await eurPerUsd());

  await db.from("esim_listings").delete().eq("country_code", code).eq("auto", true);
  if (picks.length) {
    const { error: le } = await db
      .from("esim_listings")
      .insert(picks.map((p) => ({ country_code: code, plan_id: p.planId, badge: p.badge, sort_order: p.sort, auto: true })));
    if (le) throw le;
    const { error: ae } = await db.from("esim_plans").update({ active: true }).in("id", picks.map((p) => p.planId));
    if (ae) throw ae;
  }
  return picks.length;
}

/** The owner puts a plan on (or takes it off) one destination's shelf. */
export async function setListing(
  db: SupabaseClient,
  input: { country: string; planId: string; listed: boolean; badge?: string | null; sort?: number },
) {
  const code = input.country.toUpperCase();
  if (!destinationByCode(code)) throw new EsimError(404, "Unknown destination.");
  if (!input.listed) {
    // Removing one plan makes the shelf the owner's: the rest stay, as his.
    await db.from("esim_listings").update({ auto: false }).eq("country_code", code);
    await db.from("esim_listings").delete().eq("country_code", code).eq("plan_id", input.planId);
    return;
  }
  const { data: plan } = await db
    .from("esim_plans")
    .select("id, covers_rodrigues, available, country_codes, retail_eur_cents, wholesale_usd_micros")
    .eq("id", input.planId)
    .maybeSingle();
  if (!plan) throw new EsimError(404, "Plan not found.");
  if (!plan.available) throw new EsimError(409, "The supplier no longer offers this plan.");
  if (!(plan.country_codes as string[]).includes(code)) throw new EsimError(409, "This plan does not work in that country.");
  if (code === HOME_CODE && !plan.covers_rodrigues) {
    throw new EsimError(409, "This plan does not roam onto my.t or Emtel, so it has no signal on Rodrigues. It cannot be listed for Mauritius.");
  }
  const m = margin(plan.retail_eur_cents, Number(plan.wholesale_usd_micros), await eurPerUsd());
  if (m.netEurCents < 100) throw new EsimError(409, `At its price the plan nets ${(m.netEurCents / 100).toFixed(2)} € after the supplier and PayPal. Raise the price first.`);

  await db.from("esim_listings").update({ auto: false }).eq("country_code", code);
  const { error } = await db.from("esim_listings").upsert(
    { country_code: code, plan_id: input.planId, badge: input.badge ?? null, sort_order: input.sort ?? 100, auto: false },
    { onConflict: "country_code,plan_id" },
  );
  if (error) throw error;
  await db.from("esim_plans").update({ active: true, hidden: false }).eq("id", input.planId);
}

// ── The desk ─────────────────────────────────────────────────────────────────

export type DeskPlan = Record<string, unknown> & {
  id: string;
  retail_eur_cents: number;
  wholesale_usd_micros: number;
  margin: ReturnType<typeof margin>;
  networkLabels: string[];
};

const PLAN_COLS =
  "id, name, provider_code, data_mb, per_day, period_num, validity_days, covers_rodrigues, available, active, hidden, badge, sort_order, retail_eur_cents, retail_locked, wholesale_usd_micros, country_codes, networks, networks_by_country";

export async function readDesk(db: SupabaseClient, country = HOME_CODE) {
  const rate = await eurPerUsd();
  const code = (destinationByCode(country) ?? destinationByCode(HOME_CODE)!).code;
  const [{ data: listings, error: le }, { data: candidates, error: ce }, { data: orders, error: oe }, { data: counts }] = await Promise.all([
    db.from("esim_listings").select("plan_id, badge, sort_order, auto").eq("country_code", code),
    db.from("esim_plans").select(PLAN_COLS).contains("country_codes", [code]).order("retail_eur_cents").limit(400),
    db
      .from("esim_orders")
      .select(
        "id, ref, email, language, destination, status, retail_eur_cents, paid_eur_cents, wholesale_usd_micros, provider, provider_order_no, iccid, esim_status, used_bytes, total_bytes, expires_at, provision_attempts, last_error, email_sent_at, created_at, paid_at, delivered_at, refunded_at, plan_snapshot, source",
      )
      .neq("status", "pending_payment")
      .order("created_at", { ascending: false })
      .limit(300),
    db.rpc("public_esim_destinations"),
  ]);
  if (le) throw le;
  if (ce) throw ce;
  if (oe) throw oe;

  const provider = activeProvider();
  let balanceUsdMicros: number | null = null;
  let balanceError: string | null = null;
  if (provider.configured()) {
    try {
      balanceUsdMicros = await provider.balanceUsdMicros();
    } catch (e) {
      balanceError = (e as Error).message;
    }
  }

  const listed = new Map((listings ?? []).map((l) => [l.plan_id as string, l]));
  const plans: DeskPlan[] = (candidates ?? []).map((p) => ({
    ...p,
    listing: listed.get(p.id as string) ?? null,
    margin: margin(p.retail_eur_cents as number, Number(p.wholesale_usd_micros), rate),
    networkLabels:
      code === HOME_CODE
        ? displayNetworks(p.networks as { name: string }[])
        : (((p.networks_by_country as Record<string, { name: string; type?: string | null }[]>) ?? {})[code] ?? []).map(
            (n) => (n.type ? `${n.name} ${n.type}` : n.name),
          ),
  })) as DeskPlan[];

  const delivered = (orders ?? []).filter((o) => o.status === "delivered");
  const revenue = delivered.reduce((s, o) => s + (o.paid_eur_cents ?? o.retail_eur_cents), 0);
  const net = delivered.reduce((s, o) => s + margin(o.paid_eur_cents ?? o.retail_eur_cents, Number(o.wholesale_usd_micros ?? 0), rate).netEurCents, 0);
  const live = new Map(((counts ?? []) as { country_code: string; plans: number; from_eur_cents: number }[]).map((c) => [c.country_code, c]));

  return {
    provider: { id: provider.id, configured: provider.configured(), balanceUsdMicros, balanceError },
    webhookUrl: `${SITE_URL}/api/esim/webhook/${provider.id}`,
    eurPerUsd: rate,
    country: code,
    destinations: DESTINATIONS.map((d) => ({ code: d.code, name: d.en, flag: d.flag, live: live.get(d.code)?.plans ?? 0 })),
    shelfIsManual: (listings ?? []).some((l) => !l.auto),
    plans,
    orders: orders ?? [],
    totals: {
      delivered: delivered.length,
      revenueEurCents: revenue,
      netEurCents: net,
      needsAction: (orders ?? []).filter((o) => o.status === "failed" || (o.status === "paid" && o.last_error)).length,
    },
  };
}

export async function updatePlan(
  db: SupabaseClient,
  id: string,
  patch: { retail_eur_cents?: number; active?: boolean; badge?: string | null; sort_order?: number },
) {
  const clean: Record<string, unknown> = {};
  if (typeof patch.retail_eur_cents === "number") {
    if (!Number.isInteger(patch.retail_eur_cents) || patch.retail_eur_cents < 100 || patch.retail_eur_cents > 50_000) {
      throw new EsimError(400, "Price must be between €1.00 and €500.00.");
    }
    clean.retail_eur_cents = patch.retail_eur_cents;
    clean.retail_locked = true;
  }
  if (typeof patch.active === "boolean") {
    clean.active = patch.active;
    // Off by the owner's hand stays off: the curator skips hidden plans.
    clean.hidden = !patch.active;
  }
  if (patch.badge !== undefined) clean.badge = patch.badge || null;
  if (typeof patch.sort_order === "number") clean.sort_order = Math.round(patch.sort_order);
  if (clean.active === true || typeof clean.retail_eur_cents === "number") {
    const { data: plan } = await db.from("esim_plans").select("available, active, retail_eur_cents, wholesale_usd_micros").eq("id", id).maybeSingle();
    if (!plan) throw new EsimError(404, "Plan not found.");
    if (clean.active === true && !plan.available) throw new EsimError(409, "The supplier no longer offers this plan.");
    const willSell = clean.active === true || (clean.active === undefined && plan.active);
    const price = (clean.retail_eur_cents as number | undefined) ?? plan.retail_eur_cents;
    const m = margin(price, Number(plan.wholesale_usd_micros), await eurPerUsd());
    if (willSell && m.netEurCents < 100) {
      throw new EsimError(409, `At this price the plan nets ${(m.netEurCents / 100).toFixed(2)} € after the supplier and PayPal. Raise the price first.`);
    }
  }
  const { error } = await db.from("esim_plans").update(clean).eq("id", id);
  if (error) throw error;
}

export async function retryOrder(id: string) {
  const o = await provisionOrder(id, { waitMs: 15_000, retryFailed: true });
  return { status: o.status, lastError: o.last_error };
}

export async function resendEmail(id: string) {
  const o = await loadOrder(id);
  if (!o) throw new EsimError(404, "Order not found.");
  if (o.status !== "delivered") throw new EsimError(409, "Only a delivered eSIM can be re-sent.");
  return { sent: await emailDelivered(o) };
}

export async function customerLink(id: string) {
  const o = await loadOrder(id);
  if (!o) throw new EsimError(404, "Order not found.");
  return { url: orderUrl(o) };
}

/**
 * Refunds the customer in full, and — if the eSIM was never installed —
 * cancels the profile so the wholesaler refunds OUR balance too. An installed
 * profile cannot be cancelled; that refund is then the platform's cost.
 */
export async function refundOrder(db: SupabaseClient, id: string) {
  const o = await loadOrder(id);
  if (!o) throw new EsimError(404, "Order not found.");
  if (o.status === "refunded") return { refunded: true, profileCancelled: null as boolean | null };
  if (!o.paypal_capture_id) throw new EsimError(409, "There is no captured payment on this order to refund.");

  let profileCancelled: boolean | null = null;
  const provider = providerById(o.provider);
  if (o.provider_profile_id && provider?.configured()) {
    try {
      await provider.cancelProfile(o.provider_profile_id);
      profileCancelled = true;
    } catch (e) {
      console.error("[esim] cancel profile", e);
      profileCancelled = false;
    }
  }
  await refundCapture(o.paypal_capture_id, `Refund for eSIM order ${o.ref} — Roulé Rodrigues`);
  await db.from("esim_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", o.id);
  return { refunded: true, profileCancelled };
}

export async function registerWebhook() {
  const provider = activeProvider();
  if (!provider.configured() || !provider.setWebhook) throw new EsimError(409, "This supplier has no webhook API.");
  const url = `${SITE_URL}/api/esim/webhook/${provider.id}`;
  await provider.setWebhook(url);
  return { url };
}
