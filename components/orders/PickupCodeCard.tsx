import { Ticket, CheckCircle2 } from "lucide-react";
import { formatPickupCode, type PickupCode } from "@/lib/orders/pickup";

// What the customer holds up at the counter.
//
// Deliberately a CODE and not a QR image: redeeming a QR needs a working camera
// in the merchant's hand, and the shops this serves are market stalls with
// mixed phones and bright sunlight. Eight characters can be shown on a screen,
// read out loud, or forwarded on WhatsApp when someone else collects for you.
// The merchant types them into one box (/merchant/orders) and the order moves
// to Collected in the same transaction.
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
        Your order is ready. Show this code {storeName ? `at ${storeName}` : "at the shop"} to collect it —
        they enter it and the order is closed on the spot.
      </p>

      {/* Big, monospaced, selectable: it gets read across a counter and
          sometimes forwarded to whoever is actually collecting. */}
      <p className="mt-4 select-all text-center font-syne text-3xl font-extrabold tracking-[0.25em] text-offwhite sm:text-4xl">
        {formatPickupCode(pickup.code)}
      </p>

      <p className="mt-4 font-dm text-xs leading-relaxed text-muted">
        It works once, and only for this order.
        {expires && <> Valid until {expires.toLocaleDateString()}.</>}{" "}
        If it stops working, the shop can still close the order from their side — nothing is lost.
      </p>
    </section>
  );
}
