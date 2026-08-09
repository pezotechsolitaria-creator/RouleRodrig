"use client";

import { useState } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, User, Phone, CreditCard, Ticket, StickyNote, Check, Loader2, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrder, useUpdateOrder, orderKeys } from "@/lib/merchant/orders";
import PaymentConfirmCard from "./PaymentConfirmCard";
import DeliveryLocationCard from "./DeliveryLocationCard";
import { STATUS_LABEL, legalNextStatuses, type OrderStatus } from "@/lib/orders/status";
import { centsToDecimalString } from "@/lib/money";
import { holdInfo, merchantHoldCopy, type PaymentProvider } from "@/lib/orders/hold";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import OrderTimeline from "@/components/orders/OrderTimeline";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Forward transitions get the primary (gold) treatment; "cancelled" is
// always the destructive/secondary action and always asks for confirmation
// first — an accidental tap can't cancel a real order.
//
// "paid" is deliberately ABSENT. It used to render a gold header button reading
// "Confirm payment received" — visually identical to, and more prominent than,
// the one inside PaymentConfirmCard, but wired to update_order_status instead of
// confirm_order_payment. Merchants naturally hit the bigger one. Payment
// confirmation now happens in exactly one place, the card that also shows the
// receipt and the amount, so there is no ambiguity about which control settles
// the money. (The database no longer lets the two diverge either — see
// m9_status_paid_captures_payment — but one button is still the right UI.)
const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  preparing: "Accept order",
  ready_for_pickup: "Mark ready for pickup",
  collected: "Mark collected",
  cancelled: "Cancel order",
};

