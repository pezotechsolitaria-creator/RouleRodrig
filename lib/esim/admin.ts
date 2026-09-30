import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refundCapture } from "@/lib/paypal";
import { SITE_URL } from "@/lib/site";
import { activeProvider, providerById, type ProviderPackage } from "./providers";
import { coversRodrigues, displayNetworks } from "./networks";
import { suggestRetailEurCents, margin } from "./pricing";
import { eurPerUsd } from "./fx";
import { emailDelivered, loadOrder, orderUrl, provisionOrder, EsimError } from "./service";

// ── The owner's eSIM desk ────────────────────────────────────────────────────
// Every function takes the privileged client that guardAdminApi() handed the
// route, so nothing here can be reached without the admin cookie.

/** Day-pass lengths offered as products. A trip to Rodrigues is rarely
 *  shorter than 3 nights — there are only a few flights a day — and rarely
 *  longer than a fortnight. */
export const DAY_PASS_PERIODS = [3, 5, 7, 10, 14] as const;

type Product = {
  code: string;
  period: number | null;
  pkg: ProviderPackage;
};

function productsFor(pkg: ProviderPackage): Product[] {
  if (!pkg.perDay) return [{ code: pkg.code, period: null, pkg }];
  return DAY_PASS_PERIODS.map((n) => ({ code: pkg.code, period: n, pkg }));
}

export type SyncReport = {
  seen: number;
  created: number;
  updated: number;
  retired: number;
  coveringRodrigues: number;
  skippedNoCoverage: string[];
};

/**
 * Pulls the wholesaler's Mauritius catalogue into esim_plans.
 *
 *   · NEW products arrive INACTIVE, priced by suggestRetailEurCents() — the
 *     owner decides what the shop sells; a sync never publishes anything.
 *   · EXISTING products get today's wholesale cost and networks. Their retail
 *     price moves only if the owner never set one (retail_locked = false) AND
 *     the old price is no longer sellable.
 *   · Products the wholesaler stopped offering become available = false.
 *   · Coverage is recomputed every time: a package that drops my.t and Emtel
 *     disappears from the shop on the next sync, whatever else it has.
 */
