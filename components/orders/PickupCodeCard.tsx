import { Ticket, CheckCircle2 } from "lucide-react";
import { formatPickupCode, type PickupCode } from "@/lib/orders/pickup";
import PickupQr from "./PickupQr";

// What the customer holds up at the counter: a QR, and the same code in
// characters underneath.
//
// BOTH, not one or the other. The QR encodes a URL, so the merchant's own
// camera app decodes it and drops them straight on the confirm screen — no
// scanner in our app, no camera permission, no BarcodeDetector, which is what
// makes it work on every phone including iPhones. The characters are what
// happens when the camera won't focus, the screen is cracked, the battery is
// flat and the customer reads it off a WhatsApp message, or somebody else is
// collecting on their behalf. On a market stall in Rodrigues all of those are
// Tuesday, so the fallback is not a lesser path — it is the same single-use
// token, typed instead of scanned.
export default function PickupCodeCard({
  pickup,
  storeName,
  className = "",
}: {
  pickup: PickupCode;
  storeName?: string | null;
  className?: string;
}) {
  // Already handed over: the code is spent and must not look presentable again.
  if (pickup.redeemedAt) {
    return (
      <section className={`rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-5 ${className}`}>
        <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-green-400">
          <CheckCircle2 size={15} /> Collected
        </h2>
        <p className="mt-2 font-dm text-sm text-offwhite/85">
          This order was handed over on {new Date(pickup.redeemedAt).toLocaleString()}.
        </p>
      </section>
    );
  }

  if (!pickup.code) return null;

  const expires = pickup.expiresAt ? new Date(pickup.expiresAt) : null;

  return (
    <section aria-labelledby="pickup-heading" className={`rounded-2xl border border-yellow/25 bg-yellow/[0.06] p-5 ${className}`}>
      <h2 id="pickup-heading" className="flex items-center gap-1.5 font-syne text-sm font-bold text-yellow">
        <Ticket size={15} /> Your pickup code
      </h2>
      <p className="mt-2 font-dm text-sm leading-relaxed text-offwhite/85">
        Your order is ready. Show this {storeName ? `at ${storeName}` : "at the shop"} to collect it —
        they scan it with their phone camera, or type the code, and the order is closed on the spot.
      </p>

      <div className="mt-4 flex flex-col items-center gap-3">
        <PickupQr code={pickup.code} />
        {/* Big and selectable: it gets read across a counter and sometimes
            forwarded to whoever is actually collecting. */}
        <p className="select-all text-center font-syne text-3xl font-extrabold tracking-[0.25em] text-offwhite sm:text-4xl">
          {formatPickupCode(pickup.code)}
        </p>
      </div>

      <p className="mt-4 font-dm text-xs leading-relaxed text-muted">
        The code works once, and only for this order. If the camera won&apos;t read it, the shop can
        type it instead.
        {expires && <> Valid until {expires.toLocaleDateString()}.</>}{" "}
        If it stops working altogether, the shop can still close the order from their side — nothing is lost.
      </p>
      <p className="mt-2 font-dm text-xs text-muted">
        Turn your screen brightness up before you hand it over — that is the usual reason a scan fails.
      </p>
    </section>
  );
}
