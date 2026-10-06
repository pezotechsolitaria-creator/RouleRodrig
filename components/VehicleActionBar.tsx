import Link from "next/link";

// ── THE PRICE AND RESERVE, WITHOUT SCROLLING ────────────────────────────────
//
// Measured on this page at 393x852 (iPhone 15 Pro) before this existed:
//
//   page height            3,816px = 4.5 screens
//   first price            y = 1,180  — 1.4 screens down
//   any booking CTA        none above the fold; the only one sat at the bottom
//
// A full-bleed gallery pushed the price below the fold, so the two questions
// every renter opens this page with — what does it cost, how do I get it —
// both needed scrolling. The price and the primary action ride along the
// bottom, always reachable by the thumb (Airbnb, Booking, Getaround).
//
// It sits ABOVE the tab bar rather than over it, using the same arithmetic
// BottomNav reserves with — 3.875rem of nav plus the identical safe-area
// padding — so it cannot cover the tabs on a phone with a home indicator.
//
// Reserve is a real link to /browse/<cat>?v=<id>#booking — it works with no
// JavaScript at all — and, with it, the page's booking sheet catches the click
// (data-rr-reserve) and opens in place. One number, one button: no slogan in
// the price, and no second WhatsApp entry beside it (the sheet has "Message
// us", owner brief 6 Oct 2026).

export default function VehicleActionBar({
  rate,
  unit,
  sub,
  bookHref,
  reserveId,
  vehicleName,
}: {
  /** The advertised per-day figure (vehiclePriceNumber), whole rupees. */
  rate: number | null;
  unit?: string | null;
  /** One quiet line under the price: "3 days or more · delivery included". */
  sub?: string | null;
  bookHref: string;
  /** The fleet row the sheet opens with. */
  reserveId: string;
  vehicleName: string;
}) {
  return (
    <>
      {/* The strip the bar floats over, so the last card is never trapped
          underneath it. */}
      <div aria-hidden className="h-[calc(5rem+max(0.75rem,env(safe-area-inset-bottom)))]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.875rem+max(0.75rem,env(safe-area-inset-bottom)))] z-30 px-3 md:bottom-0 md:px-5 md:pb-4">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-white/[0.12] bg-dark/90 px-4 py-3 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <div className="min-w-0 flex-1">
            {rate ? (
              <p className="font-syne text-lg font-extrabold leading-none tabular-nums text-offwhite">
                Rs {rate.toLocaleString("en-US")}
                {unit && <span className="ml-1 font-dm text-sm font-normal text-muted">{unit}</span>}
              </p>
            ) : null}
            {/* Wraps rather than truncates (owner brief: no truncation): at
                360px "3 days or more · delivery included" needs a second line,
                and the strip above is sized for it. */}
            {sub && <p className="mt-1 font-dm text-xs leading-tight text-muted">{sub}</p>}
          </div>
          <Link
            href={bookHref}
            data-rr-reserve={reserveId}
            aria-label={`Reserve the ${vehicleName}`}
            className="flex h-12 shrink-0 items-center justify-center rounded-full bg-yellow px-6 font-syne text-[15px] font-bold text-dark transition-colors hover:bg-yellow-dark"
          >
            Reserve
          </Link>
        </div>
      </div>
    </>
  );
}
