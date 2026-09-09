import Link from "next/link";
import { MessageCircle, Truck } from "lucide-react";
import { priceParts } from "@/lib/price-parts";

// ── THE PRICE AND THE BOOK BUTTON, WITHOUT SCROLLING ────────────────────────
//
// Measured on this page at 393x852 (iPhone 15 Pro) before this existed:
//
//   page height            3,816px = 4.5 screens
//   first price            y = 1,180  — 1.4 screens down
//   any booking CTA        none above the fold; the only one sat at the bottom
//   WhatsApp               y = 2,393  — 2.8 screens down
//
// A full-bleed gallery pushed the price below the fold, so the two questions
// every renter opens this page with — what does it cost, how do I get it —
// both needed scrolling. This is the pattern every booking product converged
// on for exactly that reason (Airbnb, Booking, Getaround): the price and the
// primary action ride along the bottom, always reachable by the thumb.
//
// It sits ABOVE the tab bar rather than over it, using the same arithmetic
// BottomNav reserves with — 3.875rem of nav plus the identical safe-area
// padding — so it cannot cover the tabs on a phone with a home indicator,
// which a fixed 76px would do.
//
// The page's floating WhatsApp button is suppressed while this renders: two
// WhatsApp entry points 40px apart is a worse screen, not a better one.

export default function VehicleActionBar({
  price,
  unit,
  bookHref,
  whatsappHref,
  vehicleName,
  soldOut,
}: {
  price: string;
  unit?: string | null;
  bookHref: string;
  whatsappHref: string | null;
  vehicleName: string;
  soldOut?: boolean;
}) {
  const parts = priceParts(price);
  return (
    <>
      {/* The strip the bar floats over, so the last card is never trapped
          underneath it. Same arithmetic as the bar itself rather than a number
          measured once on one device. */}
      <div
        aria-hidden
        className="h-[calc(4.5rem+max(0.75rem,env(safe-area-inset-bottom)))]"
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.875rem+max(0.75rem,env(safe-area-inset-bottom)))] z-30 px-3 md:bottom-0 md:px-5 md:pb-4">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-white/12 bg-dark/90 px-4 py-3 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <div className="min-w-0 flex-1">
            {/* ── THE NUMBER BIG, THE PROMISE INTACT ──────────────────────
                item.price is one free-text box the owner types everything
                into: "Rs 1999(Free delivery)". Printed raw at 393px this bar
                read "Rs 1999(Fr…" — truncating away the single best trust
                signal the business has. Split, the number can be big and the
                delivery promise can be said properly. */}
            <p className="truncate font-syne text-lg font-extrabold leading-none text-yellow">
              {parts.display}
            </p>
            <p className="mt-1 flex items-center gap-1.5 truncate font-dm text-[11px] leading-none text-muted">
              {unit && <span>{unit}</span>}
              {parts.freeDelivery && (
                <>
                  {unit && <span aria-hidden>·</span>}
                  <span className="inline-flex items-center gap-1 text-[#5FD08A]">
                    <Truck size={11} aria-hidden /> Free delivery
                  </span>
                </>
              )}
            </p>
          </div>

          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              // A label, not just an icon: this business closes on WhatsApp and
              // a screen reader announcing "link" helps nobody.
              aria-label={`Ask about the ${vehicleName} on WhatsApp`}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#25D366]/40 bg-[#25D366]/12 text-[#25D366] transition active:scale-95"
            >
              <MessageCircle size={20} aria-hidden />
            </a>
          )}

          <Link
            href={bookHref}
            className="flex h-12 shrink-0 items-center justify-center rounded-full bg-yellow px-6 font-syne text-sm font-bold text-dark transition active:scale-95"
          >
            {/* "Check dates" when it is out today: offering "Book" for
                something already gone is the kind of small lie that costs the
                next booking too. */}
            {soldOut ? "Check dates" : "Book"}
          </Link>
        </div>
      </div>
    </>
  );
}
