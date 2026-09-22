import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachmentsFor, type EmailAttachment } from "@/lib/receiptly/attach";
import { islandToday, marketplaceOrderDoc } from "@/lib/receiptly/documents";
import { FULFILLMENT_LABEL } from "@/lib/orders/location";

// ── THE SHOP ORDER, AS A DOCUMENT ───────────────────────────────────────────
//
// The marketplace already emails a good itemised order email. What it never
// gave anybody was a FILE: something to keep, forward to whoever is paying, or
// show at the counter. This builds it from the order's own rows, so the PDF and
// the email are two renderings of one set of figures rather than two
// arithmetics that can disagree.
//
// EVERY FIGURE IS CENTS here — orders.total, orders.subtotal, orders.tax,
// orders.delivery_fee and order_items.line_total, all of them, per
// lib/invoicing/subjects.ts. The adapter's parameters say so in their names.

/**
 * Build the attachment for an order, or return an empty list.
 *
 * Empty for every reason that is not worth failing an email over: the order is
 * gone, the items could not be read, the renderer refused. The order email is
 * the load-bearing half and goes out regardless.
 */
export async function orderDocumentAttachments(
  admin: SupabaseClient,
  orderId: string,
  kind: "confirmation" | "receipt",
): Promise<EmailAttachment[]> {
  try {
    const [orderRes, itemsRes] = await Promise.all([
      admin
        .from("orders")
        .select("id, order_number, customer_name, customer_email, customer_phone, subtotal, tax, delivery_fee, total, fulfillment_method, stores(name)")
        .eq("id", orderId)
        .maybeSingle(),
      admin
        .from("order_items")
        .select("product_name, variant_name, quantity, line_total")
        .eq("order_id", orderId),
    ]);

    if (orderRes.error || !orderRes.data) return [];
    const o = orderRes.data as unknown as {
      order_number: string;
      customer_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      subtotal: number | null;
      tax: number | null;
      delivery_fee: number | null;
      total: number;
      fulfillment_method: string | null;
      stores: { name: string } | { name: string }[] | null;
    };
    if (itemsRes.error) return [];

    const items = (itemsRes.data ?? []) as {
      product_name: string;
      variant_name: string | null;
      quantity: number;
      line_total: number;
    }[];
    const store = Array.isArray(o.stores) ? o.stores[0] : o.stores;

    return attachmentsFor(
      marketplaceOrderDoc({
        kind,
        orderNumber: o.order_number,
        customerName: o.customer_name ?? "",
        customerEmail: o.customer_email,
        customerPhone: o.customer_phone,
        // line_total = unit_price x quantity on every live row, and
        // subtotal + tax + delivery_fee = total on every live order — both
        // checked against the eight real orders before this was written. So
        // the lines add up to orders.total exactly, and the adapter's
        // reconciliation row is a tripwire rather than a routine correction.
        items: items.map((it) => ({
          name: it.product_name,
          variant: it.variant_name,
          quantity: it.quantity,
          lineTotalCents: it.line_total,
        })),
        deliveryFeeCents: o.delivery_fee,
        taxCents: o.tax,
        totalCents: o.total,
        // A receipt is issued when the shop has confirmed the money; an order
        // that has only been placed has been paid for by nobody yet, whatever
        // the provider, because every marketplace payment here is settled by
        // hand.
        paidCents: kind === "receipt" ? o.total : 0,
        fulfillmentLabel: o.fulfillment_method
          ? (FULFILLMENT_LABEL[o.fulfillment_method] ?? o.fulfillment_method)
          : null,
        storeName: store?.name ?? null,
        issuedOn: islandToday(),
      }),
    );
  } catch (err) {
    console.error("order document failed", { orderId, kind, err });
    return [];
  }
}
