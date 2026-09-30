import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { SITE_URL } from "@/lib/site";
import {
  paypalConfigured,
  createEurOrder,
  captureOrder,
  fetchOrder,
  PAYPAL_CURRENCY,
} from "@/lib/paypal";
import { sendEsimDelivered, sendEsimOrderProblem, sendOwnerEsimAlert } from "@/lib/email";
import { activeProvider, providerById, ProviderError, type Profile } from "./providers";
import { eurPerUsd } from "./fx";
import { isSellable, margin, formatEur, eurCentsToPayPalValue, payPalValueToEurCents } from "./pricing";
import { newOrderId, refFor, newOrderSalt, orderLinkKey, linkKeyMatches, normaliseRef } from "./ids";
import { parseActivation, appleInstallUrl, androidInstallUrl } from "./lpa";
import { planLabel } from "./format";
import { qrPngBase64 } from "./qr";

// ── The eSIM order engine ────────────────────────────────────────────────────
//
//   startCheckout     plan + email → our order row + a PayPal order
//   completePayment   PayPal capture → verified → wholesale order → profile
//   provisionOrder    the wholesale half, safe to call any number of times
//   refreshOrder      what the install page polls while a profile is pending
//   handleWebhook     the wholesaler's doorbell
//
// THE ORDER OF MONEY IS THE WHOLE DESIGN. The customer's payment is captured
// first; the eSIM is bought from the wholesaler second. So the platform can
// never pay for an eSIM nobody paid for — the worst case is the opposite (paid,
// not yet issued), which is recoverable: retry, or refund. Every step after
// capture is idempotent, keyed on our order id, which the wholesaler receives
// as its transactionId: a retry after a crash, a double tap, a webhook racing
// the page poll — each converges on the same single wholesale order.

export class EsimError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    detail?: string,
  ) {
    super(detail ?? publicMessage);
    this.name = "EsimError";
  }
}

export type Lang = "en" | "fr" | "cr";

export type PublicPlan = {
  id: string;
  name: string;
  region: string;
  country_codes: string[];
  data_mb: number;
  per_day: boolean;
  validity_days: number;
  networks: { name: string; type?: string | null }[];
  hotspot: boolean;
  topup_supported: boolean;
  fup_policy: string | null;
  ip_export: string | null;
  retail_eur_cents: number;
  badge: "popular" | "best_value" | "short_trip" | "long_stay" | null;
  sort_order: number;
};

type OrderRow = {
  id: string;
  ref: string;
  access_token_hash: string;
  plan_id: string;
  plan_snapshot: PlanSnapshot;
  email: string;
  language: Lang;
  status: "pending_payment" | "paid" | "provisioning" | "delivered" | "failed" | "refunded" | "cancelled";
  retail_eur_cents: number;
  wholesale_usd_micros: number | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paid_eur_cents: number | null;
  provider: string;
  provider_order_no: string | null;
  provider_profile_id: string | null;
  iccid: string | null;
  lpa: string | null;
  smdp_address: string | null;
  activation_code: string | null;
  qr_code_url: string | null;
  esim_status: string | null;
  expires_at: string | null;
  total_bytes: number | null;
  used_bytes: number | null;
  apn: string | null;
  provision_attempts: number;
  last_error: string | null;
  email_sent_at: string | null;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
};

export type PlanSnapshot = {
  name: string;
  provider_code: string;
  period_num: number | null;
  data_mb: number;
  per_day: boolean;
  validity_days: number;
  networks: { name: string; type?: string | null }[];
  /** Per-unit wholesale price at checkout — the order-time price guard. */
  unit_usd_micros: number;
};

// ── Can the store sell right now? ────────────────────────────────────────────

export type StoreState = { selling: boolean; missing: ("provider" | "paypal" | "database")[] };

export function storeState(): StoreState {
  const missing: StoreState["missing"] = [];
  if (!activeProvider().configured()) missing.push("provider");
  if (!paypalConfigured()) missing.push("paypal");
  if (!hasServiceRole()) missing.push("database");
  return { selling: missing.length === 0, missing };
}

// ── The public catalogue ─────────────────────────────────────────────────────

/** Plans a shopper may buy. Null (not []) when the read failed, so a page can
 *  tell "no plans" from "could not load plans". */
