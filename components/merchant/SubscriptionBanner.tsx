import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { MerchantSubscription } from "@/lib/merchant/subscription";

// Shown across the merchant area whenever selling is at risk. Deliberately
// spells out exactly which capabilities stop, because the server-side block is
// otherwise a bare RR008 error at the worst possible moment (mid-checkout for
// their customer, or mid-edit for them).
export default function SubscriptionBanner({ sub }: { sub: MerchantSubscription | null }) {
  if (!sub || (!sub.inGracePeriod && !sub.hasExpired)) return null;

  if (sub.hasExpired) {
    return (
      <div role="alert" className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/[0.07] p-4">
        <h2 className="flex items-center gap-2 font-syne text-sm font-bold text-red-300">
          <AlertTriangle size={16} /> Your subscription has expired
        </h2>
        <p className="mt-1.5 font-dm text-sm text-offwhite/90">Until you renew, your shop cannot:</p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 font-dm text-sm text-muted">
          <li>receive new marketplace orders</li>
          <li>publish products</li>
          <li>edit products</li>
          <li>edit shop settings</li>
        </ul>
        <p className="mt-2 font-dm text-sm text-muted">
          Your existing products stay visible and your order history stays available — nothing is lost.
        </p>
        <Link
          href="/merchant/subscription"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
        >
          Renew subscription
        </Link>
      </div>
    );
  }

  return (
    <div role="status" className="mb-4 rounded-2xl border border-orange-400/30 bg-orange-400/[0.07] p-4">
      <h2 className="flex items-center gap-2 font-syne text-sm font-bold text-orange-300">
        <Clock size={16} /> Your subscription has lapsed
      </h2>
      <p className="mt-1.5 font-dm text-sm text-offwhite/90">
        You&apos;re in a grace period — {sub.graceDaysRemaining} day{sub.graceDaysRemaining === 1 ? "" : "s"} left.
        Your shop keeps selling until it ends, then orders and edits stop.
      </p>
      <Link
        href="/merchant/subscription"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-orange-400/40 px-4 py-2 font-syne text-sm font-bold text-orange-200 transition-colors hover:bg-orange-400/10"
      >
        Renew now
      </Link>
    </div>
  );
}
