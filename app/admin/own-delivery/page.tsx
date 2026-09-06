import type { Metadata } from "next";
import OwnDeliveryAdmin from "./OwnDeliveryAdmin";

export const metadata: Metadata = {
  title: "Own delivery",
  robots: { index: false, follow: false },
};

// Which shops may deliver their own orders WITH TRACKING.
//
// Untracked own-delivery needs nothing from this page: it is free, the merchant
// switches it on themselves, and no approval is involved. What is granted here
// is the tracking — the per-driver links and the live job board — because that
// is the part Roulé Rodrigues actually runs.
//
// No price field. The owner prices this privately with each shop, and a number
// typed into an admin form is not where that conversation belongs.
export default function AdminOwnDeliveryPage() {
  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">DELIVERY</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Own delivery</h1>
      <p className="mt-1.5 max-w-2xl font-dm text-sm text-muted">
        Any shop can deliver its own orders for free, without asking. Switching a shop on here
        gives it <strong className="text-offwhite">tracked</strong> delivery: a link per driver,
        and every job followed online.
      </p>
      <OwnDeliveryAdmin />
    </div>
  );
}
