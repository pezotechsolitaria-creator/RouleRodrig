import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, User, Phone, CreditCard, QrCode, MapPin, Truck, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/file-signature";
import { centsToDecimalString } from "@/lib/money";
import OrderTimeline from "@/components/orders/OrderTimeline";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { FULFILLMENT_LABEL, googleMapsLink, formatCoords } from "@/lib/orders/location";
import BankTransferPanel, { type BankDetails } from "@/components/orders/BankTransferPanel";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The untyped Supabase client can't statically parse a 4-embed select string
// (falls back to an unusable GenericStringError type) — same workaround as
// ProductDetail elsewhere in this codebase: fetch, then assert the real shape.
type CustomerOrderDetail = {
  id: string;
  order_number: string;
  status: OrderStatus;
  notes: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  placed_at: string | null;
  created_at: string;
  fulfillment_method: string | null;
  delivery_fee: number;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_instructions: string | null;
  payment_receipt_path: string | null;
  receipt_submitted_at: string | null;
  store_id: string;
  stores: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
  order_items: {
    id: string; product_name: string; variant_name: string | null; sku: string | null;
    unit_price: number; quantity: number; line_total: number;
  }[];
  payments: { id: string; provider: string; amount: number; currency: string; status: string; created_at: string }[];
  qr_pickup_tokens: { id: string; issued_at: string; expires_at: string; redeemed_at: string | null }[];
};

