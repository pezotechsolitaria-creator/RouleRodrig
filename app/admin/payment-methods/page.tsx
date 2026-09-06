import type { Metadata } from "next";
import PaymentMethodsAdmin from "./PaymentMethodsAdmin";

export const metadata: Metadata = {
  title: "Payment methods",
  robots: { index: false, follow: false },
};

// Setting a shop's payment methods on its behalf.
//
// A shop with no method switched on cannot take a single order, and until now
// nothing on this platform said so out loud to anyone but the merchant — who,
// if they are the sort of merchant who needs this screen, was never going to
// see it. Their own settings page could not even load until today.
export default function AdminPaymentMethodsPage() {
  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">MONEY</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Payment methods</h1>
      <p className="mt-1.5 max-w-2xl font-dm text-sm text-muted">
        How each shop can be paid. Fill this in for a merchant who reads you their bank details
        rather than typing them in — every change is recorded against you.
      </p>
      <PaymentMethodsAdmin />
    </div>
  );
}
