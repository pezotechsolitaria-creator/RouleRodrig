"use client";

import { useCallback, useEffect, useState } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, AlertTriangle, RefreshCw, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { useCart, type CartDomain } from "@/lib/cart/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { CHECKOUT_COPY, sellerWords } from "@/lib/checkout/copy.i18n";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import PhoneInput from "@/components/PhoneInput";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";
import { todayLine, deliveryLine, nextOpenLabel, type ScheduleStatus } from "@/lib/schedule";
import { readFulfillment as readFoodFulfillment } from "@/components/food/FulfillmentBar";
import { vocabFor, domainFromFlags } from "@/lib/food/vocabulary";
import WhenPicker, { type PickedSlot } from "@/components/food/WhenPicker";
import { FULFILMENT } from "@/lib/shop/plain-words";
import PickupLocationCard, { type PickupLocation } from "@/components/orders/PickupLocationCard";
import { checkoutHoldCopy, type PaymentProvider } from "@/lib/orders/hold";

type Provider = "cash" | "bank_transfer";
type Fulfillment = "pickup" | "customer_delivery" | "rr_delivery";
type Quote = { subtotal: number; tax: number; delivery_fee: number; total: number; currency: string };
type Coords = { lat: number; lng: number };

type Zone = { id: string; name: string; covers: string | null; fee: number };

// One definition, in lib/shop/plain-words.ts, shared with the shop cards, the
// shop filters and the food bar. Before this, the same three choices carried
// four different sets of words across the journey — including "My own delivery"
// here and "Your own driver" on the card, for the identical option.
//
// The pickup hint is still overridden at the render site from
// lib/food/vocabulary.ts, because that is the one line that names the seller.
const FULFILLMENT_COPY = FULFILMENT;