export async function getPublicPlans(region = "mauritius"): Promise<PublicPlan[] | null> {
  try {
    const { data, error } = await createAnonClient().rpc("public_esim_plans", { p_region: region });
    if (error) {
      console.error("[esim] catalogue read failed", error);
      return null;
    }
    return (data ?? []) as PublicPlan[];
  } catch (e) {
    console.error("[esim] catalogue read threw", e);
    return null;
  }
}

// ── Links ────────────────────────────────────────────────────────────────────

export function orderUrl(o: Pick<OrderRow, "id" | "ref" | "access_token_hash">, absolute = true): string {
  const path = `/esim/order/${o.ref}?k=${orderLinkKey(o.id, o.access_token_hash)}`;
  return absolute ? `${SITE_URL}${path}` : path;
}

// ── 1. Checkout ──────────────────────────────────────────────────────────────

export async function startCheckout(input: {
  planId: string;
  email: string;
  language: Lang;
  source: Record<string, string>;
}): Promise<{ orderId: string; ref: string; paypalOrderId: string; priceEurCents: number }> {
  const state = storeState();
  if (!state.selling) {
    throw new EsimError(503, "eSIM sales open very soon — leave your email and we'll tell you.", `missing: ${state.missing.join(",")}`);
  }
  const db = await getPrivileged();

  const { data: plan, error } = await db
    .from("esim_plans")
    .select("*")
    .eq("id", input.planId)
    .maybeSingle();
  if (error) throw new EsimError(500, "Something went wrong. Please try again.", error.message);
  if (!plan || !plan.active || !plan.available || !plan.covers_rodrigues) {
    throw new EsimError(404, "This plan is no longer available. Please choose another.");
  }

  // ── The live price check, BEFORE the customer pays ───────────────────────
  // Wholesalers change prices without notice. Checking here (not at
  // provisioning) means a plan that has become a loss-maker is refused while
  // the customer can still pick another — rather than after we took their
  // money and can only refund it.
  const provider = activeProvider();
  let live;
  try {
    live = await provider.getPackage(plan.provider_code);
  } catch (e) {
    console.error("[esim] live price check failed", e);
    throw new EsimError(503, "Our eSIM supplier is not answering right now. Please try again in a minute.");
  }
  if (!live) {
    await db.from("esim_plans").update({ available: false }).eq("id", plan.id);
    await alertOwner({
      subject: `eSIM plan withdrawn by supplier: ${plan.provider_code}`,
      heading: "A plan was withdrawn",
      message: "A customer tried to buy a plan the supplier no longer offers. It has been hidden from the store.",
      details: [["Plan", `${plan.name} (${plan.provider_code})`]],
      key: `owner_esim_alert:withdrawn:${plan.id}`,
    });
    throw new EsimError(409, "This plan was just withdrawn by our supplier. Please choose another.");
  }
  const periods = plan.period_num ?? 1;
  const totalMicros = live.wholesaleUsdMicros * periods;
  if (totalMicros !== Number(plan.wholesale_usd_micros)) {
    await db.from("esim_plans").update({ wholesale_usd_micros: totalMicros }).eq("id", plan.id);
  }
  const rate = await eurPerUsd();
  if (!isSellable(plan.retail_eur_cents, totalMicros, rate)) {
    const m = margin(plan.retail_eur_cents, totalMicros, rate);
    await alertOwner({
      subject: `eSIM plan below cost: ${plan.name}`,
      heading: "A plan would sell at a loss",
      message: "The supplier's price has risen above what this plan can be sold for. Sales of it are paused until you reprice it.",
      details: [
        ["Plan", plan.name],
        ["Retail", formatEur(plan.retail_eur_cents)],
        ["Supplier cost now", formatEur(m.costEurCents)],
        ["Net after PayPal", formatEur(m.netEurCents)],
      ],
      key: `owner_esim_alert:below_cost:${plan.id}:${new Date().toISOString().slice(0, 10)}`,
    });
    throw new EsimError(409, "This plan is temporarily unavailable. Please choose another.");
  }

  const id = newOrderId();
  const ref = refFor(id);
  const snapshot: PlanSnapshot = {
    name: plan.name,
    provider_code: plan.provider_code,
    period_num: plan.period_num,
    data_mb: plan.data_mb,
    per_day: plan.per_day,
    validity_days: plan.validity_days,
    networks: plan.networks ?? [],
    unit_usd_micros: live.wholesaleUsdMicros,
  };
  const { error: insErr } = await db.from("esim_orders").insert({
    id,
    ref,
    access_token_hash: newOrderSalt(),
    plan_id: plan.id,
    plan_snapshot: snapshot,
    email: input.email,
    language: input.language,
    status: "pending_payment",
    retail_eur_cents: plan.retail_eur_cents,
    wholesale_usd_micros: totalMicros,
    provider: provider.id,
    source: input.source,
  });
  if (insErr) throw new EsimError(500, "Something went wrong. Please try again.", insErr.message);

  let paypal;
  try {
    paypal = await createEurOrder({
      referenceId: id,
      customId: ref,
      description: `eSIM Mauritius & Rodrigues — ${planLabel(plan, "en")}`,
      eurValue: eurCentsToPayPalValue(plan.retail_eur_cents),
    });
  } catch (e) {
    console.error("[esim] PayPal create failed", e);
    await db.from("esim_orders").update({ status: "cancelled", last_error: "paypal create failed" }).eq("id", id);
    throw new EsimError(502, "Payment could not be started. You have not been charged — please try again.");
  }
  await db.from("esim_orders").update({ paypal_order_id: paypal.id }).eq("id", id);
  return { orderId: id, ref, paypalOrderId: paypal.id, priceEurCents: plan.retail_eur_cents };
}

