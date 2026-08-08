import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { dispatchNotification } from "./dispatch";
import { SITE_URL } from "@/lib/site";
import { centsToDecimalString } from "@/lib/money";
import {
  holdInfo,
  customerHoldCopy,
  merchantHoldCopy,
  holdDeadlineLabel,
  type PaymentProvider,
} from "@/lib/orders/hold";
import { FULFILLMENT_LABEL } from "@/lib/orders/location";

// ── M17 Phase 2: exactly-once order-placed notifications ────────────────────
// The CLAIM lives in SQL (claim_order_notification / release_order_notification,
// migration 20260806194533) — a single atomic UPDATE that returns true to
// exactly one caller per order, whatever idempotent retries or concurrent
// submits occur. This module is the send side: who gets told, what they are
// told, and when a failed send hands the claim back so the order shows up in
// the "owed a notification" sweep instead of silently never being announced.
//
// Everything here is best-effort by construction: a placed order is already
// committed before any of this runs, and nothing in this file can fail the
// checkout response.

const PROVIDER_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  manual: "Recorded by the shop",
};

// The product shows every amount as "Rs 1234.56" (orders page, merchant
// dashboard); emails must read the same.
const rs = (cents: number) => `Rs ${centsToDecimalString(cents)}`;

// rows()/detailCard() interpolate values straight into email HTML. Customer
// name/phone are typed by the customer and product names by merchants — escape
// them all rather than trusting either party.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface OrderPlacedInput {
  orderId: string;
  orderNumber: string;
  storeId: string;
  /** Order total in minor units, as returned by create_order(). */
  total: number;
  provider: PaymentProvider;
  fulfillment: string;
  customerName: string;
  customerPhone: string;
  /** The address the confirmation goes to: the session's for a registered
   *  buyer, the validated guest address otherwise. */
  customerEmail: string | null;
  /** True when the order has no account behind it — changes where the
   *  customer's "track your order" link points, since /orders/[id] requires a
   *  session (M20). */
  isGuest?: boolean;
}

/**
 * Fans the "order placed" notification out to EVERY merchant_staff member of
 * the store's merchant (one email event each, Promise.allSettled so one bad
 * address cannot block the others), one WhatsApp ping to the site owner, and
 * one email to the customer.
 *
 * Returns true when the claim should be KEPT: someone on the shop side was
 * reached AND the customer was reached (or has no email address at all —
 * a structurally missing address is a skip, not a failure, because no retry
 * can ever fix it). Returns false — caller releases the claim — when a party
 * that should have been reachable wasn't. Never throws.
 */
