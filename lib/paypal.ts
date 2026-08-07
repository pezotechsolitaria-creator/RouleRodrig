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
}> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    status?: string;
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
  };
}
