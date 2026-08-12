import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DriverDashboard from "./DriverDashboard";
import NotificationCenter from "@/components/NotificationCenter";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// The driver's home. A signed-in surface, so it is gated here rather than
// letting the client discover it — an unauthenticated driver should land on
// login, not on a dashboard that flashes and then empties.
export default async function DriverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/driver");

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ROULÉ RODRIGUES</p>
            <h1 className="mt-1 font-syne text-2xl font-extrabold">Deliveries</h1>
          </div>
          <NotificationCenter className="-mr-2 shrink-0" />
        </div>
        <div className="mt-5">
          <DriverDashboard />
        </div>
      </div>
    </main>
  );
}