// ── 2. Payment ───────────────────────────────────────────────────────────────

export async function completePayment(orderId: string, paypalOrderId: string): Promise<{ ref: string; url: string; status: OrderRow["status"] }> {
  const db = await getPrivileged();
  const order = await loadOrder(orderId);
  if (!order) throw new EsimError(404, "Order not found.");
  // The PayPal order must be the one WE created for THIS row. Without this, an
  // approved €4.90 order could be replayed against a €42.90 one.
  if (order.paypal_order_id !== paypalOrderId) {
    throw new EsimError(409, "This payment does not match this order. It has not been applied — please contact us.");
  }

  if (order.status === "pending_payment") {
    let cap: { status: string; captureId: string | null; amount: string | null; currency: string | null; referenceId: string | null };
    try {
      cap = await captureOrder(paypalOrderId);
    } catch (e) {
      // Ambiguous: a timeout, or a double tap that PayPal answers with
      // ORDER_ALREADY_CAPTURED. Ask PayPal what actually happened.
      console.error("[esim] capture threw — reading order state", e);
      try {
        const o = await fetchOrder(paypalOrderId);
        cap = { status: o.captureStatus === "COMPLETED" ? "COMPLETED" : o.status, captureId: o.captureId, amount: o.amount, currency: o.currency, referenceId: o.referenceId };
      } catch {
        throw new EsimError(502, "We could not confirm your payment. You have not been charged twice — please contact us with your order number.");
      }
    }
    if (cap.status !== "COMPLETED") {
      throw new EsimError(402, "The payment was not completed. You have not been charged.");
    }
    const paidCents = payPalValueToEurCents(cap.amount);
    const problem =
      cap.referenceId !== order.id
        ? "reference"
        : cap.currency && cap.currency !== PAYPAL_CURRENCY
          ? "currency"
          : paidCents === null || paidCents < order.retail_eur_cents
            ? "amount"
            : null;
    if (problem) {
      await db.from("esim_orders").update({ last_error: `capture refused: ${problem}`, paypal_capture_id: cap.captureId }).eq("id", order.id);
      await alertOwner({
        subject: `eSIM payment mismatch on ${order.ref}`,
        heading: "A payment did not match its order",
        message: "PayPal captured money that does not match this eSIM order. Nothing was issued. Check PayPal and refund if needed.",
        details: [["Order", order.ref], ["Problem", problem], ["Captured", `${cap.amount ?? "?"} ${cap.currency ?? "?"}`], ["Expected", formatEur(order.retail_eur_cents)]],
        key: `owner_esim_alert:mismatch:${order.id}`,
      });
      throw new EsimError(409, "This payment does not match this order. It has not been applied — please contact us.");
    }
    // Conditional on the status we read: a concurrent capture of the same order
    // (double tap) cannot mark it paid twice or overwrite the capture id.
    await db
      .from("esim_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), paypal_capture_id: cap.captureId, paid_eur_cents: paidCents })
      .eq("id", order.id)
      .eq("status", "pending_payment");
  } else if (order.status === "cancelled" || order.status === "refunded") {
    throw new EsimError(409, "This order is closed. Please start a new one.");
  }

  // ~20 s: most profiles arrive in under 10, and a buyer who lands on a page
  // already showing their QR never needs the "preparing" screen. Overridable
  // so the engine's tests do not sit through real waits.
  const waitMs = Number(process.env.ESIM_CAPTURE_WAIT_MS ?? 20_000);
  const after = await provisionOrder(order.id, { waitMs });
  return { ref: after.ref, url: orderUrl(after, false), status: after.status };
}

// ── 3. Provisioning ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Buys the eSIM from the wholesaler (once) and collects the profile (as soon
 * as it exists). Safe to call repeatedly from anywhere: the capture route, the
 * install page's poll, the webhook, the admin "retry" button.
 */
