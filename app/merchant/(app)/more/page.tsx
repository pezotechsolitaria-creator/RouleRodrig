import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard } from "@/lib/merchant/context";
import { getBilling } from "@/lib/merchant/billing";
import { secondaryFor } from "@/components/merchant/MerchantNav";
import MoreList from "@/components/merchant/MoreList";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// ── EVERYTHING THAT IS NOT ONE OF THE FIVE ──────────────────────────────────
//
// Generated from secondaryFor() — the SAME function the dock reads — so this
// page and the tab bar can never disagree about where a merchant can go. That
// disagreement was a real defect in the old home screen, which hand-copied six
// destinations into a tile grid beside a seven-item dock.
//
// Two things become reachable here for the first time: the pickup desk, which
// was linked from no merchant screen at all, and — for a kitchen, whose slot
// three is its Menu — the product catalogue.
export default async function MerchantMorePage() {
  const supabase = await createClient();
  const dashboard = await getMerchantDashboard(supabase);
  if (!dashboard) redirect("/merchant/onboarding");

  const billing = await getBilling(supabase);
  const kind = dashboard.store?.kind ?? "shop";
  const links = secondaryFor(kind, billing.chargesSubscription).map((l) => ({
    href: l.href,
    label: l.label,
  }));

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">MORE</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">
        {dashboard.store?.name ?? dashboard.displayName}
      </h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        Everything you set up once and rarely change.
      </p>

      <MoreList links={links} />
    </div>
  );
}
