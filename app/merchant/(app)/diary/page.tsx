import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard, hasShop } from "@/lib/merchant/context";
import ServiceDiary from "@/components/merchant/ServiceDiary";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// ── The diary, for a business that sells time ──────────────────────────────
//
// Reached from the dock in place of Orders, for a service store only. A car
// wash takes almost nothing through the order queue — the thing it sells is an
// appointment — so putting the diary behind a "More" menu would bury the one
// screen the business actually runs on.
export default async function MerchantDiaryPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  const dashboard = await getMerchantDashboard(supabase);
  const kind = dashboard?.store?.kind ?? "shop";

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">BOOKINGS</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Your diary</h1>

      {kind === "service" ? (
        <>
          <p className="mt-1.5 max-w-lg font-dm text-sm text-muted">
            What is booked, what is still free, and taking a booking while
            somebody is on the phone.
          </p>
          <div className="mt-6 max-w-2xl">
            <ServiceDiary />
          </div>
        </>
      ) : (
        // A bookmark or a stale link, not a mistake worth bouncing somebody
        // for. A sentence saying which of their businesses this belongs to is
        // more use than a silent redirect back where they came from.
        <p className="mt-3 max-w-lg rounded-2xl border border-white/10 bg-dark-card p-4 font-dm text-sm text-muted">
          The diary belongs to a trade — a car wash, a plumber, a mechanic. This
          shop sells goods, so its work arrives through Orders instead. Switch to
          a service business at the top of the screen if you have one.
        </p>
      )}
    </div>
  );
}