export default function CheckoutForm({
  domain, storeId, defaultName, defaultPhone, signedInEmail, holdWindows,
}: {
  domain: CartDomain;
  /** Which shop's basket, from ?store= — the marketplace holds several. */
  storeId: string | null;
  defaultName: string;
  defaultPhone: string;
  signedInEmail: string | null;
  /**
   * Hours a placed order holds its stock, per provider, resolved on the server
   * by the same order_hold_hours() create_order() will call. Both are passed
   * because the customer picks the provider here, in the browser.
   */
  holdWindows: Record<PaymentProvider, number>;
}) {
  const { baskets, basketFor, hydrated, clear } = useCart(domain);
  const router = useRouter();
  // Every word on this form, in the language chosen at the door. It lives in
  // localStorage via context/LanguageContext, so it can only be read here in
  // the browser — which is why the page's own h1 is a separate client child.
  const { language } = useLanguage();
  const c = CHECKOUT_COPY[language];

  // WHICH basket this checkout is placing. The marketplace holds one per shop,
  // so the shop travels in the URL; food and ticketing hold exactly one, so the
  // fallback is not a guess. A ?store= naming a basket that is not there falls
  // back too, and the empty-cart branch below catches the genuinely-empty case.
  //
  // Nothing about this is trusted: create_order() re-derives every price, every
  // stock figure and the shop's own rules from the storeId it is given, and
  // refuses anything that disagrees with what the customer was shown (RR012).
  const cart = (storeId ? basketFor(storeId) : null) ?? baskets[0] ?? null;

  const [resolved, setResolved] = useState<ResolvedCartItem[] | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  // Bug 2: a failed cart load must never look like an empty/free cart.
  const [cartError, setCartError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [storeOffersDelivery, setStoreOffersDelivery] = useState(true);
  // WHICH kind of seller this order belongs to. Server-decided in
  // /api/cart/resolve from the store itself, not from the route — so the nouns
  // below cannot be spoofed by editing a URL. Starts as the checkout's own
  // domain, which is already right in every case except a hand-typed link.
  const [sellerDomain, setSellerDomain] = useState<CartDomain>(domain);
  // WHERE this would be collected. Shown before payment, because "I did not
  // know where to go" is a problem that has to be solved BEFORE the money
  // moves, not on the confirmation page.
  const [pickup, setPickup] = useState<PickupLocation | null>(null);
  // Only Roulé Rodrigues delivery is opt-in per shop; a customer's own driver
  // is a collection, so it is offered whenever the shop is open at all.
  // FAILS CLOSED WHILE LOADING (M169). This opened `true`, so for the whole
  // first paint every shop looked like it delivered — the same "a missing
  // answer is not a yes" mistake the server had, reproduced in the client. The
  // resolve call sets the truth a moment later; until it does, the option is
  // simply not offered.
  const [offersRrDelivery, setOffersRrDelivery] = useState(false);
  // The other two fulfilment options now come from the same source (M169)
  // rather than being assumed. They open TRUE because that is the column
  // default create_order coalesces to, so a shop with no settings row behaves
  // in the form exactly as it does in the RPC.
  const [offersPickup, setOffersPickup] = useState(true);
  const [offersCustomerDelivery, setOffersCustomerDelivery] = useState(true);
  // Opening hours, straight from store_schedule_status() — the same function
  // create_order() enforces. Null until the cart resolves.
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);
  // Which payment methods this shop accepts. Mirrors the column defaults so an
  // unconfigured shop behaves identically here and in create_order().
  const [acceptsCash, setAcceptsCash] = useState(true);
  const [acceptsBankTransfer, setAcceptsBankTransfer] = useState(false);
  // This shop wants a PHOTO of the transfer. That used to exclude guests
  // entirely — the upload needed storage RLS, which needs a session, so
  // create_order refused with RR009 (M21). M49 moved the upload to the server,
  // which does it on the guest's order-number + email, so this no longer gates
  // anything: it only changes what the customer is told to expect next.
  const [requiresReceipt, setRequiresReceipt] = useState(false);
  // One key per checkout attempt, minted once when this form mounts and kept
  // stable across retries — that is what makes a retry idempotent rather than a
  // second order. A lazy useState initialiser, not useEffect, so it exists
  // before the first possible submit. A fresh mount (after a completed order,
  // or a new visit) mints a new one, which is correct: that IS a new checkout.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined,
  );

  // Bug 1: the payable amount comes from the server, never from arithmetic here.
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  // GUEST CHECKOUT (M20). When signed in the address comes from the session and
  // the server ignores anything sent here, so the field is not even rendered.
  const isGuest = !signedInEmail;
  const [guestEmail, setGuestEmail] = useState("");
  const guestEmailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail.trim());
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [zoneId, setZoneId] = useState<string>("");
  // Dispatch eligibility, not a price: see the checkbox below the area picker.
  const [sizeClass, setSizeClass] = useState<"standard" | "large">("standard");
  const [maxMinutes, setMaxMinutes] = useState(120);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [notes, setNotes] = useState("");
  // M161. null = ASAP, which is what every order was before this existed.
  // Plain form state on purpose: never localStorage and never a URL param,
  // because a time chosen an hour ago is not a time the kitchen still has.
  const [slot, setSlot] = useState<PickedSlot>(null);
  // Bank transfer is the default because it is, as of M89, the only method the
  // platform offers. The cart-resolve effect still corrects this from what the
  // shop actually accepts, so nothing here assumes the switch is on.
  const [provider, setProvider] = useState<Provider>("bank_transfer");
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Sign out and come straight back to checkout. The cart lives in
  // localStorage, not the session, so it survives — the customer returns to the
  // same basket signed in as nobody, and the sign-in prompt takes it from there.
  async function switchAccount() {
    setSwitching(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.signOut();
      router.replace("/login?next=/checkout");
      router.refresh();
    } catch {
      toast.error(c.form.signedIn.signOutFailed);
      setSwitching(false);
    }
  }
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
        if (!r.ok) throw new Error(body.error || c.form.errors.cartLoad);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setResolved(body.items ?? []);
        if (body.fulfillment) setStoreOffersDelivery(!!body.fulfillment.delivery);
        setOffersRrDelivery(!!body.offersRrDelivery);
        if (body.offersPickup !== undefined) setOffersPickup(!!body.offersPickup);
        if (body.offersCustomerDelivery !== undefined) {
          setOffersCustomerDelivery(!!body.offersCustomerDelivery);
        }
        setSellerDomain(domainFromFlags({ isFood: body.isFood, isEvent: body.isEvent }));
        setPickup(body.pickup ?? null);
        setSchedule(body.schedule ?? null);
        // Carry over the pickup/delivery choice made while browsing /food.
        // A customer who spent the whole visit in "Delivery" mode and then
        // lands on a checkout defaulted to "Pick up" has been told, at the last
        // possible step, that the platform was not listening — the single
        // most-complained-about behaviour of the big delivery apps. Applied
        // only when the shop can actually honour it, so this preference can
        // never select an option create_order() is about to refuse.
        if (body.isFood && readFoodFulfillment() === "rr_delivery" && body.offersRrDelivery) {
          setFulfillment("rr_delivery");
        }
        if (body.payment) {
          setAcceptsCash(!!body.payment.acceptsCash);
          setAcceptsBankTransfer(!!body.payment.acceptsBankTransfer);
          setRequiresReceipt(!!body.payment.requiresReceipt);
          // Land on a method the shop actually takes rather than leaving the
          // default selected and letting the RPC refuse it at the last step.
          // (M49c) The guest-vs-receipt exclusion that used to live here is gone:
          // a guest can now attach proof from /orders/track, so bank transfer at
          // a receipt-required shop is a real option for them.
          if (!body.payment.acceptsCash && body.payment.acceptsBankTransfer) {
            setProvider("bank_transfer");
          } else if (body.payment.acceptsCash) {
            setProvider("cash");
          }
        }
      })
      .catch((e) => {
        if (cancelled) return;
        // Leave `resolved` null so nothing renders a price.
        setResolved(null);
        setCartError(e instanceof Error ? e.message : c.form.errors.cartLoad);
      })
      .finally(() => {
        if (!cancelled) setLoadingCart(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartKey, reloadKey]);

  // Delivery regions and their prices. Loaded once; the fee shown is only a
  // preview — order_amounts() re-reads it server-side when pricing the order.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/delivery-zones")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (cancelled || !b) return;
        setZones(b.zones ?? []);
        if (typeof b.maxMinutes === "number") setMaxMinutes(b.maxMinutes);
      })
      .catch(() => { if (!cancelled) setZones([]); });
    return () => { cancelled = true; };
  }, []);

  // ── Price it, server-side ────────────────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (!cart || cart.items.length === 0) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      const r = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: cart.storeId, items: cart.items, fulfillment, deliveryZoneId: zoneId || undefined }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || c.form.errors.quote);
      setQuote(body);
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : c.form.errors.quote);
    } finally {
      setQuoting(false);
    }
    // `c` only ever changes when the reader switches language; the effect that
    // calls this does not list it, so nothing re-fetches on a language change.
  }, [cart, fulfillment, zoneId, c]);

  useEffect(() => {
    if (!hydrated || cartError || !resolved || resolved.length === 0) return;
    void fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartKey, fulfillment, zoneId, resolved, cartError]);

  function shareLocation() {
    if (!navigator.geolocation) {
      setLocationError(c.form.location.unsupported);
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
        setLocationError(c.form.location.denied);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  // ── Gates ────────────────────────────────────────────────────────────────
  if (!hydrated || loadingCart) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">{c.form.loading}</span>
        <Skeleton className="h-24 w-full rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-40 w-full rounded-xl bg-white/[0.04]" />
      </div>
    );
  }

  if (cartError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
        <AlertTriangle className="mx-auto text-red-400" size={22} />
        <h2 className="mt-3 font-syne text-base font-bold text-offwhite">{c.form.loadFailedTitle}</h2>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">{cartError}</p>
        <Button variant="outline" className="mt-4" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={15} className="mr-1.5" /> {c.form.tryAgain}
        </Button>
      </div>
    );
  }

  // Declared before the first early return that needs it: the empty-cart branch
  // below already links away, and it must link to the MENU for a food order.
  const v = vocabFor(sellerDomain);
  // The same seller, in the reader's language and in the grammatical forms the
  // sentences below need. `v` still supplies the words this package does not
  // own — the browse link, the pickup hint, and the noun handed to
  // checkoutHoldCopy() — all of which are still English.
  const s = sellerWords(language, sellerDomain);

  if (!cart || cart.items.length === 0 || (resolved && resolved.length === 0)) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
        <h2 className="font-syne text-lg font-bold text-offwhite">{c.form.emptyTitle}</h2>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">{c.form.emptyBody}</p>
        {/* Was "/" — a link labelled "Browse shops" that went to the homepage,
            contradicting itself and the cart page, which correctly returns to
            the marketplace directory. */}
        <Link href={v.browseHref} className="mt-4 inline-flex items-center gap-1.5 font-dm text-sm text-yellow hover:underline">
          {v.browseEmptyLabel}
        </Link>
      </div>
    );
  }

  const items = resolved ?? [];
  const hasIssue = items.some((i) => !i.isActive || i.productStatus !== "active" || i.stockQuantity < i.requestedQuantity);
  // Tickets are collected at the gate, so they can never need a location — and
  // sellerDomain is server-decided, so a hand-typed ?cart= cannot change that.
  const isTicket = sellerDomain === "events";
  const needsLocation = !isTicket && fulfillment !== "pickup";
  const locationReady = !needsLocation || coords !== null;
  // rr_delivery has no price until an area is chosen, so it cannot be submitted.
  const zoneReady = fulfillment !== "rr_delivery" || !!zoneId;
  // Opening hours. create_order() refuses a closed shop (RR010) and refuses
  // rr_delivery outside the delivery window (RR011); these mirror that so the
  // customer is stopped before filling the form, not after submitting it.
  const shopClosed = !!schedule && schedule.has_schedule && !schedule.is_open;
  const deliveryOffNow = !!schedule && schedule.has_schedule && !schedule.delivery_available;
  const scheduleReady = !shopClosed && !(fulfillment === "rr_delivery" && deliveryOffNow);
  // A shop with no payment method configured cannot be ordered from at all;
  // create_order() would refuse whatever we sent.
  // (M49c) Bank transfer used to carry an extra condition for a guest: a shop
  // demanding a receipt PHOTO could not be served without an account, because
  // the upload ran against storage RLS derived from a session, and create_order
  // refused it (RR009). The server now uploads on the guest's behalf against
  // their order-number + email, so the exclusion — and the RPC guard behind it —
  // are both gone. Bank transfer is available whenever the shop accepts it.
  const bankTransferAvailable = acceptsBankTransfer;
  const paymentReady = (provider === "cash" && acceptsCash) || (provider === "bank_transfer" && bankTransferAvailable);
  // Never allow submission on a price we could not obtain from the server.
  // A guest must supply a valid email — it is the ONLY way they can be sent a
  // confirmation or find this order again, since they have no account.
  const identityReady = !isGuest || guestEmailValid;
  const canSubmit = !submitting && !hasIssue && !!quote && !quoting && locationReady && zoneReady
    && scheduleReady && paymentReady && !!name.trim() && !!phone.trim() && identityReady;

  // A disabled button with no explanation is a dead end: the customer has filled
  // in what they can see and the only affordance left is dark. Name and phone
  // are the common cases — they are required by create_order() but nothing on
  // the page said so. Ordered so the first thing the customer can actually act
  // on is named, rather than reporting a server-side condition they cannot fix.
  const blockedReason = submitting || quoting || hasIssue ? null
    : !identityReady ? c.form.blocked.email
    : !name.trim() ? c.form.blocked.name
    : !phone.trim() ? c.form.blocked.phone(s)
    : !locationReady ? c.form.blocked.location
    : !zoneReady ? c.form.blocked.zone
    : !paymentReady ? c.form.blocked.payment(s)
    : !scheduleReady ? c.form.blocked.closed(s)
    : !quote ? c.form.blocked.quote(s)
    : null;

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
          // Both or neither. The RPC re-derives the real window and
          // refuses (RR030) anything it would not have offered.
          pickupDate: slot?.date,
          pickupTime: slot?.time,
          provider,
          deliveryLat: coords?.lat,
          deliveryLng: coords?.lng,
          deliveryInstructions: deliveryInstructions || undefined,
          deliveryZoneId: fulfillment === "rr_delivery" ? zoneId : undefined,
          deliverySizeClass: fulfillment === "rr_delivery" ? sizeClass : undefined,
          // The figure on the button. create_order() still derives the real
          // price itself; sending this only lets it refuse (RR012) rather than
          // charge a total the customer never saw.
          expectedTotal: quote?.total,
          idempotencyKey,
          // Only meaningful for a guest; the server ignores it when a session
          // exists and reads the address from auth.users instead.
          guestEmail: isGuest ? guestEmail.trim().toLowerCase() : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A price moved mid-checkout. Re-price so the customer sees the new
        // figure and can decide, instead of being left on a dead number.
        if (body.code === "RR012") {
          await fetchQuote();
          throw new Error(body.error || c.form.errors.priceChanged);
        }
        throw new Error(body.error || c.form.errors.failed);
      }
      posthog.capture("checkout_order_placed", {
        item_count: cart.items.reduce((count, item) => count + item.quantity, 0),
        fulfillment_method: fulfillment,
        payment_method: provider,
        is_guest_checkout: isGuest,
      });
      // ONLY this shop's basket. Clearing the domain would silently throw away
      // the other baskets a marketplace shopper is deliberately holding — they
      // paid one shop, not all of them.
      clear(cart.storeId);
      toast.success(c.form.errors.placed);
      // A GUEST has no session, so /orders/[id] — which filters on
      // customer_id = auth.uid() — would bounce them straight to /login after
      // they had just paid. They go to the account-free tracking page instead,
      // with the order handed over in sessionStorage rather than the URL:
      // an order number plus an email in a query string would live on in
      // browser history, shared links and server logs.
      if (isGuest) {
        try {
          sessionStorage.setItem(
            "rr-just-ordered",
            JSON.stringify({ orderNumber: body.order_number, email: guestEmail.trim().toLowerCase() }),
          );
        } catch {
          /* private mode — the tracking page falls back to its manual form */
        }
        router.push("/orders/track");
      } else {
        router.push(`/orders/${body.order_id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : c.form.errors.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Items */}
      <section aria-labelledby="items-h">
        <h2 id="items-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.items.eyebrow}</h2>
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
            {c.form.items.issue} <Link href="/cart" className="underline">{c.form.items.issueLink}</Link>.
          </p>
        )}
      </section>

      {/* Opening hours — stated up front, because a closed shop blocks everything. */}
      {shopClosed && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3">
          <p className="font-dm text-sm text-red-300">{c.form.schedule.closedNow(s)}</p>
          <p className="mt-0.5 font-dm text-xs text-muted">
            {nextOpenLabel(schedule) || c.form.schedule.tryOpeningHours}
            {/* "Closed today" is NOT display here — it is compared against what
                todayLine() returns (lib/schedule.ts, asserted in
                lib/schedule.test.ts). Translating it would make the condition
                always true and append " · Today Closed today". */}
            {todayLine(schedule) !== "Closed today" && `${c.form.schedule.todayPrefix}${todayLine(schedule)}`}
          </p>
        </div>
      )}
      {!shopClosed && schedule?.has_schedule && (
        <p className="font-dm text-xs text-muted">
          <span className="text-green-400">{c.form.schedule.openNow}</span>{c.form.schedule.todayLower}{todayLine(schedule)}
        </p>
      )}

      {/* ── How you get it ──────────────────────────────────────────────────
          Nobody delivers a concert. A ticket bought from /cart came through
          this same form and was asked to choose a delivery method, then a
          delivery area, then to share a GPS pin — for something that is a code
          on a phone. The event's own checkout forces pickup; this one now says
          the same thing in one line instead of asking three questions with no
          right answer. */}
      {isTicket ? (
        <section>
          <h2 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.ticket.eyebrow}</h2>
          <p className="mt-2 rounded-xl border border-white/10 bg-dark-card p-4 font-dm text-sm text-offwhite/85">
            {c.form.ticket.body}
          </p>
        </section>
      ) : (
      <fieldset>
        <legend className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.fulfilment.legend}</legend>
        <div className="mt-2 space-y-2">
          {(Object.keys(FULFILLMENT_COPY) as Fulfillment[]).map((f) => {
            // A shut delivery window disables ONLY rr_delivery — pickup and a
            // customer's own driver still work, which is exactly what the RPC
            // allows, so the UI never blocks something the server would accept.
            const disabled =
              shopClosed
                ? true
                : f === "rr_delivery"
                  ? !offersRrDelivery || deliveryOffNow
                  : f === "pickup"
                    ? !offersPickup
                    : !offersCustomerDelivery || !storeOffersDelivery;
            const reason =
              shopClosed ? c.form.fulfilment.closed(s)
                : f === "rr_delivery" && !offersRrDelivery ? c.form.fulfilment.noRrDelivery(s)
                : f === "rr_delivery" && deliveryOffNow ? c.form.fulfilment.deliveryOff
                : null;
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
                  <span className="block font-dm text-xs text-muted">
                    {f === "pickup" ? v.pickupHint : FULFILLMENT_COPY[f].hint}
                  </span>
                  {/* Never disable a control without saying why. */}
                  {reason && <span className="mt-0.5 block font-dm text-xs text-orange-300">{reason}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      )}

      {/* WHERE to collect — shown the moment "Pick up" is the live choice, and
          only then. An address under a delivery order is noise; an address
          missing under a pickup order is a customer standing in the wrong
          village holding a code. Tickets are excluded: a ticket is scanned at
          the gate, and the venue is on the event page, not the seller's row. */}

      {fulfillment === "pickup" && sellerDomain !== "events" && pickup && (
        <PickupLocationCard location={pickup} title={c.form.fulfilment.pickupTitle} />
      )}

      {/* Region — decides the delivery fee */}
      {fulfillment === "rr_delivery" && (
        <section aria-labelledby="zone-h">
          <h2 id="zone-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.zone.eyebrow}</h2>
          <div className="mt-2 rounded-xl border border-white/10 bg-dark-card p-4">
            <label htmlFor="zone" className="mb-1.5 block font-dm text-xs text-muted">
              {c.form.zone.question}
            </label>
            <select
              id="zone"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="w-full rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
            >
              <option value="">{c.form.zone.choose}</option>
              {(zones ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} — Rs {centsToDecimalString(z.fee)}
                </option>
              ))}
            </select>
            {zones?.find((z) => z.id === zoneId)?.covers && (
              <p className="mt-2 font-dm text-xs text-muted">
                {c.form.zone.covers}{zones.find((z) => z.id === zoneId)!.covers}
              </p>
            )}
            {zones && zones.length === 0 && (
              <p role="alert" className="mt-2 font-dm text-xs text-red-400">
                {c.form.zone.none}
              </p>
            )}
            {/* ── Will it go on a scooter? ─────────────────────────────────
                Much of this island's delivery fleet is on two wheels, and the
                customer is the only one who knows what they have just bought
                is a gas bottle. Asked HERE, next to the area, because both are
                facts about the drop rather than about the goods.

                Left unticked it changes nothing: the job is offered to every
                driver exactly as before. Ticked, dispatch only offers it to a
                car or a van — so the mismatch surfaces now, and not at the
                shop counter with a scooter outside and the clock running. */}
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-dark p-3.5 transition-colors hover:border-yellow/40">
              <input
                type="checkbox"
                checked={sizeClass === "large"}
                onChange={(e) => setSizeClass(e.target.checked ? "large" : "standard")}
                className="mt-0.5 h-4 w-4 shrink-0 accent-yellow"
              />
              <span>
                <span className="block font-dm text-sm font-semibold text-offwhite">
                  {c.form.zone.largeLabel}
                </span>
                <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">
                  {c.form.zone.largeHelp}
                </span>
              </span>
            </label>

            {/* Roulé Rodrigues does not promise a time — this is an upper bound,
                and the customer settles the exact timing with the driver. */}
            <p className="mt-3 font-dm text-xs text-muted">
              {c.form.zone.within(Math.round(maxMinutes / 60))}
            </p>
            {sizeClass === "large" && (
              <p className="font-dm text-xs text-muted">
                {c.form.zone.largeSlower}
              </p>
            )}
            <p className="font-dm text-xs text-muted">
              {c.form.zone.agreed}
            </p>
            {deliveryLine(schedule) && (
              <p className="mt-1 font-dm text-xs text-muted">
                {c.form.zone.today}{deliveryLine(schedule)}
              </p>
            )}
          </div>
        </section>
      )}

      {/* GPS — the delivery address */}
      {needsLocation && (
        <section aria-labelledby="loc-h">
          <h2 id="loc-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.location.eyebrow}</h2>
          <div className="mt-2 rounded-xl border border-white/10 bg-dark-card p-4">
            {coords ? (
              <p className="flex items-center gap-2 font-dm text-sm text-green-400">
                <Check size={15} /> {c.form.location.shared(coords.lat.toFixed(5), coords.lng.toFixed(5))}
              </p>
            ) : (
              <p className="font-dm text-sm text-muted">
                {c.form.location.why}
              </p>
            )}
            <Button type="button" variant="outline" className="mt-3" onClick={shareLocation} disabled={locating}>
              {locating ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <MapPin size={15} className="mr-1.5" />}
              {coords ? c.form.location.update : c.form.location.share}
            </Button>
            {locationError && <p role="alert" className="mt-2 font-dm text-xs text-red-400">{locationError}</p>}
            <Textarea
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              placeholder={c.form.location.notesPlaceholder}
              aria-label={c.form.location.notesAria}
              rows={2}
              maxLength={500}
              className="mt-3"
            />
          </div>
        </section>
      )}

      {/* Details */}
      {/* ── Who is buying (M20) ────────────────────────────────────────────
          Guest is the DEFAULT and the recommended path — it is simply the form
          below, already open. Signing in is offered as a quiet alternative
          rather than a gate, because the gate is what was costing the sale.
          A signed-in buyer sees their address confirmed instead of a field. */}
      {isGuest ? (
        <section
          aria-labelledby="who-h"
          className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4"
        >
          <h2 id="who-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
            {c.form.guest.eyebrow}
          </h2>
          <p className="mt-1.5 font-dm text-sm text-muted">
            {c.form.guest.intro}
          </p>
          <div className="mt-3">
            <label htmlFor="co-email" className="mb-1 block font-dm text-xs text-muted">
              {c.form.guest.emailLabel} <span className="text-yellow">*</span>
            </label>
            <input
              id="co-email"
              type="email"
              required
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder={c.form.guest.emailPlaceholder}
              autoComplete="email"
              inputMode="email"
              aria-invalid={guestEmail.length > 0 && !guestEmailValid}
              aria-describedby="co-email-hint"
              className={`w-full rounded-xl border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:outline-none ${
                guestEmail.length > 0 && !guestEmailValid
                  ? "border-red-500/60 focus:border-red-500"
                  : "border-dark-border focus:border-yellow"
              }`}
            />
            <p id="co-email-hint" className="mt-1.5 font-dm text-[11px] text-muted">
              {guestEmail.length > 0 && !guestEmailValid
                ? c.form.guest.emailBad
                : c.form.guest.emailHint}
            </p>
          </div>
          <p className="mt-3 font-dm text-xs text-muted">
            {c.form.guest.haveAccount}{" "}
            <Link href="/login?next=/checkout" className="font-semibold text-yellow hover:underline">
              {c.form.guest.signIn}
            </Link>{" "}
            {c.form.guest.toSave}
          </p>
        </section>
      ) : (
        <section
          aria-labelledby="who-h"
          className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
        >
          <Check size={15} className="shrink-0 text-green-400" />
          <p className="min-w-0 flex-1 font-dm text-sm text-muted">
            <span className="sr-only" id="who-h">{c.form.signedIn.srLabel}</span>
            {c.form.signedIn.orderingAs}<span className="truncate font-medium text-offwhite">{signedInEmail}</span>
          </p>
          {/* A shared phone, a stale Google session, or simply the wrong
              account — without a way out, the only options were to abandon the
              order or place it against someone else's email, which is where the
              order confirmation and every status update would then go.
              Deliberately "use a different account" rather than an email-change
              field: changing an account's address is a Supabase Auth flow that
              sends confirmation mail to two addresses, which is the wrong thing
              to start in the middle of a checkout. Signs out and returns here,
              so the cart (localStorage) survives the round trip. */}
          <button
            type="button"
            onClick={switchAccount}
            disabled={switching}
            className="shrink-0 rounded-lg px-2 py-1 font-dm text-xs font-medium text-yellow underline underline-offset-2 transition-colors hover:text-yellow-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/60 disabled:opacity-50"
          >
            {switching ? c.form.signedIn.signingOut : c.form.signedIn.notYou}
          </button>
        </section>
      )}

      <section aria-labelledby="you-h">
        <h2 id="you-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.details.eyebrow}</h2>
        <div className="mt-2 space-y-3">
          {/* Both fields gate canSubmit, but nothing said so — the Place order
              button simply stayed dark with no explanation. Labelling them
              Required is the cheapest possible fix for "why can't I order?". */}
          <div>
            <label htmlFor="co-name" className="mb-1 block font-dm text-xs text-muted">
              {c.form.details.nameLabel} <span className="text-yellow">*</span>
            </label>
            <input
              id="co-name" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder={c.form.details.namePlaceholder} autoComplete="name"
              className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="co-phone" className="mb-1 block font-dm text-xs text-muted">
              {c.form.details.phoneLabel} <span className="text-yellow">*</span>
            </label>
            {/* The same PhoneInput the vehicle-rental flow uses, so the country
                picker (+230 Mauritius first) and libphonenumber validation are
                shared rather than reimplemented. The shop phones this number to
                arrange handover, so a number missing its country code is a real
                failure, not a formatting nicety. */}
            <PhoneInput
              value={phone}
              onChange={setPhone}
              disabled={submitting}
              placeholder={c.form.details.phonePlaceholder}
              inputClassName="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 pl-10 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
            />
          </div>
          {/* ── M161 · WHEN DO YOU WANT IT? ────────────────────────────
              Food collection only. Delivery has its own timing story and the
              kitchen's window is not the rider's. The component renders
              nothing at all unless the kitchen opted in to pre-orders, so
              this is inert for every shop and every event. */}
          {sellerDomain === "food" && fulfillment === "pickup" && cart?.storeId && (
            <WhenPicker
              storeId={cart.storeId}
              variantIds={cart.items.map((i) => i.variantId)}
              kitchenName={pickup?.storeName ?? s.the}
              asapAvailable={schedule?.is_open ?? true}
              value={slot}
              onChange={setSlot}
            />
          )}
          <Textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={c.form.details.notesPlaceholder(s)} aria-label={c.form.details.notesAria}
            rows={2} maxLength={1000}
          />
        </div>
      </section>

      {/* Payment — cash or bank transfer only; cards belong to vehicle rentals.
          M89 turned cash off platform-wide (marketplace_settings.prepayment_only)
          so that nothing is ever handed over before the money has arrived. */}
      <fieldset>
        <legend className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.payment.legend}</legend>
        {/* A CHOICE IS ONLY DRAWN WHEN THERE IS ONE TO MAKE.
            With cash off, the two-tile radio rendered a permanently disabled
            "Cash" on every checkout — advertising a method that no longer
            exists and inviting a tap that does nothing. One available method
            is a statement, not a question. The radio is kept for the case
            where both are on, so turning the switch back off restores the
            choice without another change here. */}
        {acceptsCash && bankTransferAvailable ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {/* The FIRST element of each tuple is the value create_order() is
                sent — it is data, never a word, and is not translated. */}
            {([["cash", c.form.payment.cash], ["bank_transfer", c.form.payment.bankTransfer]] as const).map(([value, label]) => (
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
        ) : bankTransferAvailable ? (
          <p className="mt-2 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-4 py-3 font-dm text-sm text-offwhite">
            {c.form.payment.transferOnlyBefore}
            <span className="font-bold text-yellow">{c.form.payment.transferOnlyWord}</span>
            {c.form.payment.transferOnlyAfter}
          </p>
        ) : acceptsCash ? (
          <p className="mt-2 rounded-xl border border-white/15 px-4 py-3 font-dm text-sm text-offwhite">
            {c.form.payment.cashOnlyBefore}
            <span className="font-bold text-yellow">{c.form.payment.cashOnlyWord}</span>
            {c.form.payment.cashOnlyAfter}
          </p>
        ) : null}
        {!acceptsCash && !acceptsBankTransfer && (
          // Four live shops are in exactly this state the day M89 ships: cash
          // was their only method and they have published no account. Say what
          // is actually wrong rather than "no payment method", which reads to a
          // customer as a fault on their side.
          <p role="alert" className="mt-2 font-dm text-xs text-red-400">
            {c.form.payment.noBankDetails(s)}
          </p>
        )}

        {/* ── THE WALL, AND THE WAY THROUGH IT ────────────────────────────
            M89 made every order a bank transfer. A visitor holding a foreign
            card cannot make one, so for them this screen is where the site
            ends: they read the menu, fill in their name, and leave. Silently —
            it does not even register as a failure anywhere.

            M95 put the seller's WhatsApp on the DISH page, which is the wrong
            place. Nobody gets stuck browsing; they get stuck HERE. So it is
            here too, phrased as the answer to the question they are actually
            asking, and it covers shops as well as kitchens because marketplace
            checkout has the identical problem. */}
        {pickup?.whatsapp && (
          <details className="mt-3 rounded-xl border border-white/12 bg-dark-card px-4 py-3">
            <summary className="cursor-pointer font-dm text-sm text-offwhite marker:text-yellow">
              {c.form.payment.noLocalAccount}
            </summary>
            <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
              {c.form.payment.noLocalAccountBody(pickup.storeName ?? s.the)}
            </p>
            <a
              href={`https://wa.me/${pickup.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                `Hello ${pickup.storeName ?? ""}, I would like to order from Roulé Rodrigues but I do not have a local bank account. How can I pay you?`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#25D366] px-3.5 font-syne text-sm font-bold text-black"
            >
              {c.form.payment.messageSeller(s)}
            </a>
          </details>
        )}
        {provider === "bank_transfer" && bankTransferAvailable && (
          <p className="mt-2 font-dm text-xs text-muted">
            {/* Keeps the food/shop vocabulary from the other half of this
                change, and adds the receipt case a guest can now satisfy. */}
            {requiresReceipt
              ? isGuest
                ? c.form.payment.expect.guestReceipt(s)
                : c.form.payment.expect.receipt(s)
              : isGuest
                ? c.form.payment.expect.guest(s)
                : c.form.payment.expect.plain(s)}
          </p>
        )}

        {/* ── THE RESERVATION CLOCK, SAID OUT LOUD (backlog #53) ──────────
            create_order() stamps auto_release_at and a cron cancels whatever
            is still unpaid when it passes. The customer was never told. The
            only "48 hours" anywhere in the product is the RENTAL cancellation
            policy, which is a different rule about a different thing — so a
            bank-transfer customer had every reason to think they could pay
            when they got to a bank on Monday.

            Stated as a date and time rather than a duration, because "48
            hours" from an unstated starting point is not something anyone can
            act on. The hours come from order_hold_hours() on the server, so
            this cannot drift from what the database will actually enforce. */}
        {paymentReady && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-4 py-3 font-dm text-xs leading-relaxed text-offwhite">
            <Clock size={14} className="mt-0.5 shrink-0 text-yellow" />
            {/* Still English in every language: lib/orders/hold.ts builds this
                paragraph itself and is outside this change. It takes the raw
                English noun from lib/food/vocabulary.ts, not the translated
                seller words, so the two stay consistent with each other. */}
            <span>{checkoutHoldCopy(provider, holdWindows[provider] ?? 48, Date.now(), v.seller)}</span>
          </p>
        )}
      </fieldset>

      {/* Server-priced summary */}
      <section aria-labelledby="total-h" className="rounded-xl border border-white/10 bg-dark-card p-4">
        <h2 id="total-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.form.summary.eyebrow}</h2>
        {quoteError ? (
          <div role="alert" className="mt-2">
            <p className="font-dm text-sm text-red-400">{quoteError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void fetchQuote()}>
              <RefreshCw size={14} className="mr-1.5" /> {c.form.summary.retry}
            </Button>
          </div>
        ) : !quote || quoting ? (
          <div className="mt-2 space-y-2" aria-busy="true" aria-live="polite">
            <span className="sr-only">{c.form.summary.working}</span>
            <Skeleton className="h-4 w-full bg-white/[0.06]" />
            <Skeleton className="h-5 w-1/2 bg-white/[0.06]" />
          </div>
        ) : (
          <dl className="mt-2 space-y-1 font-dm text-sm" aria-live="polite">
            <div className="flex justify-between text-muted"><dt>{c.form.summary.subtotal}</dt><dd>Rs {centsToDecimalString(quote.subtotal)}</dd></div>
            {quote.tax > 0 && (
              <div className="flex justify-between text-muted"><dt>{c.form.summary.tax}</dt><dd>Rs {centsToDecimalString(quote.tax)}</dd></div>
            )}
            {quote.delivery_fee > 0 && (
              <div className="flex justify-between text-muted"><dt>{c.form.summary.delivery}</dt><dd>Rs {centsToDecimalString(quote.delivery_fee)}</dd></div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-1 font-bold text-offwhite">
              <dt>{c.form.summary.total}</dt><dd className="text-yellow">Rs {centsToDecimalString(quote.total)}</dd>
            </div>
          </dl>
        )}
      </section>

      {error && <p role="alert" className="font-dm text-sm text-red-400">{error}</p>}
      {needsLocation && !coords && (
        <p className="font-dm text-xs text-muted">{c.form.location.needed}</p>
      )}

      {blockedReason && (
        <p role="status" className="mb-2 text-center font-dm text-xs text-yellow/90">
          {blockedReason}
        </p>
      )}
      <Button type="submit" size="xl" className="w-full" disabled={!canSubmit}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : quote ? c.form.submit.placeWithTotal(centsToDecimalString(quote.total)) : c.form.submit.place}
      </Button>
    </form>
  );
}
