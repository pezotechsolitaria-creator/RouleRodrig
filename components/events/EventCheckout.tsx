"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import posthog from "posthog-js";
import { Loader2, Ticket, CalendarDays, MapPin, ShieldCheck, AlertTriangle } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { eventDateTime } from "@/lib/events/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

// The ticket checkout.
//
// ── WHAT THIS DELIBERATELY DOES NOT ASK ─────────────────────────────────────
// No delivery method, no GPS, no delivery zone, no "collect from the shop
// during opening hours". A ticket has exactly one fulfilment and the buyer
// should never be asked to pick it. Internally the order still carries
// fulfillment='pickup' — that is the enum create_order() understands — but the
// word is never shown, because "pickup" describes a counter and this is a door.
//
// ── WHAT IT STILL TRUSTS THE SERVER FOR ─────────────────────────────────────
// Everything that matters. Prices come from /api/cart/resolve (live DB read),
// the total is re-derived inside create_order(), and expectedTotal is sent only
// so the RPC can REFUSE (RR012) if a price moved while the buyer was typing.
// Stock is locked in the RPC, not here.

type EventInfo = {
  storeId: string;
  slug: string;
  name: string;
  startsAt: string;
  doorsOpenAt: string | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  supportPhone: string | null;
  terms: string | null;
};

type PaymentOptions = { acceptsCash: boolean; acceptsBankTransfer: boolean; requiresReceipt: boolean };

