"use client";

import { useState } from "react";
import Image from "next/image";
import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Ticket, Check, X, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import type { EventTicketType } from "@/lib/events/queries";

// "CHOOSE YOUR EXPERIENCE" — the conversion screen.
//
// ── WHY THIS REPLACED THE QUANTITY LIST ─────────────────────────────────────
// The previous component showed every ticket type as a row with a [-] 1 [+]
// stepper. That is a grocery list: it asks "how many" before the customer has
// decided "which", and it gives VIP no way to be anything other than Standard
// at a higher price. A customer comparing tiers is comparing PROMISES —
// priority entrance, a VIP area, a drink — and a name and a number cannot carry
// one.
//
// So: cards first (image, subtitle, price, what is left), then a detail sheet
// with the full description and inclusions, and only THEN a quantity.
//
// ── WHAT THIS COMPONENT DOES NOT DO ─────────────────────────────────────────
// It does not price anything, hold inventory, or know what a reservation is.
// Selecting a package puts a variant in the existing cart and hands over to
// checkout, which derives every amount server-side (RR012), locks the stock row
// and enforces the per-order limits. The numbers rendered here are for the
// human; the server never trusts them.
export default function PackagePicker({
  storeId,
  storeName,
  slug,
  ticketTypes,
  disabled,
}: {
  storeId: string;
  storeName: string;
  /** Where to send the buyer next — the EVENT checkout, not the shop one. */
  slug: string;
  ticketTypes: EventTicketType[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const [open, setOpen] = useState<EventTicketType | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPackage(t: EventTicketType) {
    setError(null);
    setQty(Math.max(1, t.minPerOrder));
    setOpen(t);
  }

  async function reserve() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      addItem({ storeId, storeName, variantId: open.variantId, quantity: qty });
      posthog.capture?.("event_package_selected", {
        store_id: storeId, variant_id: open.variantId, quantity: qty, price: open.price,
      });
      // The EVENT checkout. /checkout is the marketplace form and would ask a
      // concert-goer to choose a delivery zone.
      router.push(`/events/${slug}/checkout`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reserve those tickets.");
      setBusy(false);
    }
  }

  if (ticketTypes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <Ticket className="mx-auto text-muted" size={22} />
        <p className="mt-3 font-syne text-base font-bold text-offwhite">Tickets aren&apos;t on sale yet</p>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
          Check back soon — or follow Roulé Rodrigues to hear when they go live.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {ticketTypes.map((t) => (
          <PackageCard key={t.variantId} pkg={t} disabled={disabled} onOpen={() => openPackage(t)} />
        ))}
      </div>

      {open && (
        <PackageSheet
          pkg={open}
          qty={qty}
          setQty={setQty}
          busy={busy}
          error={error}
          disabled={disabled}
          onClose={() => { setOpen(null); setError(null); }}
          onReserve={reserve}
        />
      )}
    </>
  );
}

function availability(t: EventTicketType): { label: string; tone: string } | null {
  if (t.soldOut) return { label: "Sold out", tone: "text-red-300 border-red-500/25 bg-red-500/10" };
  if (!t.salesOpen) {
    const notYet = t.salesStart && new Date(t.salesStart) > new Date();
    return notYet
      ? { label: "Not on sale yet", tone: "text-orange-300 border-orange-400/30 bg-orange-400/10" }
      : { label: "Sales closed", tone: "text-muted border-white/15 bg-white/5" };
  }
  // Scarcity, but only when it is true. A permanent "only a few left!" is the
  // fastest way to stop being believed.
  if (t.remaining <= 10) {
    return { label: `Only ${t.remaining} left`, tone: "text-yellow border-yellow/30 bg-yellow/10" };
  }
  return { label: `${t.remaining} remaining`, tone: "text-muted border-white/15 bg-white/5" };
}

function PackageCard({
  pkg: t, disabled, onOpen,
}: { pkg: EventTicketType; disabled?: boolean; onOpen: () => void }) {
  const avail = availability(t);
  const unavailable = t.soldOut || !t.salesOpen || disabled;

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-dark-card transition-colors ${
        unavailable ? "border-white/[0.07] opacity-70" : "border-white/10 hover:border-yellow/40"
      }`}
    >
      {/* The image is the point. A ticket tier without one is a table row. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
        {t.imageUrl ? (
          <Image
            src={t.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Ticket size={28} className="text-white/15" />
          </div>
        )}
        {avail && (
          <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 font-dm text-[11px] font-medium backdrop-blur-sm ${avail.tone}`}>
            {avail.label}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-syne text-lg font-extrabold uppercase tracking-wide text-offwhite">{t.name}</h3>
        {t.subtitle && <p className="mt-0.5 font-dm text-sm text-muted">{t.subtitle}</p>}

        {t.inclusions.length > 0 && (
          <ul className="mt-3 space-y-1">
            {t.inclusions.slice(0, 3).map((inc, i) => (
              <li key={i} className="flex items-start gap-1.5 font-dm text-xs text-muted">
                <Check size={12} className="mt-0.5 shrink-0 text-yellow" /> {inc}
              </li>
            ))}
            {t.inclusions.length > 3 && (
              <li className="font-dm text-xs text-muted/70">+{t.inclusions.length - 3} more</li>
            )}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="font-syne text-xl font-extrabold text-yellow">
            Rs {centsToDecimalString(t.price)}
          </p>
          <Button size="sm" variant={unavailable ? "outline" : "default"} disabled={unavailable} onClick={onOpen}>
            {t.soldOut ? "Sold out" : !t.salesOpen ? "Not available" : <>View details <ArrowRight size={14} className="ml-1" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PackageSheet({
  pkg: t, qty, setQty, busy, error, disabled, onClose, onReserve,
}: {
  pkg: EventTicketType; qty: number; setQty: (n: number) => void;
  busy: boolean; error: string | null; disabled?: boolean;
  onClose: () => void; onReserve: () => void;
}) {
  // The ceiling is whichever runs out first: what the organiser allows per
  // order, or what is actually left. create_order enforces both again (RR016 /
  // RR007) — this only stops the customer reaching a refusal.
  const ceiling = Math.max(1, Math.min(t.maxPerOrder ?? t.remaining, t.remaining));
  const floor = Math.max(1, t.minPerOrder);
  const total = qty * t.price;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      role="dialog" aria-modal="true" aria-label={`${t.name} details`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Bottom sheet on a phone, centred dialog on a desktop. Most of this
          traffic arrives from WhatsApp on a phone held in one hand. */}
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-dark sm:rounded-3xl">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
          {t.imageUrl ? (
            <Image src={t.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 32rem" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center"><Ticket size={34} className="text-white/15" /></div>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-offwhite backdrop-blur-sm transition-colors hover:text-yellow"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <h2 className="font-syne text-2xl font-extrabold uppercase tracking-wide text-offwhite">{t.name}</h2>
          <p className="mt-1 font-syne text-xl font-extrabold text-yellow">Rs {centsToDecimalString(t.price)}</p>
          {t.subtitle && <p className="mt-1 font-dm text-sm text-muted">{t.subtitle}</p>}

          {t.description && (
            <p className="mt-4 whitespace-pre-line font-dm text-sm leading-relaxed text-offwhite/85">
              {t.description}
            </p>
          )}

          {t.inclusions.length > 0 && (
            <div className="mt-5">
              <h3 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">WHAT&apos;S INCLUDED</h3>
              <ul className="mt-2 space-y-1.5">
                {t.inclusions.map((inc, i) => (
                  <li key={i} className="flex items-start gap-2 font-dm text-sm text-offwhite/85">
                    <Check size={14} className="mt-0.5 shrink-0 text-yellow" /> {inc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-dm text-xs text-muted">
              {t.remaining <= 10 ? `Only ${t.remaining} tickets remaining` : `${t.remaining} tickets remaining`}
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="font-dm text-sm text-offwhite">Quantity</span>
              <div className="flex items-center gap-3">
                {/* 44px targets — WCAG 2.5.5, and this is a one-handed flow. */}
                <button
                  onClick={() => setQty(Math.max(floor, qty - 1))}
                  disabled={qty <= floor}
                  aria-label="One fewer ticket"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-offwhite transition-colors hover:border-yellow/50 disabled:opacity-40"
                >
                  <Minus size={16} />
                </button>
                <span aria-live="polite" className="w-8 text-center font-syne text-lg font-bold text-offwhite">{qty}</span>
                <button
                  onClick={() => setQty(Math.min(ceiling, qty + 1))}
                  disabled={qty >= ceiling}
                  aria-label="One more ticket"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-offwhite transition-colors hover:border-yellow/50 disabled:opacity-40"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Never disable a control without saying why. */}
            {qty >= ceiling && t.maxPerOrder !== null && ceiling === t.maxPerOrder && (
              <p className="mt-2 font-dm text-xs text-muted">
                Maximum {t.maxPerOrder} per order for this package.
              </p>
            )}
            {floor > 1 && (
              <p className="mt-2 font-dm text-xs text-muted">This package is sold in {floor}s or more.</p>
            )}

            <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-3">
              <span className="font-dm text-sm text-muted">Total</span>
              <span className="font-syne text-xl font-extrabold text-yellow">Rs {centsToDecimalString(total)}</span>
            </div>
          </div>

          {error && <p role="alert" className="mt-3 font-dm text-sm text-red-400">{error}</p>}

          <Button size="xl" className="mt-4 w-full" disabled={busy || disabled || t.soldOut} onClick={onReserve}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : `Reserve ${t.name}`}
          </Button>
          <p className="mt-2 text-center font-dm text-[11px] text-muted">
            You&apos;ll confirm your details and see how to pay on the next step.
          </p>
        </div>
      </div>
    </div>
  );
}