export async function provisionOrder(orderId: string, opts: { waitMs?: number; retryFailed?: boolean } = {}): Promise<OrderRow> {
  const db = await getPrivileged();
  let order = await loadOrder(orderId);
  if (!order) throw new EsimError(404, "Order not found.");
  const provisionable = order.status === "paid" || order.status === "provisioning" || (opts.retryFailed && order.status === "failed");
  if (!provisionable) return order;

  const provider = providerById(order.provider);
  if (!provider || !provider.configured()) {
    await markFailed(order, "wholesaler not configured on this environment");
    return (await loadOrder(orderId))!;
  }

  // ── Place the wholesale order, once ─────────────────────────────────────
  if (!order.provider_order_no) {
    await db.from("esim_orders").update({ provision_attempts: order.provision_attempts + 1 }).eq("id", order.id);
    let orderNo: string | null = null;
    for (let attempt = 0; attempt < 2 && !orderNo; attempt++) {
      try {
        const r = await provider.order({
          transactionId: order.id,
          code: order.plan_snapshot.provider_code,
          periodNum: order.plan_snapshot.period_num,
          expectedUnitUsdMicros: order.plan_snapshot.unit_usd_micros ?? null,
        });
        orderNo = r.orderNo;
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError(String((e as Error)?.message ?? e), null, true);
        console.error(`[esim] wholesale order ${order.ref} attempt ${attempt + 1}`, err.message);
        if (!err.retryable) {
          await markFailed(order, err.message);
          return (await loadOrder(orderId))!;
        }
        if (attempt === 0) await sleep(1500);
        else {
          // Still paid, still no wholesale order: the next poll or an admin
          // retry will try again. Not "failed" — nothing definitive happened.
          await db.from("esim_orders").update({ last_error: err.message }).eq("id", order.id);
          return (await loadOrder(orderId))!;
        }
      }
    }
    await db
      .from("esim_orders")
      .update({ provider_order_no: orderNo, status: "provisioning", last_error: null })
      .eq("id", order.id);
    order = (await loadOrder(orderId))!;
  }

  // ── Collect the profile ─────────────────────────────────────────────────
  const deadline = Date.now() + (opts.waitMs ?? 0);
  for (;;) {
    let profile: Profile | null = null;
    try {
      profile = await provider.queryOrder(order.provider_order_no!);
    } catch (e) {
      console.error(`[esim] query ${order.ref}`, (e as Error).message);
    }
    if (profile) return finalize(order, profile);
    if (Date.now() + 2500 > deadline) return order;
    await sleep(2500);
  }
}

async function finalize(order: OrderRow, profile: Profile): Promise<OrderRow> {
  const db = await getPrivileged();
  const act = parseActivation(profile.lpa);
  if (!act) {
    await markFailed(order, `unreadable activation code from wholesaler: ${String(profile.lpa).slice(0, 80)}`);
    return (await loadOrder(order.id))!;
  }
  // Conditional: only the caller that flips the row to delivered sends the
  // email, so a webhook racing the page poll cannot send it twice.
  const { data: flipped } = await db
    .from("esim_orders")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      provider_profile_id: profile.profileId,
      iccid: profile.iccid,
      lpa: act.lpa,
      smdp_address: act.smdpAddress,
      activation_code: act.activationCode,
      qr_code_url: profile.qrCodeUrl,
      esim_status: profile.esimStatus,
      expires_at: profile.expiresAt ? new Date(profile.expiresAt).toISOString() : null,
      total_bytes: profile.totalBytes,
      used_bytes: profile.usedBytes,
      apn: profile.apn,
      last_error: null,
    })
    .eq("id", order.id)
    .in("status", ["paid", "provisioning", "failed"])
    .select("id");
  const delivered = (await loadOrder(order.id))!;
  if (flipped && flipped.length > 0) {
    await emailDelivered(delivered);
    await alertOwner({
      subject: `eSIM sold: ${delivered.ref} — ${formatEur(delivered.retail_eur_cents)}`,
      heading: "An eSIM was sold",
      message: "Paid, issued and emailed to the customer. Nothing to do.",
      details: [
        ["Order", delivered.ref],
        ["Plan", planLabel(delivered.plan_snapshot, "en")],
        ["Paid", formatEur(delivered.paid_eur_cents ?? delivered.retail_eur_cents)],
        ["Customer", delivered.email],
      ],
      key: `owner_esim_alert:sold:${delivered.id}`,
    });
  }
  return delivered;
}