export default function OrderDetail({ id }: { id: string }) {
  const { data: order, isLoading, isError, error } = useOrder(id);
  const queryClient = useQueryClient();
  const updateOrder = useUpdateOrder(id);
  const [note, setNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [accepting, setAccepting] = useState(false);

  // Accepting an order is NOT a status change — accepted_at is metadata, so this
  // deliberately does not go through useUpdateOrder. It commits the shop to
  // fulfilling the order and stops the reservation clock without asserting that
  // any money arrived (M14). No optimistic update: the server owns accepted_at
  // and the countdown is derived from it, so showing a guessed value would mean
  // rendering a deadline that does not exist. The RPC is idempotent, so a
  // double-tap or a retry is harmless.
  async function acceptOrder() {
    setAccepting(true);
    try {
      const r = await fetch(`/api/merchant/orders/${id}/accept`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error ?? "Failed to accept order.");
      await queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      posthog.capture("merchant_order_accepted", { order_id: id });
      toast.success("Order accepted. The customer has been told.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept order.");
    } finally {
      setAccepting(false);
    }
  }

  async function applyStatus(status: OrderStatus) {
    try {
      await updateOrder.mutateAsync({ status });
      posthog.capture("merchant_order_status_updated", { order_id: id, status });
      toast.success(`Order marked "${STATUS_LABEL[status]}".`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update order.");
    }
  }

  async function submitNote() {
    const trimmed = note.trim();
    if (!trimmed) return;
    try {
      await updateOrder.mutateAsync({ internalNote: trimmed });
      setNote("");
      toast.success("Note added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add note.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-8">
        <Skeleton className="h-6 w-40 bg-white/[0.04]" />
        <Skeleton className="h-24 w-full rounded-2xl bg-white/[0.04]" />
        <Skeleton className="h-40 w-full rounded-2xl bg-white/[0.04]" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="py-8">
        <Link href="/merchant/orders" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Back to orders
        </Link>
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6 text-center">
          <p className="font-dm text-sm text-red-400">{error instanceof Error ? error.message : "Order not found."}</p>
        </div>
      </div>
    );
  }

  const nextStatuses = legalNextStatuses(order.status).filter((s) => s !== order.status);
  // "paid" is excluded here, not just from ACTION_LABEL — the label lookup falls
  // back to `Mark ${STATUS_LABEL[s]}`, so leaving it in would simply render
  // "Mark Paid" and reintroduce the duplicate confirmation control. Settling a
  // payment belongs to PaymentConfirmCard alone, which shows the receipt and the
  // amount alongside the button.
  const forward = nextStatuses.filter((s) => s !== "cancelled" && s !== "paid");
  const canCancel = nextStatuses.includes("cancelled");
  // Acceptance is available while the order is still holding stock and has not
  // already been accepted. Reading accepted_at from the server rather than
  // inferring it from status keeps this honest — the two are independent.
  const canAccept =
    !order.accepted_at &&
    (order.status === "pending_payment" || order.status === "awaiting_payment_confirmation");
  const hold = holdInfo(order.auto_release_at);
  // The newest token, which is the only one that can be live: ensure_pickup_code
  // reuses an unredeemed, unexpired code rather than minting a second one.
  const pickup = order.qr_pickup_tokens.slice().sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0] ?? null;

  return (
    <div className="py-8">
      <Link href="/merchant/orders" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
        <ArrowLeft size={14} /> Back to orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ORDER</p>
          <h1 className="mt-0.5 font-syne text-2xl font-extrabold text-offwhite">{order.order_number}</h1>
        </div>
        <div className="flex gap-2">
          {/* The primary action on a new order. Before M15 this row could be
              completely EMPTY: legalNextStatuses('pending_payment') returns
              exactly ['paid','cancelled'] and `forward` filters out both, so a
              merchant opening a brand-new order was offered nothing to do. */}
          {canAccept && (
            <Button onClick={acceptOrder} disabled={accepting}>
              {accepting ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Check size={15} className="mr-1.5" />}
              Accept order
            </Button>
          )}
          {forward.map((s) => (
            <Button key={s} onClick={() => applyStatus(s)} disabled={updateOrder.isPending}>
              {ACTION_LABEL[s] ?? `Mark ${STATUS_LABEL[s]}`}
            </Button>
          ))}
          {canCancel && (
            <Button
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              disabled={updateOrder.isPending}
              onClick={() => setConfirmCancel(true)}
            >
              {ACTION_LABEL.cancelled}
            </Button>
          )}
        </div>
      </div>

      {/* Reservation clock. Derived from the server's auto_release_at, never
          from browser time — a merchant with a skewed device clock would
          otherwise be told they had longer than they do, which is the one
          direction that costs them the sale. Disappears once accepted, because
          accept_order() nulls auto_release_at and there is nothing left to
          count down. */}
      {hold && !order.accepted_at && (
        <div
          role="status"
          className={`mt-4 flex items-start gap-2.5 rounded-2xl border p-4 ${
            hold.expired
              ? "border-red-500/30 bg-red-500/[0.07]"
              : hold.urgent
                ? "border-red-500/25 bg-red-500/[0.05]"
                : "border-yellow/25 bg-yellow/[0.06]"
          }`}
        >
          <Clock size={16} className={hold.expired || hold.urgent ? "mt-0.5 text-red-400" : "mt-0.5 text-yellow"} />
          <p className="font-dm text-sm leading-relaxed text-offwhite/85">
            {merchantHoldCopy(order.payments[0]?.provider as PaymentProvider | undefined, hold)}
          </p>
        </div>
      )}

      {order.accepted_at && (
        <div role="status" className="mt-4 flex items-center gap-2.5 rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-4">
          <Check size={16} className="text-green-400" />
          <p className="font-dm text-sm text-offwhite/85">
            Accepted{" "}
            {new Date(order.accepted_at).toLocaleString("en-GB", {
              timeZone: "Indian/Mauritius",
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}
            . The stock is yours to hold — this order will not expire.
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5">
        <OrderTimeline status={order.status} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-dark-card">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="font-syne text-sm font-bold text-offwhite">Items</h2>
            </div>
            <table className="w-full text-left">
              <tbody>
                {order.order_items.map((item) => (
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
              <div className="flex justify-between text-muted"><span>Subtotal</span><span>Rs {centsToDecimalString(order.subtotal)}</span></div>
              {order.discount > 0 && (
                <div className="flex justify-between text-muted"><span>Discount</span><span>-Rs {centsToDecimalString(order.discount)}</span></div>
              )}
              {order.tax > 0 && (
                <div className="flex justify-between text-muted"><span>Tax</span><span>Rs {centsToDecimalString(order.tax)}</span></div>
              )}
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-muted"><span>Delivery</span><span>Rs {centsToDecimalString(order.delivery_fee)}</span></div>
              )}
              <div className="flex justify-between pt-1 font-bold text-offwhite"><span>Total</span><span>Rs {centsToDecimalString(order.total)}</span></div>
            </div>
          </div>

          {/* Internal notes */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
            <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
              <StickyNote size={14} className="text-yellow" /> Internal notes
            </h2>
            <p className="mt-0.5 font-dm text-xs text-muted">Only visible to your shop staff — never shown to the customer.</p>
            {order.internal_notes && (
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-3 font-dm text-xs text-offwhite/90">
                {order.internal_notes}
              </pre>
            )}
            <div className="mt-3 flex gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note for your team…"
                rows={2}
                className="flex-1"
                maxLength={2000}
                aria-label="New internal note"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={submitNote} disabled={!note.trim() || updateOrder.isPending}>
                Add note
              </Button>
            </div>
          </div>
        </div>

        {/* Customer + payment */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <h2 className="font-syne text-sm font-bold text-offwhite">Customer</h2>
            <div className="mt-3 space-y-2 font-dm text-sm">
              <p className="flex items-center gap-2 text-offwhite"><User size={14} className="text-muted" /> {order.customer_name ?? "—"}</p>
              {order.customer_phone && (
                <p className="flex items-center gap-2 text-offwhite"><Phone size={14} className="text-muted" /> {order.customer_phone}</p>
              )}
            </div>
            {order.notes && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="font-dm text-xs text-muted">Customer note</p>
                <p className="mt-1 font-dm text-sm text-offwhite/90">{order.notes}</p>
              </div>
            )}
          </div>

          {order.payments.length > 0 ? (
            <PaymentConfirmCard
              orderId={order.id}
              provider={order.payments[0].provider}
              paymentStatus={order.payments[0].status}
              orderStatus={order.status}
              amount={order.payments[0].amount}
              hasReceipt={!!order.payment_receipt_path}
              receiptSubmittedAt={order.receipt_submitted_at}
              onConfirmed={() => queryClient.invalidateQueries({ queryKey: orderKeys.detail(order.id) })}
            />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
              <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
                <CreditCard size={14} className="text-yellow" /> Payment
              </h2>
              <p className="mt-3 font-dm text-sm text-muted">No payment recorded.</p>
            </div>
          )}

          <DeliveryLocationCard
            fulfillmentMethod={order.fulfillment_method}
            lat={order.delivery_lat}
            lng={order.delivery_lng}
            orderNumber={order.order_number}
            customerName={order.customer_name}
            instructions={order.delivery_instructions}
            deliveryFee={order.delivery_fee}
            zoneName={order.delivery_zones?.name ?? null}
          />

          {/* The merchant sees the STATE of the handover, never the code
              itself — M28 revoked the column grant so no client role can read
              another customer's code. Redeeming happens at the top of the
              orders list, where the merchant types what the customer shows. */}
          {pickup && (
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
              <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
                <Ticket size={14} className="text-yellow" /> Pickup code
              </h2>
              <p className="mt-3 font-dm text-xs text-muted">
                {pickup.redeemed_at
                  ? `Redeemed ${new Date(pickup.redeemed_at).toLocaleString()} — the customer collected this order.`
                  : new Date(pickup.expires_at) <= new Date()
                    ? "Expired. Use the status button above to close the order."
                    : "Issued and unused. The customer has it on their order screen."}
              </p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {order.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer will be notified. This can&apos;t be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmCancel(false); applyStatus("cancelled"); }}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