export async function syncCatalog(db: SupabaseClient): Promise<SyncReport> {
  const provider = activeProvider();
  if (!provider.configured()) throw new EsimError(503, `The eSIM supplier (${provider.id}) is not configured — set its keys in Vercel.`);
  const packages = await provider.listPackages("MU");
  const rate = await eurPerUsd();

  const { data: existing, error } = await db.from("esim_plans").select("*").eq("provider", provider.id);
  if (error) throw error;
  const byKey = new Map((existing ?? []).map((p) => [`${p.provider_code}:${p.period_num ?? 0}`, p]));
  const seenKeys = new Set<string>();
  const report: SyncReport = { seen: packages.length, created: 0, updated: 0, retired: 0, coveringRodrigues: 0, skippedNoCoverage: [] };
  const now = new Date().toISOString();

  for (const pkg of packages) {
    const covers = coversRodrigues(pkg.mauritiusNetworks);
    if (covers) report.coveringRodrigues++;
    else report.skippedNoCoverage.push(`${pkg.code} (${pkg.mauritiusNetworks.map((n) => n.name).join(", ") || "no network listed"})`);

    for (const prod of productsFor(pkg)) {
      const key = `${prod.code}:${prod.period ?? 0}`;
      seenKeys.add(key);
      const units = prod.period ?? 1;
      const wholesale = pkg.wholesaleUsdMicros * units;
      const validity = prod.period ?? pkg.durationDays;
      const common = {
        provider_slug: pkg.code,
        country_codes: pkg.countryCodes.length ? pkg.countryCodes : ["MU"],
        data_mb: pkg.dataMb,
        per_day: pkg.perDay,
        period_num: prod.period,
        validity_days: Math.min(366, validity),
        networks: pkg.mauritiusNetworks,
        covers_rodrigues: covers,
        topup_supported: pkg.topupSupported,
        fup_policy: pkg.fupPolicy,
        ip_export: pkg.ipExport,
        wholesale_usd_micros: wholesale,
        available: true,
        synced_at: now,
        provider_payload: pkg.raw as object,
      };
      const row = byKey.get(key);
      if (!row) {
        const { error: e } = await db.from("esim_plans").insert({
          provider: provider.id,
          provider_code: prod.code,
          region: "mauritius",
          name: prod.period ? `${pkg.name} × ${prod.period} days` : pkg.name,
          retail_eur_cents: suggestRetailEurCents(wholesale, rate),
          active: false,
          sort_order: 500 + Math.round(pkg.dataMb / 100),
          ...common,
        });
        if (e) throw e;
        report.created++;
      } else {
        const patch: Record<string, unknown> = { ...common };
        if (!row.retail_locked && margin(row.retail_eur_cents, wholesale, rate).netEurCents < 100) {
          patch.retail_eur_cents = suggestRetailEurCents(wholesale, rate);
        }
        const { error: e } = await db.from("esim_plans").update(patch).eq("id", row.id);
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
  return report;
}

export type DeskPlan = Record<string, unknown> & {
  id: string;
  retail_eur_cents: number;
  wholesale_usd_micros: number;
  margin: ReturnType<typeof margin>;
  networkLabels: string[];
};

export async function readDesk(db: SupabaseClient) {
  const rate = await eurPerUsd();
  const [{ data: plans, error: pe }, { data: orders, error: oe }] = await Promise.all([
    db.from("esim_plans").select("*").order("active", { ascending: false }).order("sort_order").order("retail_eur_cents"),
    db
      .from("esim_orders")
      .select(
        "id, ref, email, language, status, retail_eur_cents, paid_eur_cents, wholesale_usd_micros, provider, provider_order_no, iccid, esim_status, used_bytes, total_bytes, expires_at, provision_attempts, last_error, email_sent_at, created_at, paid_at, delivered_at, refunded_at, plan_snapshot, source",
      )
      .neq("status", "pending_payment")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  if (pe) throw pe;
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

  const deskPlans: DeskPlan[] = (plans ?? []).map((p) => ({
    ...p,
    margin: margin(p.retail_eur_cents, Number(p.wholesale_usd_micros), rate),
    networkLabels: displayNetworks(p.networks),
  }));

  const delivered = (orders ?? []).filter((o) => o.status === "delivered");
  const revenue = delivered.reduce((s, o) => s + (o.paid_eur_cents ?? o.retail_eur_cents), 0);
  const net = delivered.reduce((s, o) => s + margin(o.paid_eur_cents ?? o.retail_eur_cents, Number(o.wholesale_usd_micros ?? 0), rate).netEurCents, 0);

  return {
    provider: { id: provider.id, configured: provider.configured(), balanceUsdMicros, balanceError },
    webhookUrl: `${SITE_URL}/api/esim/webhook/${provider.id}`,
    eurPerUsd: rate,
    plans: deskPlans,
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
  if (typeof patch.active === "boolean") clean.active = patch.active;
  if (patch.badge !== undefined) clean.badge = patch.badge || null;
  if (typeof patch.sort_order === "number") clean.sort_order = Math.round(patch.sort_order);
  if (clean.active === true) {
    const { data: plan } = await db.from("esim_plans").select("covers_rodrigues, available, retail_eur_cents, wholesale_usd_micros").eq("id", id).maybeSingle();
    if (!plan) throw new EsimError(404, "Plan not found.");
    if (!plan.covers_rodrigues) throw new EsimError(409, "This plan does not roam onto my.t or Emtel, so it has no signal on Rodrigues. It cannot be sold here.");
    if (!plan.available) throw new EsimError(409, "The supplier no longer offers this plan.");
    const price = (clean.retail_eur_cents as number | undefined) ?? plan.retail_eur_cents;
    const m = margin(price, Number(plan.wholesale_usd_micros), await eurPerUsd());
    if (m.netEurCents < 100) throw new EsimError(409, `At this price the plan nets ${(m.netEurCents / 100).toFixed(2)} € after the supplier and PayPal. Raise the price first.`);
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
 * profile cannot be cancelled; that refund is then the platform's cost, and
 * the desk says so.
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
  await db
    .from("esim_orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", o.id);
  return { refunded: true, profileCancelled };
}

export async function registerWebhook() {
  const provider = activeProvider();
  if (!provider.configured() || !provider.setWebhook) throw new EsimError(409, "This supplier has no webhook API.");
  const url = `${SITE_URL}/api/esim/webhook/${provider.id}`;
  await provider.setWebhook(url);
  return { url };
}
