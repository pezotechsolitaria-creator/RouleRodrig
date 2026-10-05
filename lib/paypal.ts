// PayPal server-side integration for booking deposits.
//
// PayPal does NOT support Mauritian Rupee, so deposits (held in Rs) are charged
// in EUR — the currency most Rodrigues tourists think in. The Rs→EUR conversion
// and the order amount are computed SERVER-side from the stored booking, never
// from the client, so nobody can pay a smaller deposit than they owe.
//
// Everything is env-gated: with no credentials set, paypalConfigured() is false,
// the routes 503, and no button renders — the current bank-transfer flow is
// untouched. Set NEXT_PUBLIC_PAYPAL_CLIENT_ID + PAYPAL_SECRET (+ PAYPAL_ENV) in
// Vercel to activate. PAYPAL_ENV=sandbox uses PayPal's test servers.

import { PAYPAL_FEE_PERCENT } from "./site";

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
const SECRET = process.env.PAYPAL_SECRET || "";
const ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const BASE = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export const PAYPAL_CURRENCY = "EUR";

// The customer bears the PayPal fee, so it's added to the deposit at checkout.
export function withPayPalFee(depositMur: number): { fee: number; total: number } {
  const fee = Math.round((depositMur * PAYPAL_FEE_PERCENT) / 100);
  return { fee, total: depositMur + fee };
}

export function paypalConfigured(): boolean {
  return !!CLIENT_ID && !!SECRET;
}

/**
 * Whether PayPal can take REAL money.
 *
 * Found 5 Oct 2026: the site had been running PayPal's SANDBOX since PayPal
 * was added — the public client id is a sandbox app, PAYPAL_ENV was never set
 * (it defaults to "sandbox"), and not one capture had ever been recorded. A
 * customer pressing "Pay" was sent to sandbox.paypal.com, which takes only
 * test accounts. Nothing anywhere said so. This is the single answer every
 * screen now asks: "live" means cards and PayPal accounts really pay.
 */
export function paypalMode(): "live" | "sandbox" | "off" {
  if (!paypalConfigured()) return "off";
  return ENV === "live" ? "live" : "sandbox";
}

// ── Rs → EUR, from live rates, server-side, cached 1h ────────────────────────
let rateCache: { eurPerMur: number; at: number } | null = null;
async function eurPerMur(): Promise<number> {
  if (rateCache && Date.now() - rateCache.at < 3_600_000) return rateCache.eurPerMur;
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } });
  const data = (await res.json()) as { rates?: Record<string, number> };
  const eur = data.rates?.EUR;
  const mur = data.rates?.MUR;
  if (!eur || !mur) throw new Error("FX rate unavailable");
  const v = eur / mur; // EUR per 1 MUR
  rateCache = { eurPerMur: v, at: Date.now() };
  return v;
}

/** Convert a MUR amount to a 2-dp EUR string PayPal accepts. */
export async function murToEur(mur: number): Promise<string> {
  const eur = mur * (await eurPerMur());
  return (Math.round(eur * 100) / 100).toFixed(2);
}