export async function notifyOrderPlaced(input: OrderPlacedInput): Promise<boolean> {
  try {
    // Staff addresses only exist behind admin.auth.admin.getUserById(), which
    // the anon/SSR fallback inside getPrivileged() cannot call — so the absence
    // of the key is a hard, LOUD failure, not a quiet no-op. Releasing the
    // claim puts the order in the notified_at-is-null sweep where it is visible.
    if (!hasServiceRole()) {
      console.error(
        `notifyOrderPlaced: SUPABASE_SERVICE_ROLE_KEY is not configured — order ${input.orderNumber} placed but NO notifications can be sent`,
      );
      return false;
    }
    const admin = await getPrivileged();

    const [orderRes, storeRes, itemsRes] = await Promise.all([
      admin.from("orders").select("auto_release_at").eq("id", input.orderId).maybeSingle(),
      admin.from("stores").select("merchant_id, name").eq("id", input.storeId).maybeSingle(),
      admin.from("order_items").select("product_name, variant_name, quantity, line_total").eq("order_id", input.orderId),
    ]);

    const store = storeRes.data as { merchant_id: string; name: string } | null;
    if (!store) {
      console.error(`notifyOrderPlaced: store ${input.storeId} not found for order ${input.orderNumber}`);
      return false;
    }

    // The ONLY people told about this order are staff of the merchant that owns
    // the store the order was placed at — the merchant_id comes from the store
    // row itself, never from anything the client sent.
    const { data: staff, error: staffError } = await admin
      .from("merchant_staff")
      .select("user_id")
      .eq("merchant_id", store.merchant_id);
    if (staffError) console.error("notifyOrderPlaced: merchant_staff lookup failed", staffError);

    const staffLookups = await Promise.allSettled(
      ((staff ?? []) as { user_id: string }[]).map((s) => admin.auth.admin.getUserById(s.user_id)),
    );
    const staffEmails = [
      ...new Set(
        staffLookups
          .map((r) => (r.status === "fulfilled" ? r.value.data?.user?.email : null))
          .filter((e): e is string => Boolean(e)),
      ),
    ];
    for (const r of staffLookups) {
      if (r.status === "rejected") console.error("notifyOrderPlaced: staff address lookup failed", r.reason);
    }

    const items = (itemsRes.data ?? []) as {
      product_name: string;
      variant_name: string | null;
      quantity: number;
      line_total: number;
    }[];
    const itemRows: [string, string][] = items.map((it) => [
      esc(`${it.quantity}× ${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ""}`),
      rs(it.line_total),
    ]);

    const hold = holdInfo((orderRes.data as { auto_release_at: string | null } | null)?.auto_release_at);
    const providerLabel = PROVIDER_LABEL[input.provider] ?? input.provider;
    const fulfillmentLabel = FULFILLMENT_LABEL[input.fulfillment] ?? input.fulfillment;

    // ── Merchant side ──
    const merchantDetails: [string, string][] = [
      ...itemRows,
      ["Total", rs(input.total)],
      ["Payment", providerLabel],
      ["Fulfillment", fulfillmentLabel],
      ["Customer", esc(`${input.customerName} — ${input.customerPhone}`)],
      ...(hold ? ([["Accept by", holdDeadlineLabel(hold)]] as [string, string][]) : []),
    ];
    const merchantTitle = `New order ${input.orderNumber} — ${store.name}`;
    const merchantBody = hold
      ? merchantHoldCopy(input.provider, hold)
      : "A new order has been placed at your shop.";

    const merchantEmailSends = staffEmails.map((email) =>
      dispatchNotification({
        recipientType: "merchant",
        recipientEmail: email,
        orderNumber: input.orderNumber,
        type: "order_created",
        title: merchantTitle,
        body: merchantBody,
        details: merchantDetails,
        cta: { url: `${SITE_URL}/merchant/orders/${input.orderId}`, label: "Open in your dashboard →" },
        channels: ["email"],
        emailType: "marketplace_merchant_notification",
        // Keyed per RECIPIENT, because this is a fan-out: if the claim is
        // released and re-swept, staff already notified are deduped and only the
        // ones actually missed are emailed again.
        idempotencyKey: `marketplace_merchant_notification:${input.orderId}:${email.toLowerCase()}`,
        orderId: input.orderId,
      }),
    );
    // Exactly ONE owner WhatsApp ping per order, however many staff there are.
    const ownerPingSend = dispatchNotification({
      recipientType: "merchant",
      orderNumber: input.orderNumber,
      type: "order_created",
      title: merchantTitle,
      body: `${rs(input.total)} · ${providerLabel} · ${fulfillmentLabel} · ${input.customerName}`,
      channels: ["whatsapp"],
    });

    // ── Customer side ──
    const customerSend = input.customerEmail
      ? dispatchNotification({
          recipientType: "customer",
          recipientEmail: input.customerEmail,
          orderNumber: input.orderNumber,
          type: "order_created",
          title: `Order ${input.orderNumber} placed`,
          body: hold
            ? customerHoldCopy(input.provider, hold)
            : "Your order has been placed. The shop will confirm it shortly.",
          details: [
            ...itemRows,
            ["Total", rs(input.total)],
            ["Payment", providerLabel],
            ["Fulfillment", fulfillmentLabel],
            ...(hold ? ([["Reserved until", holdDeadlineLabel(hold)]] as [string, string][]) : []),
          ],
          // The order page carries the shop's bank details and the receipt
          // upload — the actionable half of "payment instructions". A GUEST
          // has no session, so /orders/[id] would bounce them to sign-in; they
          // get the account-free tracking page instead (M20).
          // ?ref= carries only the order NUMBER, never the address: the email
          // is still typed on arrival, so the link on its own discloses
          // nothing, and the customer is spared retyping a 14-character
          // reference on a phone — which is the single most likely place an
          // elderly or hurried guest gives up (M21).
          cta: {
            url: input.isGuest
              ? `${SITE_URL}/orders/track?ref=${encodeURIComponent(input.orderNumber)}`
              : `${SITE_URL}/orders/${input.orderId}`,
            label: "Track your order →",
          },
          channels: ["email"],
          emailType: "marketplace_order_confirmation",
          idempotencyKey: `marketplace_order_confirmation:${input.orderId}`,
          orderId: input.orderId,
        })
      : null;

    const [merchantResults, ownerPinged, customerDelivered] = await Promise.all([
      Promise.allSettled(merchantEmailSends),
      ownerPingSend,
      customerSend,
    ]);
    const merchantReached =
      merchantResults.some((r) => r.status === "fulfilled" && r.value === true) || ownerPinged === true;

    if (!merchantReached) {
      console.error(`notifyOrderPlaced: NO merchant-side delivery succeeded for order ${input.orderNumber}`);
    }
    if (input.customerEmail && customerDelivered !== true) {
      console.error(`notifyOrderPlaced: customer email failed for order ${input.orderNumber}`);
    }

    return merchantReached && (!input.customerEmail || customerDelivered === true);
  } catch (err) {
    console.error(`notifyOrderPlaced failed for order ${input.orderNumber}`, err);
    return false;
  }
}

// The route hands us its session-scoped client: both RPCs are SECURITY DEFINER
// and re-verify that auth.uid() owns the order, so the customer's own session
// is exactly the right principal to claim with.
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

/**
 * The whole M17 send path: claim → notify → release-on-failure. A false claim
 * (idempotent retry, concurrent duplicate submit, or a crashed earlier attempt
 * that kept its claim) sends nothing. Never throws — an email problem must
 * never surface to a customer whose order has already been placed.
 */
export async function claimAndNotifyOrderPlaced(supabase: RpcClient, input: OrderPlacedInput): Promise<void> {
  let claimed = false;
  try {
    const { data, error } = await supabase.rpc("claim_order_notification", { p_order_id: input.orderId });
    if (error) {
      console.error("claim_order_notification failed", error);
      return;
    }
    claimed = data === true;
    if (!claimed) return;

    const delivered = await notifyOrderPlaced(input);
    if (!delivered) {
      const { error: releaseError } = await supabase.rpc("release_order_notification", {
        p_order_id: input.orderId,
      });
      if (releaseError) console.error("release_order_notification failed", releaseError);
    }
  } catch (err) {
    console.error(`order-placed notification failed for order ${input.orderNumber}`, err);
    // Only hand back a claim WE hold — releasing on a failed claim call could
    // clobber a concurrent caller that claimed and sent successfully.
    if (claimed) {
      try {
        await supabase.rpc("release_order_notification", { p_order_id: input.orderId });
      } catch (releaseErr) {
        console.error("release_order_notification failed after send error", releaseErr);
      }
    }
  }
}