export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/orders/${id}`);

  // Scoped to the caller's own orders by construction (same pattern as the
  // merchant detail page and the /api/customer/orders/[id] route) — a
  // mismatched id renders notFound(), never another customer's order.
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, notes, subtotal, discount, tax, total, currency, placed_at, created_at, store_id, " +
        "fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, payment_receipt_path, receipt_submitted_at, " +
        "stores(name, phone), " +
        "order_items(id, product_name, variant_name, sku, unit_price, quantity, line_total), " +
        "payments(id, provider, amount, currency, status, created_at), " +
        "qr_pickup_tokens(id, issued_at, expires_at, redeemed_at)",
    )
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();

  // A query FAILURE and a genuinely missing order are different answers and the
  // customer must not be given the wrong one. Discarding `error` here meant a
  // transient database fault told someone their real, paid order did not exist
  // — and this page is where a bank-transfer customer reads the payment
  // instructions, so they would lose both the order and the ability to pay it.
  // Throwing renders app/error.tsx ("something went wrong, try again"), which
  // is recoverable; notFound() is not.
  if (error) {
    console.error("load customer order failed", { orderId: id, error });
    throw new Error("Could not load this order.");
  }
  if (!order) notFound();
  const typedOrder = order as unknown as CustomerOrderDetail;

  const store = Array.isArray(typedOrder.stores) ? typedOrder.stores[0] : typedOrder.stores;
  const payment = typedOrder.payments[0];
  const isBankTransfer = payment?.provider === "bank_transfer";
  const awaitingConfirmation = typedOrder.status === "awaiting_payment_confirmation";
  // Show payment instructions only while money is still owed. Once the merchant
  // confirms, the bank panel disappears rather than inviting a second transfer.
  const showBankPanel = isBankTransfer && (typedOrder.status === "pending_payment" || awaitingConfirmation);

  // Bank details come from store_bank_details(), not from the table.
  //
  // The RLS policy is visibility-based, so before M8 any signed-in user could
  // read bank_name / account_holder / account_number for every live shop
  // without ordering anything — marketplace-wide harvesting of exactly the
  // fields an impersonation scam needs. The columns are now withheld and the
  // accessor releases them only to store staff, a platform admin, or a customer
  // who actually has an order with that shop. This page qualifies on the last
  // count, which is the only moment the details are needed anyway.
  let bank: BankDetails | null = null;
  if (showBankPanel) {
    const { data, error } = await supabase
      .rpc("store_bank_details", { p_store_id: typedOrder.store_id })
      .maybeSingle();
    if (error) console.error("store_bank_details failed", error);
    bank = (data as BankDetails | null) ?? null;
  }

  const hasGps = typedOrder.delivery_lat != null && typedOrder.delivery_lng != null;

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-3xl">
        <Link href="/orders" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Back to orders
        </Link>

        <div className="mt-3">
          <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ORDER</p>
          <h1 className="mt-0.5 font-syne text-2xl font-extrabold text-offwhite">{typedOrder.order_number}</h1>
          {store && <p className="mt-1 font-dm text-sm text-muted">from {(store as { name?: string }).name}</p>}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5">
          <OrderTimeline status={typedOrder.status as OrderStatus} />
          <p className="mt-3 text-center font-dm text-xs text-muted">
            Status: <span className="text-offwhite">{STATUS_LABEL[typedOrder.status as OrderStatus]}</span>
          </p>
        </div>

        {showBankPanel && (
          <div className="mt-4">
            <BankTransferPanel
              orderId={typedOrder.id}
              orderNumber={typedOrder.order_number}
              amount={typedOrder.total}
              bank={bank}
              awaitingConfirmation={awaitingConfirmation}
            />
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-white/10 bg-dark-card">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="font-syne text-sm font-bold text-offwhite">Items</h2>
          </div>
          <table className="w-full text-left">
            <tbody>
              {typedOrder.order_items.map((item) => (
                <tr key={item.id} className="border-b border-white/5 font-dm text-sm text-offwhite last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.product_name}</p>
                    {item.variant_name && <p className="text-xs text-muted">{item.variant_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted">× {item.quantity}</td>
                  <td className="px-4 py-3 text-right text-muted">Rs {centsToDecimalString(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-medium">Rs {centsToDecimalString(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 border-t border-white/10 px-4 py-3 font-dm text-sm">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span>Rs {centsToDecimalString(typedOrder.subtotal)}</span></div>
            {typedOrder.discount > 0 && (
              <div className="flex justify-between text-muted"><span>Discount</span><span>-Rs {centsToDecimalString(typedOrder.discount)}</span></div>
            )}
            {typedOrder.tax > 0 && (
              <div className="flex justify-between text-muted"><span>Tax</span><span>Rs {centsToDecimalString(typedOrder.tax)}</span></div>
            )}
            {typedOrder.delivery_fee > 0 && (
              <div className="flex justify-between text-muted"><span>Delivery</span><span>Rs {centsToDecimalString(typedOrder.delivery_fee)}</span></div>
            )}
            <div className="flex justify-between pt-1 font-bold text-offwhite"><span>Total</span><span>Rs {centsToDecimalString(typedOrder.total)}</span></div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {store && (
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
              <h2 className="font-syne text-sm font-bold text-offwhite">Shop</h2>
              <div className="mt-3 space-y-2 font-dm text-sm">
                <p className="flex items-center gap-2 text-offwhite"><User size={14} className="text-muted" /> {(store as { name?: string }).name}</p>
                {(store as { phone?: string }).phone && (
                  <p className="flex items-center gap-2 text-offwhite"><Phone size={14} className="text-muted" /> {(store as { phone?: string }).phone}</p>
                )}
              </div>
              {typedOrder.notes && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="font-dm text-xs text-muted">Your note</p>
                  <p className="mt-1 font-dm text-sm text-offwhite/90">{typedOrder.notes}</p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
              <CreditCard size={14} className="text-yellow" /> Payment
            </h2>
            <div className="mt-3 space-y-2">
              {typedOrder.payments.length === 0 && <p className="font-dm text-sm text-muted">No payment recorded.</p>}
              {typedOrder.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between font-dm text-sm">
                  <span className="capitalize text-muted">{p.provider.replace("_", " ")}</span>
                  <span className="text-offwhite">{p.status} · Rs {centsToDecimalString(p.amount)}</span>
                </div>
              ))}
              {isBankTransfer && (
                <p className="flex items-center gap-1.5 border-t border-white/10 pt-2 font-dm text-xs text-muted">
                  <Receipt size={12} />
                  {typedOrder.receipt_submitted_at
                    ? `Receipt sent ${new Date(typedOrder.receipt_submitted_at).toLocaleDateString()}`
                    : "No receipt sent yet"}
                </p>
              )}
            </div>
          </div>

          {typedOrder.fulfillment_method && (
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4 sm:col-span-2">
              <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
                <Truck size={14} className="text-yellow" /> Delivery
              </h2>
              <p className="mt-2 font-dm text-sm text-offwhite">
                {FULFILLMENT_LABEL[typedOrder.fulfillment_method] ?? typedOrder.fulfillment_method}
              </p>
              {hasGps && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 font-dm text-xs text-muted">
                    <MapPin size={12} /> {formatCoords(typedOrder.delivery_lat!, typedOrder.delivery_lng!)}
                  </span>
                  <a
                    href={googleMapsLink(typedOrder.delivery_lat!, typedOrder.delivery_lng!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/15 px-3 py-1 font-dm text-xs text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
                  >
                    View on map
                  </a>
                </div>
              )}
              {typedOrder.delivery_instructions && (
                <p className="mt-2 font-dm text-xs text-muted">{typedOrder.delivery_instructions}</p>
              )}
            </div>
          )}

          {typedOrder.qr_pickup_tokens.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4 sm:col-span-2">
              <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
                <QrCode size={14} className="text-yellow" /> Pickup
              </h2>
              <div className="mt-3 space-y-1 font-dm text-xs text-muted">
                {typedOrder.qr_pickup_tokens.map((t) => (
                  <p key={t.id}>{t.redeemed_at ? `Redeemed ${new Date(t.redeemed_at).toLocaleString()}` : "Not yet redeemed"}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
