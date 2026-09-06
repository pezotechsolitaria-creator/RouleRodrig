import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// ── THE ONLY BLOCK THAT OUTRANKS THE NUMBERS ────────────────────────────────
//
// Roulé Rodrigues stopped taking cash so nothing leaves a shop before the money
// has arrived. For a shop that had only ever ticked "cash", checkout now has
// nothing to offer — and without this banner the merchant sees a normal-looking
// dashboard, a healthy product list, and simply no orders, with no way to find
// out why.
//
// It sits ABOVE the work queue and the money, because a merchant who cannot be
// paid has no numbers worth reading. It takes no kind: a baker, a cook and a
// box office are equally unable to trade without a payment method.

export default function CannotBePaid({ cannotBePaid }: { cannotBePaid: boolean }) {
  if (!cannotBePaid) return null;

  return (
    <section className="mt-7 rounded-2xl border border-red-400/40 bg-red-500/[0.08] p-5">
      <p className="flex items-center gap-2 font-syne text-base font-bold text-red-300">
        <AlertTriangle size={17} /> Customers cannot pay you yet
      </p>
      <p className="mt-1.5 font-dm text-sm text-offwhite/90">
        Roulé Rodrigues orders are paid by bank transfer before you prepare them, so nothing leaves
        your shop unpaid. Add your bank details and your shop can take orders again — it takes a
        minute.
      </p>
      <Link
        href="/merchant/payments"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark"
      >
        Add my bank details
      </Link>
    </section>
  );
}
