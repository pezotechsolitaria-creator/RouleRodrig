"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import PayPalPay from "@/components/PayPalPay";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

type Provider = "paypal" | "cash" | "mcb_juice";
type Fulfillment = "pickup" | "delivery";

export default function CheckoutForm({
  defaultName, defaultPhone,
}: { defaultName: string; defaultPhone: string }) {
  const { cart, hydrated, clear } = useCart();
  const router = useRouter();

  const [resolved, setResolved] = useState<ResolvedCartItem[] | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [fulfillmentOptions, setFulfillmentOptions] = useState<{ pickup: boolean; delivery: boolean }>({ pickup: true, delivery: false });

  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [notes, setNotes] = useState("");
  const [provider, setProvider] = useState<Provider>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<{ orderId: string; total: number } | null>(null);

  // Gated on `hydrated`, not just `cart` — CartProvider always renders
  // cart=null on the very first client render (localStorage isn't read
  // until its own effect fires), so treating "no cart yet" as "genuinely
  // empty" here caused a real bug: this effect would resolve an empty cart
  // immediately, and by the time the real cart arrived a moment later nothing
  // re-triggered a fetch in time for the flash to have already committed
  // "Rs 0.00" as fetched, live-verified failure. Waiting for `hydrated`
  // removes the ambiguous null state entirely instead of racing around it.
  const cartKey = cart?.items.map((i) => `${i.variantId}:${i.quantity}`).join(",") ?? "";
  useEffect(() => {
    if (!hydrated) return;
    if (!cart || cart.items.length === 0) {
      setResolved([]);
      setLoadingCart(false);
      return;
    }
    let cancelled = false;
    setLoadingCart(true);
    fetch("/api/cart/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.items }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setResolved(body.items ?? []);
        if (body.fulfillment) {
          setFulfillmentOptions(body.fulfillment);
          if (!body.fulfillment.pickup && body.fulfillment.delivery) setFulfillment("delivery");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCart(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartKey]);

  if (!hydrated || loadingCart) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-40 w-full rounded-xl bg-white/[0.04]" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
        <h2 className="font-syne text-lg font-bold text-offwhite">Your cart is empty</h2>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">Add something to your cart before checking out.</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 font-dm text-sm text-yellow hover:underline">
          Browse shops
        </Link>
      </div>
    );
  }

  const subtotal = (resolved ?? []).reduce((sum, i) => sum + i.price * i.requestedQuantity, 0);
  const hasIssue = (resolved ?? []).some(
    (i) => !i.isActive || i.productStatus !== "active" || i.stockQuantity < i.requestedQuantity,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cart || hasIssue) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: cart.storeId,
          items: cart.items,
          customerName: name,
          customerPhone: phone,
          fulfillment,
          notes: notes || undefined,
          provider,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Checkout failed.");

      if (provider === "paypal") {
        // Don't clear the cart yet — PayPalPay still needs to run; the cart
        // clears once payment is actually confirmed (onPaid below).
        setPlacedOrder({ orderId: body.order_id, total: body.total });
      } else {
        clear();
        toast.success("Order placed!");
        router.push(`/orders/${body.order_id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (placedOrder) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="font-syne text-lg font-bold text-offwhite">Complete payment</h2>
        <p className="mt-1 font-dm text-sm text-muted">Your order is reserved — pay now to confirm it.</p>
        <div className="mt-4">
          <PayPalPay
            referenceId={placedOrder.orderId}
            amountMur={placedOrder.total}
            kind="order"
            onPaid={() => {
              clear();
              setTimeout(() => router.push(`/orders/${placedOrder.orderId}`), 1200);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ITEMS</p>
        <div className="mt-2 space-y-1 rounded-xl border border-white/10 bg-dark-card p-3">
          {(resolved ?? []).map((i) => (
            <div key={i.variantId} className="flex justify-between font-dm text-sm">
              <span className="text-offwhite">{i.productName} × {i.requestedQuantity}</span>
              <span className="text-muted">Rs {centsToDecimalString(i.price * i.requestedQuantity)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-dm text-sm font-bold">
            <span className="text-offwhite">Subtotal</span>
            <span className="text-yellow">Rs {centsToDecimalString(subtotal)}</span>
          </div>
        </div>
        {hasIssue && (
          <p className="mt-2 font-dm text-xs text-red-400">
            Some items in your cart are no longer available.{" "}
            <Link href="/cart" className="underline">Review your cart</Link>.
          </p>
        )}
      </div>

      <div>
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">YOUR DETAILS</p>
        <div className="mt-2 space-y-3">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            aria-label="Full name"
            className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
          />
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            aria-label="Phone number"
            className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
          />
        </div>
      </div>

      <div>
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">FULFILLMENT</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["pickup", "delivery"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFulfillment(f)}
              disabled={!fulfillmentOptions[f] && fulfillment !== f}
              className={`rounded-xl border px-4 py-3 text-center font-dm text-sm capitalize transition-colors ${
                fulfillment === f ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 text-offwhite hover:bg-white/[0.04]"
              } disabled:opacity-40`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ORDER NOTES</label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the shop should know? (optional)"
          rows={2}
          maxLength={1000}
          className="mt-2"
        />
      </div>

      <div>
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">PAYMENT</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setProvider("cash")}
            className={`rounded-xl border px-4 py-3 text-center font-dm text-sm transition-colors ${
              provider === "cash" ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 text-offwhite hover:bg-white/[0.04]"
            }`}
          >
            Cash on {fulfillment === "delivery" ? "delivery" : "pickup"}
          </button>
          <button
            type="button"
            onClick={() => setProvider("paypal")}
            className={`rounded-xl border px-4 py-3 text-center font-dm text-sm transition-colors ${
              provider === "paypal" ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 text-offwhite hover:bg-white/[0.04]"
            }`}
          >
            Card (PayPal)
          </button>
        </div>
      </div>

      {error && <p className="font-dm text-sm text-red-400">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting || hasIssue}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : `Place order — Rs ${centsToDecimalString(subtotal)}`}
      </Button>
    </form>
  );
}