export async function emailDelivered(order: OrderRow): Promise<boolean> {
  if (!order.lpa || !order.smdp_address || !order.activation_code) return false;
  const lang = order.language;
  const ok = await sendEsimDelivered({
    id: order.id,
    ref: order.ref,
    email: order.email,
    language: lang,
    planLabel: planLabel(order.plan_snapshot, lang),
    priceLabel: formatEur(order.paid_eur_cents ?? order.retail_eur_cents, lang === "en" ? "en" : "fr"),
    lpa: order.lpa,
    smdpAddress: order.smdp_address,
    activationCode: order.activation_code,
    qrCodeUrl: order.qr_code_url,
    orderUrl: orderUrl(order),
    appleInstallUrl: appleInstallUrl(order.lpa),
    qrPngBase64: await qrPngBase64(order.lpa),
  });
  if (ok) {
    const db = await getPrivileged();
    await db.from("esim_orders").update({ email_sent_at: new Date().toISOString() }).eq("id", order.id);
  }
  return ok;
}

async function markFailed(order: OrderRow, reason: string): Promise<void> {
  const db = await getPrivileged();
  const { data: flipped } = await db
    .from("esim_orders")
    .update({ status: "failed", last_error: reason.slice(0, 500) })
    .eq("id", order.id)
    .in("status", ["paid", "provisioning"])
    .select("id");
  if (!flipped || flipped.length === 0) return;
  await sendEsimOrderProblem({ id: order.id, ref: order.ref, email: order.email, language: order.language, orderUrl: orderUrl(order) });
  await alertOwner({
    subject: `ACTION NEEDED — eSIM ${order.ref} paid but not issued`,
    heading: "A paid eSIM could not be issued",
    message:
      "The customer has paid and has been told they will get the eSIM or a full refund within 24 hours. Top up the supplier balance and press Retry, or press Refund.",
    details: [["Order", order.ref], ["Customer", order.email], ["Paid", formatEur(order.paid_eur_cents ?? order.retail_eur_cents)], ["Reason", reason]],
    key: `owner_esim_alert:failed:${order.id}`,
  });
}

async function alertOwner(a: Parameters<typeof sendOwnerEsimAlert>[0]): Promise<void> {
  try {
    await sendOwnerEsimAlert(a);
  } catch (e) {
    console.error("[esim] owner alert failed", e);
  }
}

// ── 4. The install page ──────────────────────────────────────────────────────

export type OrderView = {
  ref: string;
  status: OrderRow["status"];
  language: Lang;
  planLabelEn: string;
  planLabelFr: string;
  priceLabel: string;
  email: string;
  createdAt: string;
  deliveredAt: string | null;
  expiresAt: string | null;
  usedBytes: number | null;
  totalBytes: number | null;
  activation: {
    lpa: string;
    smdpAddress: string;
    activationCode: string;
    appleUrl: string;
    androidUrl: string;
  } | null;
  apn: string | null;
};

function toView(o: OrderRow): OrderView {
  const act = o.status === "delivered" ? parseActivation(o.lpa) : null;
  return {
    ref: o.ref,
    status: o.status,
    language: o.language,
    planLabelEn: planLabel(o.plan_snapshot, "en"),
    planLabelFr: planLabel(o.plan_snapshot, "fr"),
    priceLabel: formatEur(o.paid_eur_cents ?? o.retail_eur_cents),
    email: o.email,
    createdAt: o.created_at,
    deliveredAt: o.delivered_at,
    expiresAt: o.expires_at,
    usedBytes: o.used_bytes,
    totalBytes: o.total_bytes,
    activation: act
      ? { lpa: act.lpa, smdpAddress: act.smdpAddress, activationCode: act.activationCode, appleUrl: appleInstallUrl(act.lpa), androidUrl: androidInstallUrl(act.lpa) }
      : null,
    apn: o.apn,
  };
}