export default function EventCheckout({
  event,
  signedInEmail,
  defaultName,
}: {
  event: EventInfo;
  signedInEmail: string | null;
  defaultName: string;
}) {
  const router = useRouter();
  // `hydrated` matters here, not just `cart`: SSR and the first paint always see
  // a null cart because localStorage is not readable yet. Treating that as
  // "no tickets selected" would flash an empty state at every buyer who has in
  // fact just chosen a package — the CartContext doc-comment warns about exactly
  // this, and the warning is easy to walk past.
  const { cart, clear, hydrated } = useCart("events");

  const [items, setItems] = useState<ResolvedCartItem[] | null>(null);
  const [payment, setPayment] = useState<PaymentOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [provider, setProvider] = useState<"cash" | "bank_transfer">("bank_transfer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGuest = !signedInEmail;
  // One key per attempt, reused across retries: a dropped response on a phone
  // network otherwise reserves the same seats twice for 48 hours.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined,
  );

  // Only this event's tickets. If the cart holds something else the buyer has
  // wandered in from the marketplace, and silently checking that out as a
  // ticket order would be worse than saying so.
  const cartMatchesEvent = !!cart && cart.storeId === event.storeId && cart.items.length > 0;

  useEffect(() => {
    if (!cartMatchesEvent || !cart) return;
    let cancelled = false;
    fetch("/api/cart/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.items }),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Could not load your tickets.");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setItems(body.items ?? []);
        const p: PaymentOptions = {
          acceptsCash: !!body.payment?.acceptsCash,
          acceptsBankTransfer: !!body.payment?.acceptsBankTransfer,
          requiresReceipt: !!body.payment?.requiresReceipt,
        };
        setPayment(p);
        // Land on something the organiser actually accepts.
        if (p.acceptsBankTransfer) setProvider("bank_transfer");
        else if (p.acceptsCash) setProvider("cash");
      })
      .catch((e) => {
        if (cancelled) return;
        setItems(null);
        setLoadError(e instanceof Error ? e.message : "Could not load your tickets.");
      });
    return () => {
      cancelled = true;
    };
  }, [cart, cartMatchesEvent]);

  const lines = useMemo(() => {
    if (!items || !cart) return [];
    return cart.items
      .map((line) => {
        const found = items.find((i) => i.variantId === line.variantId);
        return found ? { ...found, quantity: line.quantity } : null;
      })
      .filter((x): x is ResolvedCartItem & { quantity: number } => x !== null);
  }, [items, cart]);

  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const ticketCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const identityReady = name.trim().length > 0 && phone.trim().length > 0 && (!isGuest || emailValid);
  const paymentReady =
    (provider === "cash" && !!payment?.acceptsCash) ||
    (provider === "bank_transfer" && !!payment?.acceptsBankTransfer);
  const canSubmit = identityReady && paymentReady && lines.length > 0 && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit || !cart) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: event.storeId,
          items: cart.items,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          // Never shown to the buyer — see the note at the top of this file.
          fulfillment: "pickup",
          provider,
          expectedTotal: total,
          idempotencyKey,
          guestEmail: isGuest ? guestEmail.trim().toLowerCase() : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't reserve those tickets.");

      posthog.capture?.("event_tickets_ordered", {
        store_id: event.storeId,
        tickets: ticketCount,
        total,
        provider,
        is_guest: isGuest,
      });

      clear();

      // A guest has no session, so /orders/[id] — which filters on customer_id —
      // can never show them anything. They travel on the same credential they
      // will use to report payment: order number + email.
      if (isGuest) {
        try {
          sessionStorage.setItem(
            "rr_order_handoff",
            JSON.stringify({ orderNumber: body.order_number, email: guestEmail.trim().toLowerCase() }),
          );
        } catch {
          /* private mode — the manual lookup form still works */
        }
        router.push("/orders/track");
      } else {
        router.push(`/orders/${body.order_id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't reserve those tickets.");
      setSubmitting(false);
    }
  }, [
    canSubmit, cart, event.storeId, name, phone, provider, total, idempotencyKey,
    isGuest, guestEmail, clear, router, ticketCount,
  ]);

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
        <Loader2 className="mx-auto animate-spin text-muted" size={20} />
      </div>
    );
  }

  if (!cartMatchesEvent) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
        <Ticket className="mx-auto text-muted" size={22} />
        <p className="mt-3 font-syne text-base font-bold text-offwhite">No tickets selected</p>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
          Choose a package first and it will appear here.
        </p>
        <Link
          href={`/events/${event.slug}`}
          className="mt-4 inline-block font-dm text-sm font-semibold text-yellow hover:underline"
        >
          Back to {event.name}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* What they are actually buying, in event terms. */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">YOUR TICKETS</h2>
        <p className="mt-2 font-syne text-lg font-extrabold text-offwhite">{event.name}</p>
        <p className="mt-1 flex items-center gap-1.5 font-dm text-sm text-muted">
          <CalendarDays size={13} /> {eventDateTime(event.startsAt, event.timezone)}
        </p>
        {event.venueName && (
          <p className="mt-0.5 flex items-center gap-1.5 font-dm text-sm text-muted">
            <MapPin size={13} /> {event.venueName}
            {event.venueAddress ? `, ${event.venueAddress}` : ""}
          </p>
        )}

        {loadError ? (
          <p role="alert" className="mt-4 font-dm text-sm text-red-400">{loadError}</p>
        ) : items === null ? (
          <p className="mt-4 flex items-center gap-2 font-dm text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Checking availability…
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-2 border-t border-white/10 pt-4">
              {lines.map((l) => (
                <li key={l.variantId} className="flex items-baseline justify-between gap-3">
                  <span className="font-dm text-sm text-offwhite">
                    {l.variantName ?? l.productName}
                    <span className="text-muted"> × {l.quantity}</span>
                  </span>
                  <span className="font-dm text-sm text-offwhite">
                    Rs {centsToDecimalString(l.price * l.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
              <span className="font-syne text-base font-bold text-offwhite">Total</span>
              <span className="font-syne text-lg font-extrabold text-yellow">
                Rs {centsToDecimalString(total)}
              </span>
            </div>
          </>
        )}
      </section>

      {/* Who is coming. The name and phone are what the door and the organiser
          use; the email is where the ticket goes. */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">WHO&apos;S COMING</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="font-dm text-xs text-muted">Full name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoComplete="name" />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">Phone</span>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          {isGuest ? (
            <label className="block">
              <span className="font-dm text-xs text-muted">Email — your ticket goes here</span>
              <Input
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="mt-1"
                inputMode="email"
                autoComplete="email"
                aria-invalid={guestEmail.length > 0 && !emailValid}
              />
              <span className="mt-1 block font-dm text-xs text-muted">
                No account needed. You&apos;ll use this address and your order number to find your
                tickets again.
              </span>
            </label>
          ) : (
            <p className="font-dm text-xs text-muted">
              Your ticket goes to <span className="text-offwhite">{signedInEmail}</span>.
            </p>
          )}
        </div>
      </section>

      {/* How they pay. Roulé Rodrigues never holds ticket money — the organiser
          is paid directly, which is why the confirmation is theirs to give. */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">PAYMENT</h2>
        {payment === null ? (
          <p className="mt-3 font-dm text-sm text-muted">Loading…</p>
        ) : !payment.acceptsCash && !payment.acceptsBankTransfer ? (
          <p role="alert" className="mt-3 flex items-start gap-2 font-dm text-sm text-red-400">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            The organiser hasn&apos;t set up a way to be paid yet, so tickets can&apos;t be sold.
          </p>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {payment.acceptsBankTransfer && (
                <PayOption
                  checked={provider === "bank_transfer"}
                  onSelect={() => setProvider("bank_transfer")}
                  title="Bank transfer"
                  detail="You'll get the organiser's account details on the next screen, then tell them once you've sent it."
                />
              )}
              {payment.acceptsCash && (
                <PayOption
                  checked={provider === "cash"}
                  onSelect={() => setProvider("cash")}
                  title="Cash"
                  detail="Pay the organiser directly. Your place is held until then."
                />
              )}
            </div>
            {provider === "bank_transfer" && payment.requiresReceipt && (
              <p className="mt-3 flex items-start gap-2 font-dm text-xs text-muted">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-yellow" />
                This organiser asks for a photo or PDF of your transfer. You can attach it on the
                next screen — no account needed.
              </p>
            )}
          </>
        )}
      </section>

      {event.terms && (
        <p className="font-dm text-xs leading-relaxed text-muted">{event.terms}</p>
      )}

      {error && (
        <p role="alert" className="font-dm text-sm text-red-400">{error}</p>
      )}

      <Button className="w-full" size="lg" disabled={!canSubmit} onClick={() => void submit()}>
        {submitting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            Reserve {ticketCount > 0 ? `${ticketCount} ` : ""}
            {ticketCount === 1 ? "ticket" : "tickets"}
          </>
        )}
      </Button>

      <p className="text-center font-dm text-xs text-muted">
        Your place is held while you pay. Nothing is charged automatically —
        {" "}the organiser confirms your payment and your ticket is issued then.
      </p>
    </div>
  );
}

function PayOption({
  checked, onSelect, title, detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className={`block w-full rounded-xl border p-3 text-left transition ${
        checked ? "border-yellow/60 bg-yellow/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <span className="font-syne text-sm font-bold text-offwhite">{title}</span>
      <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">{detail}</span>
    </button>
  );
}
