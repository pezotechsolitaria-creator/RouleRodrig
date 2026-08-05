"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, AlertTriangle, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

type Provider = "cash" | "bank_transfer";
type Fulfillment = "pickup" | "customer_delivery" | "rr_delivery";
type Quote = { subtotal: number; tax: number; delivery_fee: number; total: number; currency: string };
type Coords = { lat: number; lng: number };

const FULFILLMENT_COPY: Record<Fulfillment, { label: string; hint: string }> = {
  pickup: { label: "Pickup", hint: "Collect from the shop. No delivery fee." },
  customer_delivery: { label: "My own delivery", hint: "You arrange a driver. No delivery fee." },
  rr_delivery: { label: "Roulé Rodrigues delivery", hint: "Our team delivers to you." },
};

export default function CheckoutForm({
  defaultName, defaultPhone,
}: { defaultName: string; defaultPhone: string }) {
  const { cart, hydrated, clear } = useCart();
  const router = useRouter();

  const [resolved, setResolved] = useState<ResolvedCartItem[] | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  // Bug 2: a failed cart load must never look like an empty/free cart.
  const [cartError, setCartError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [storeOffersDelivery, setStoreOffersDelivery] = useState(true);

  // Bug 1: the payable amount comes from the server, never from arithmetic here.
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [provider, setProvider] = useState<Provider>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cartKey = cart?.items.map((i) => `${i.variantId}:${i.quantity}`).join(",") ?? "";

  // ── Load the cart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    if (!cart || cart.items.length === 0) {
      setResolved([]);
      setLoadingCart(false);
      return;
    }
    let cancelled = false;
    setLoadingCart(true);
    setCartError(null);
    fetch("/api/cart/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.items }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "We couldn't load your cart.");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setResolved(body.items ?? []);
        if (body.fulfillment) setStoreOffersDelivery(!!body.fulfillment.delivery);
      })
      .catch((e) => {
        if (cancelled) return;
        // Leave `resolved` null so nothing renders a price.
        setResolved(null);
        setCartError(e instanceof Error ? e.message : "We couldn't load your cart.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCart(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartKey, reloadKey]);

  // ── Price it, server-side ────────────────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (!cart || cart.items.length === 0) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      const r = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: cart.storeId, items: cart.items, fulfillment }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "We couldn't price your order.");
      setQuote(body);
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : "We couldn't price your order.");
    } finally {
      setQuoting(false);
    }
  }, [cart, fulfillment]);

  useEffect(() => {
    if (!hydrated || cartError || !resolved || resolved.length === 0) return;
    void fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartKey, fulfillment, resolved, cartError]);

  function shareLocation() {
    if (!navigator.geolocation) {
      setLocationError("This device can't share a location. Choose pickup instead.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocationError("We couldn't get your location. Allow location access and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  // ── Gates ────────────────────────────────────────────────────────────────
  if (!hydrated || loadingCart) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your cart…</span>
        <Skeleton className="h-24 w-full rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-40 w-full rounded-xl bg-white/[0.04]" />
      </div>
    );
  }

  if (cartError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
        <AlertTriangle className="mx-auto text-red-400" size={22} />
        <h2 className="mt-3 font-syne text-base font-bold text-offwhite">We couldn&apos;t load your cart</h2>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">{cartError}</p>
        <Button variant="outline" className="mt-4" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={15} className="mr-1.5" /> Try again
        </Button>
      </div>
    );
  }

  if (!cart || cart.items.length === 0 || (resolved && resolved.length === 0)) {
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

  const items = resolved ?? [];
  const hasIssue = items.some((i) => !i.isActive || i.productStatus !== "active" || i.stockQuantity < i.requestedQuantity);
  const needsLocation = fulfillment !== "pickup";
  const locationReady = !needsLocation || coords !== null;
  // Never allow submission on a price we could not obtain from the server.
  const canSubmit = !submitting && !hasIssue && !!quote && !quoting && locationReady && !!name.trim() && !!phone.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cart || !canSubmit) return;
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
          deliveryLat: coords?.lat,
          deliveryLng: coords?.lng,
          deliveryInstructions: deliveryInstructions || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Checkout failed.");
      clear();
      toast.success("Order placed!");
      router.push(`/orders/${body.order_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Items */}
      <section aria-labelledby="items-h">
        <h2 id="items-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ITEMS</h2>
        <div className="mt-2 space-y-1 rounded-xl border border-white/10 bg-dark-card p-3">
          {items.map((i) => (
            <div key={i.variantId} className="flex justify-between font-dm text-sm">
              <span className="text-offwhite">{i.productName} × {i.requestedQuantity}</span>
              <span className="text-muted">Rs {centsToDecimalString(i.price * i.requestedQuantity)}</span>
            </div>
          ))}
        </div>
        {hasIssue && (
          <p role="alert" className="mt-2 font-dm text-xs text-red-400">
            Some items are no longer available. <Link href="/cart" className="underline">Review your cart</Link>.
          </p>
        )}
      </section>

      {/* Delivery method */}
      <fieldset>
        <legend className="font-bebas text-[11px] tracking-[0.3em] text-yellow">DELIVERY METHOD</legend>
        <div className="mt-2 space-y-2">
          {(Object.keys(FULFILLMENT_COPY) as Fulfillment[]).map((f) => {
            const disabled = f !== "pickup" && !storeOffersDelivery;
            return (
              <label
                key={f}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  fulfillment === f ? "border-yellow bg-yellow/10" : "border-white/15 hover:bg-white/[0.04]"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <input
                  type="radio"
                  name="fulfillment"
                  value={f}
                  checked={fulfillment === f}
                  disabled={disabled}
                  onChange={() => { setFulfillment(f); setLocationError(null); }}
                  className="mt-1 accent-yellow"
                />
                <span>
                  <span className={`block font-dm text-sm ${fulfillment === f ? "text-yellow" : "text-offwhite"}`}>
                    {FULFILLMENT_COPY[f].label}
                  </span>
                  <span className="block font-dm text-xs text-muted">{FULFILLMENT_COPY[f].hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* GPS — the delivery address */}
      {needsLocation && (
        <section aria-labelledby="loc-h">
          <h2 id="loc-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">YOUR LOCATION</h2>
          <div className="mt-2 rounded-xl border border-white/10 bg-dark-card p-4">
            {coords ? (
              <p className="flex items-center gap-2 font-dm text-sm text-green-400">
                <Check size={15} /> Location shared ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})
              </p>
            ) : (
              <p className="font-dm text-sm text-muted">
                We deliver to a GPS pin, not a street address — it&apos;s far more reliable here.
              </p>
            )}
            <Button type="button" variant="outline" className="mt-3" onClick={shareLocation} disabled={locating}>
              {locating ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <MapPin size={15} className="mr-1.5" />}
              {coords ? "Update location" : "Share my location"}
            </Button>
            {locationError && <p role="alert" className="mt-2 font-dm text-xs text-red-400">{locationError}</p>}
            <Textarea
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              placeholder="Landmark or directions (optional)"
              aria-label="Delivery directions"
              rows={2}
              maxLength={500}
              className="mt-3"
            />
          </div>
        </section>
      )}

      {/* Details */}
      <section aria-labelledby="you-h">
        <h2 id="you-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">YOUR DETAILS</h2>
        <div className="mt-2 space-y-3">
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Full name" aria-label="Full name"
            className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
          />
          <input
            required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number" aria-label="Phone number"
            className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
          />
          <Textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the shop should know? (optional)" aria-label="Order notes"
            rows={2} maxLength={1000}
          />
        </div>
      </section>

      {/* Payment — cash or bank transfer only; cards belong to vehicle rentals */}
      <fieldset>
        <legend className="font-bebas text-[11px] tracking-[0.3em] text-yellow">PAYMENT</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([["cash", "Cash"], ["bank_transfer", "Bank transfer"]] as const).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border px-4 py-3 text-center font-dm text-sm transition-colors ${
                provider === value ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 text-offwhite hover:bg-white/[0.04]"
              }`}
            >
              <input
                type="radio" name="provider" value={value} checked={provider === value}
                onChange={() => setProvider(value)} className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {provider === "bank_transfer" && (
          <p className="mt-2 font-dm text-xs text-muted">
            You&apos;ll see the shop&apos;s bank details and upload your transfer receipt after placing the order.
          </p>
        )}
      </fieldset>

      {/* Server-priced summary */}
      <section aria-labelledby="total-h" className="rounded-xl border border-white/10 bg-dark-card p-4">
        <h2 id="total-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">SUMMARY</h2>
        {quoteError ? (
          <div role="alert" className="mt-2">
            <p className="font-dm text-sm text-red-400">{quoteError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void fetchQuote()}>
              <RefreshCw size={14} className="mr-1.5" /> Retry
            </Button>
          </div>
        ) : !quote || quoting ? (
          <div className="mt-2 space-y-2" aria-busy="true" aria-live="polite">
            <span className="sr-only">Calculating your total…</span>
            <Skeleton className="h-4 w-full bg-white/[0.06]" />
            <Skeleton className="h-5 w-1/2 bg-white/[0.06]" />
          </div>
        ) : (
          <dl className="mt-2 space-y-1 font-dm text-sm" aria-live="polite">
            <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd>Rs {centsToDecimalString(quote.subtotal)}</dd></div>
            {quote.tax > 0 && (
              <div className="flex justify-between text-muted"><dt>Tax</dt><dd>Rs {centsToDecimalString(quote.tax)}</dd></div>
            )}
            {quote.delivery_fee > 0 && (
              <div className="flex justify-between text-muted"><dt>Delivery</dt><dd>Rs {centsToDecimalString(quote.delivery_fee)}</dd></div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-1 font-bold text-offwhite">
              <dt>Total</dt><dd className="text-yellow">Rs {centsToDecimalString(quote.total)}</dd>
            </div>
          </dl>
        )}
      </section>

      {error && <p role="alert" className="font-dm text-sm text-red-400">{error}</p>}
      {needsLocation && !coords && (
        <p className="font-dm text-xs text-muted">Share your location to continue.</p>
      )}

      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : quote ? `Place order — Rs ${centsToDecimalString(quote.total)}` : "Place order"}
      </Button>
    </form>
  );
}
