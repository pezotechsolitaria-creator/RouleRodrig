import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_HOLD_HOURS, type PaymentProvider } from "./hold";

// Resolving the reservation window BEFORE the order exists.
//
// Kept out of lib/orders/hold.ts on purpose: that module is pure and is
// imported by client components, and pulling a server Supabase client into it
// would drag server-only code into the browser bundle.
//
// It asks SQL rather than reading marketplace_settings directly, because
// order_hold_hours() is the one place the value is resolved — it applies the
// clamp and the per-provider fallback that a raw column read would miss, and it
// is the exact function create_order() calls a moment later. A second
// implementation here would be a second answer, and the whole point of showing
// the customer a deadline is that it is the one the database will enforce.
//
// order_hold_hours() is granted to anon and authenticated (M13), so this works
// on a guest checkout as well as a signed-in one.

/**
 * Hours a new order will hold its stock, for the provider it will be paid with.
 *
 * Falls back to the same defaults SQL uses rather than throwing: a checkout
 * that cannot reach the settings row must still be placeable, and a window that
 * is right in every normal case and approximately right in an outage is better
 * than the disclosure vanishing exactly when something is already wrong.
 */
export async function resolveHoldHours(provider: PaymentProvider): Promise<number> {
  const fallback = FALLBACK_HOLD_HOURS[provider] ?? 48;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("order_hold_hours", { p_provider: provider });
    if (error || typeof data !== "number" || !Number.isFinite(data)) return fallback;
    return data;
  } catch {
    return fallback;
  }
}

/**
 * Both windows a checkout might need, resolved in one pass.
 *
 * The customer picks their payment method in the browser, and the two providers
 * genuinely have different windows (cash gets a week, a transfer gets two
 * days). Resolving both on the server and letting the form pick keeps the
 * disclosure correct the instant they switch the radio, with no round trip and
 * no client-side guess at a value that lives in SQL.
 */
export async function resolveHoldWindows(): Promise<Record<PaymentProvider, number>> {
  const [cash, bank_transfer, manual] = await Promise.all([
    resolveHoldHours("cash"),
    resolveHoldHours("bank_transfer"),
    resolveHoldHours("manual"),
  ]);
  return { cash, bank_transfer, manual };
}