/** The install page's read. Null for a wrong ref or key — same answer for both. */
export async function viewOrder(refInput: string, key: string | null, opts: { refresh?: boolean } = {}): Promise<OrderView | null> {
  const ref = normaliseRef(refInput);
  if (!ref || !key || !hasServiceRole()) return null;
  const db = await getPrivileged();
  const { data } = await db.from("esim_orders").select("*").eq("ref", ref).maybeSingle();
  const order = data as OrderRow | null;
  if (!order || !linkKeyMatches(key, order.id, order.access_token_hash)) return null;
  if (opts.refresh && (order.status === "paid" || order.status === "provisioning")) {
    try {
      return toView(await provisionOrder(order.id, { waitMs: 0 }));
    } catch (e) {
      console.error("[esim] refresh failed", e);
    }
  }
  return toView(order);
}

/** "I lost the link": ref + email → the install page URL. Same null for a
 *  wrong ref and a wrong email, so neither can be probed. */
export async function lookupOrder(refInput: string, email: string): Promise<string | null> {
  const ref = normaliseRef(refInput);
  if (!ref || !hasServiceRole()) return null;
  const db = await getPrivileged();
  const { data } = await db.from("esim_orders").select("id, ref, email, access_token_hash, status").eq("ref", ref).maybeSingle();
  if (!data || data.email.trim().toLowerCase() !== email.trim().toLowerCase()) return null;
  if (data.status === "pending_payment" || data.status === "cancelled") return null;
  return orderUrl(data, false);
}

// ── 5. Webhooks ──────────────────────────────────────────────────────────────

export async function handleWebhook(
  providerId: string,
  body: unknown,
  opts: { trustedSender: boolean } = { trustedSender: false },
): Promise<{ ok: true; duplicate?: boolean; ignored?: boolean }> {
  const provider = providerById(providerId);
  if (!provider) return { ok: true, ignored: true };
  const ev = provider.parseWebhook(body);
  if (!ev) return { ok: true, ignored: true };
  const db = await getPrivileged();

  const { error: insErr } = await db.from("esim_webhook_events").insert({
    provider: providerId,
    event_key: ev.key,
    event_type: ev.type,
    order_no: ev.orderNo,
    iccid: ev.iccid,
    payload: body as object,
    // "Came from the wholesaler's published IPs" — the closest thing to a
    // signature an unsigned webhook has.
    signature_ok: opts.trustedSender,
  });
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message)) return { ok: true, duplicate: true };
    throw new Error(insErr.message);
  }
  if (ev.type === "CHECK_HEALTH") {
    await db.from("esim_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_key", ev.key);
    return { ok: true };
  }

  // Our order id IS the wholesaler's transactionId; fall back to orderNo.
  let order: OrderRow | null = null;
  if (ev.transactionId && /^[0-9a-f-]{36}$/i.test(ev.transactionId)) order = await loadOrder(ev.transactionId);
  if (!order && ev.orderNo) {
    const { data } = await db.from("esim_orders").select("*").eq("provider_order_no", ev.orderNo).maybeSingle();
    order = data as OrderRow | null;
  }

  let error: string | null = null;
  try {
    if (order) {
      if (order.status === "paid" || order.status === "provisioning") {
        // The doorbell: re-read the profile through the SIGNED API. Nothing in
        // an unsigned webhook body is trusted as data.
        await provisionOrder(order.id, { waitMs: 0 });
      } else if (order.status === "delivered" && opts.trustedSender) {
        // Usage figures ARE taken from the body — they are display-only (the
        // install page's "data left"), and only from the wholesaler's IPs.
        const patch: Record<string, unknown> = {};
        if (ev.esimStatus) patch.esim_status = ev.esimStatus;
        if (ev.usedBytes !== null) patch.used_bytes = ev.usedBytes;
        if (ev.totalBytes !== null) patch.total_bytes = ev.totalBytes;
        if (ev.expiresAt) patch.expires_at = new Date(ev.expiresAt).toISOString();
        if (Object.keys(patch).length) {
          patch.usage_checked_at = new Date().toISOString();
          await db.from("esim_orders").update(patch).eq("id", order.id);
        }
      }
    }
  } catch (e) {
    error = (e as Error).message;
  }
  await db
    .from("esim_webhook_events")
    .update({ processed_at: new Date().toISOString(), error })
    .eq("event_key", ev.key);
  return { ok: true };
}

// ── Shared ───────────────────────────────────────────────────────────────────

export async function loadOrder(id: string): Promise<OrderRow | null> {
  const db = await getPrivileged();
  const { data } = await db.from("esim_orders").select("*").eq("id", id).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export type { OrderRow };
