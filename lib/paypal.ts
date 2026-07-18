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

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
const SECRET = process.env.PAYPAL_SECRET || "";
const ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const BASE = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export const PAYPAL_CURRENCY = "EUR";

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
}): Promise<{ id: string; eur: string }> {
  const eur = await murToEur(opts.depositMur);
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
  return { id: j.id, eur };
}

// ── Capture an approved order; returns the verified status ───────────────────
export async function captureOrder(
  orderId: string,
): Promise<{ status: string; captureId: string | null; amount: string | null; currency: string | null }> {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    status?: string;
    purchase_units?: {
      payments?: { captures?: { id: string; amount?: { value: string; currency_code: string } }[] };
    }[];
  };
  const cap = j.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: j.status ?? "UNKNOWN",
    captureId: cap?.id ?? null,
    amount: cap?.amount?.value ?? null,
    currency: cap?.amount?.currency_code ?? null,
  };
}