// ── OAuth ────────────────────────────────────────────────────────────────────
async function accessToken(): Promise<string> {
  const auth = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

// ── Do the keys work? ────────────────────────────────────────────────────────
//
// "live" says which PayPal the server will call, not that PayPal will answer:
// a sandbox Secret beside a live Client ID — or a typo — fails only when a
// customer presses Pay. So this asks PayPal for a token, the cheapest call it
// has, and remembers the answer for ten minutes (health is polled).

let keysCache: { at: number; ok: boolean } | null = null;

export async function paypalKeysWork(): Promise<"ok" | "rejected" | "off"> {
  if (!paypalConfigured()) return "off";
  if (keysCache && Date.now() - keysCache.at < 600_000) return keysCache.ok ? "ok" : "rejected";
  let ok = false;
  try {
    await accessToken();
    ok = true;
  } catch {
    ok = false;
  }
  keysCache = { at: Date.now(), ok };
  return ok ? "ok" : "rejected";
}

/**
 * Which of the three settings this deployment can SEE — booleans, never a
 * value. On 6 Oct 2026 the Client ID was saved as NEXT_PAYPAL_CLIENT_ID
 * (no _PUBLIC_), which Next.js never sends to the browser; this names that.
 */
export function paypalEnvPresence(): Record<string, boolean> {
  return {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: Boolean(CLIENT_ID),
    PAYPAL_SECRET: Boolean(SECRET),
    PAYPAL_ENV_is_live: ENV === "live",
    // The misspelling seen in production, reported so its fix is obvious.
    NEXT_PAYPAL_CLIENT_ID_misnamed: Boolean(process.env.NEXT_PAYPAL_CLIENT_ID),
  };
}

// ── Create a deposit order (amount computed server-side, in EUR) ─────────────
export async function createDepositOrder(opts: {
  depositMur: number;
  referenceId: string; // our booking id
  description: string; // e.g. "Deposit — BURGMAN 125cc, 3 days"
}): Promise<{ id: string; eur: string; depositMur: number; feeMur: number; totalMur: number }> {
  // Customer pays the deposit + PayPal fee. Charge the fee-inclusive total.
  const { fee: feeMur, total: totalMur } = withPayPalFee(opts.depositMur);
  const eur = await murToEur(totalMur);
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.referenceId,
          description: opts.description.slice(0, 127),
          amount: { currency_code: PAYPAL_CURRENCY, value: eur },
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`PayPal create-order failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { id: string };
  return { id: j.id, eur, depositMur: opts.depositMur, feeMur, totalMur };
}

/**
 * Decides whether a completed PayPal capture may settle a given booking.
 *
 * Pure so it can be tested exhaustively — this is the check that stands between
 * "someone paid something" and "this booking is confirmed". Returns null when
 * the capture is acceptable, else a customer-safe refusal reason.
 *
 * `expectedEur` is the fee-inclusive EUR price of the booking's DEPOSIT (the
 * floor — a vehicle may legitimately pay the full total instead), or null when
 * it could not be derived, in which case the amount check is skipped rather
 * than blocking a payment PayPal already reference-matched.
 */
export function captureRefusalReason(capture: {
  referenceId: string | null;
  amount: string | null;
  currency: string | null;
}, bookingId: string, expectedEur: number | null): "reference" | "currency" | "amount" | null {
  if (capture.referenceId !== bookingId) return "reference";
  if (capture.currency && capture.currency !== PAYPAL_CURRENCY) return "currency";
  if (expectedEur !== null && Number.isFinite(expectedEur) && expectedEur > 0 && capture.amount) {
    const paid = Number(capture.amount);
    // 10% band absorbs FX drift between order creation and capture.
    if (Number.isFinite(paid) && paid < expectedEur * 0.9) return "amount";
  }
  return null;
}

/**
 * Works out which of the two legitimate amounts a capture actually settled.
 *
 * PayPalDeposit lets a vehicle customer pay EITHER the deposit or the full
 * total, and both used to write an identical row — so a customer who paid 100%
 * was still recorded as having paid a deposit, and was asked for the balance
 * again at pickup. The client is not asked which it paid (it could lie in the
 * cheap direction); instead the captured EUR is matched against the EUR we
 * would have charged for each option.
 *
 * Returns the MUR figure to store, or null when neither matches closely enough
 * to be sure — in which case the caller stores nothing and readers fall back to
 * the old deposit-based display rather than inventing a number.
 */
export function resolvePaidAmountMur(
  capturedEur: number,
  options: { depositMur: number; fullMur?: number | null },
  eurFor: (mur: number) => number,
): number | null {
  const candidates: { mur: number; eur: number }[] = [
    { mur: options.depositMur, eur: eurFor(withPayPalFee(options.depositMur).total) },
  ];
  if (options.fullMur && options.fullMur > options.depositMur) {
    candidates.push({ mur: options.fullMur, eur: eurFor(withPayPalFee(options.fullMur).total) });
  }
  let best: { mur: number; delta: number } | null = null;
  for (const c of candidates) {
    if (!Number.isFinite(c.eur) || c.eur <= 0) continue;
    const delta = Math.abs(capturedEur - c.eur) / c.eur;
    if (best === null || delta < best.delta) best = { mur: c.mur, delta };
  }
  // 10% band, matching the capture guard's FX tolerance.
  return best && best.delta <= 0.1 ? best.mur : null;
}

// ── Capture an approved order; returns the verified status ───────────────────
//
// SECURITY: `referenceId` is what binds a PayPal payment to OUR booking. It is
// set at creation (createDepositOrder above) and echoed back here, and the
// capture route REFUSES any capture whose reference_id is not the booking being
// settled. Without that check, an approved order for a Rs 400 scooter deposit
// could be replayed against a Rs 30,000 car booking — or a stranger's booking —
// because the route is deliberately unauthenticated (PayPal's approval is the
// only credential) and holds a service-role client. Returning amount/currency
// serves the same purpose for the *value*: the route re-derives what the
// booking should cost and rejects an underpayment.
export async function captureOrder(orderId: string): Promise<{
  status: string;
  captureId: string | null;
  amount: string | null;
  currency: string | null;
  referenceId: string | null;
  /** How the buyer paid: a card typed into PayPal's card form, or a PayPal
   *  account. Read from PayPal's answer, never from the browser. */
  source: "card" | "paypal" | null;
}> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    status?: string;
    payment_source?: Record<string, unknown>;
    purchase_units?: {
      reference_id?: string;
      payments?: { captures?: { id: string; amount?: { value: string; currency_code: string } }[] };
    }[];
  };
  const unit = j.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  return {
    status: j.status ?? "UNKNOWN",
    captureId: cap?.id ?? null,
    amount: cap?.amount?.value ?? null,
    currency: cap?.amount?.currency_code ?? null,
    referenceId: unit?.reference_id ?? null,
    source: paymentSourceOf(j.payment_source),
  };
}

/** "card" when PayPal's answer carries payment_source.card, "paypal" for a
 *  wallet, null when PayPal did not say. */
export function paymentSourceOf(ps: Record<string, unknown> | undefined | null): "card" | "paypal" | null {
  if (!ps) return null;
  if ("card" in ps) return "card";
  if ("paypal" in ps) return "paypal";
  return null;
}

// ── Fixed-price EUR orders (the eSIM store) ──────────────────────────────────
//
// Everything above prices in rupees and converts at capture time, with a 10%
// band for FX drift. The eSIM store prices in EUR to begin with, so there is
// no conversion and no band: the capture must equal the price to the cent.

export async function createEurOrder(opts: {
  referenceId: string; // our order id — echoed back at capture and checked
  customId: string; // our human ref, shown in the PayPal dashboard
  description: string;
  eurValue: string; // "9.90"
}): Promise<{ id: string }> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // PayPal's own idempotency: a retried create returns the same order.
      "PayPal-Request-Id": `create-${opts.referenceId}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.referenceId,
          custom_id: opts.customId,
          description: opts.description.slice(0, 127),
          amount: { currency_code: PAYPAL_CURRENCY, value: opts.eurValue },
        },
      ],
      // A digital good: never ask a buyer for a shipping address.
      // application_context rather than payment_source.paypal.experience_context:
      // the latter pins the order to the PayPal wallet, and the JS SDK's
      // "Debit or credit card" button then refuses it — the guest card path
      // is how most tourists without a PayPal account pay.
      application_context: { shipping_preference: "NO_SHIPPING", brand_name: "Roulé Rodrigues" },
    }),
  });
  if (!res.ok) throw new Error(`PayPal create-order failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { id: string };
  return { id: j.id };
}

/**
 * Reads an order's current state WITHOUT capturing it. Used when a capture
 * call fails ambiguously — a timeout, or "ORDER_ALREADY_CAPTURED" after a
 * double tap — to learn whether the money actually moved.
 */
export async function fetchOrder(orderId: string): Promise<{
  status: string;
  captureId: string | null;
  captureStatus: string | null;
  amount: string | null;
  currency: string | null;
  referenceId: string | null;
}> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`PayPal get-order failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    status?: string;
    purchase_units?: {
      reference_id?: string;
      payments?: { captures?: { id: string; status?: string; amount?: { value: string; currency_code: string } }[] };
    }[];
  };
  const unit = j.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  return {
    status: j.status ?? "UNKNOWN",
    captureId: cap?.id ?? null,
    captureStatus: cap?.status ?? null,
    amount: cap?.amount?.value ?? null,
    currency: cap?.amount?.currency_code ?? null,
    referenceId: unit?.reference_id ?? null,
  };
}

/** Refunds a capture in full. Idempotent per capture via PayPal-Request-Id. */
export async function refundCapture(captureId: string, note: string): Promise<{ id: string; status: string }> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `refund-${captureId}`,
    },
    body: JSON.stringify({ note_to_payer: note.slice(0, 255) }),
  });
  if (!res.ok) throw new Error(`PayPal refund failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { id: string; status: string };
  return { id: j.id, status: j.status };
}
