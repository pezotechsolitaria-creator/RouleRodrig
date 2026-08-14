import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DriverDashboard from "./DriverDashboard";
import NotificationCenter from "@/components/NotificationCenter";
import ConsoleAccountLink from "@/components/ConsoleAccountLink";
import { Truck } from "lucide-react";
import { VEHICLE_LABEL, vehicleEligibilityNote } from "@/lib/delivery/vehicle";

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

  // What this driver's vehicle means for the jobs they are offered (M103).
  // Read here rather than in the client dashboard: it is one row, it does not
  // change between renders, and a driver should not have to wait on a fetch to
  // learn why large items do or do not reach them.
  //
  // Runs on the DRIVER'S OWN session, and delivery_drivers' RLS only lets them
  // see their own row — so this cannot become a way to read the fleet.
  const { data: me } = await supabase
    .from("delivery_drivers")
    .select("vehicle_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const vehicle = (me as { vehicle_type?: string | null } | null)?.vehicle_type ?? null;

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ROULÉ RODRIGUES</p>
            <h1 className="mt-1 font-syne text-2xl font-extrabold">Deliveries</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* A driver is a person with an account, not only a driver. This is
                the route to the rest of it — the console had none. */}
            <ConsoleAccountLink />
            <NotificationCenter className="-mr-2 shrink-0" />
          </div>
        </div>
        {/* Stated up front, and phrased as what they GET. A scooter rider is
            not being penalised — they are simply not sent a fridge — and a
            driver who never sees a large job deserves to know that is a rule
            rather than a quiet shortage of work. */}
        {vehicle && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-dark-card px-3.5 py-2.5 font-dm text-xs leading-relaxed text-muted">
            <Truck size={14} className="mt-0.5 shrink-0 text-yellow/70" />
            <span>
              <span className="text-offwhite/80">{VEHICLE_LABEL[vehicle] ?? vehicle}.</span>{" "}
              {vehicleEligibilityNote(vehicle)}
            </span>
          </p>
        )}

        <div className="mt-5">
          <DriverDashboard />
        </div>
      </div>
    </main>
  );
}
