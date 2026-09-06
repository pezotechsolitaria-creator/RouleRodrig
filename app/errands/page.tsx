import type { Metadata } from "next";
import ConsoleBackLink from "@/components/ConsoleBackLink";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DriverDashboard from "../driver/DriverDashboard";
import NotificationCenter from "@/components/NotificationCenter";
import ConsoleAccountLink from "@/components/ConsoleAccountLink";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// ── The errand runner's console ─────────────────────────────────────────────
//
// The owner: "it can be everything and everyone can do it but first should be
// confirmed by the admin ofc... it should has its own dashboard."
//
// ── WHY THIS IS ITS OWN ROUTE AND NOT ITS OWN DASHBOARD ────────────────────
// It renders <DriverDashboard only="errand" />, and that is the whole point.
// Quoting, accepting, the handover PIN, the money, the ratings and the
// cancellation rules are ONE machine. A parallel console for errand runners
// would be a second place for every one of those to drift, and this codebase
// has already paid for that mistake more than once.
//
// What is genuinely theirs is the part a person actually experiences: the
// route they bookmark, the words on the page, and a board with none of
// somebody else's parcel runs on it. A person who signed up to queue at the
// bank should never land on a screen headed "Deliveries" that opens by telling
// them what their vehicle may carry.
//
// ── THE GATE ───────────────────────────────────────────────────────────────
// Three checks, in the order that gives the most useful answer:
//   no account      -> the sign-up page, because they have not applied
//   not approved    -> /driver, which already explains "waiting on us"
//   not an errand runner -> /driver, which is the console they DO have
// The real boundary is SQL: driver_open_requests returns nothing to an
// unapproved account and nothing errand-shaped to somebody without the role,
// and offer_delivery_quote refuses the same. This redirect is courtesy.
export default async function ErrandsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/errands");

  // The driver's OWN session — delivery_drivers' RLS shows them only their own
  // row, so this cannot become a way to read the roster.
  const { data: me } = await supabase
    .from("delivery_drivers")
    .select("status, can_run_errands")
    .eq("user_id", user.id)
    .maybeSingle();

  const row = me as { status?: string | null; can_run_errands?: boolean } | null;
  if (!row) redirect("/errands/join");
  if (row.status !== "approved") redirect("/driver");
  if (!row.can_run_errands) redirect("/driver");

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        <ConsoleBackLink />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
              ROULÉ RODRIGUES
            </p>
            <h1 className="mt-1 font-syne text-2xl font-extrabold">Errands</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ConsoleAccountLink />
            <NotificationCenter className="-mr-2 shrink-0" />
          </div>
        </div>

        {/* No vehicle line here, deliberately. The driver console opens by
            saying what your vehicle may carry, which is the right first
            sentence there and the wrong one on a screen where most jobs carry
            nothing at all. */}
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-dark-card px-3.5 py-2.5 font-dm text-xs leading-relaxed text-muted">
          <ClipboardCheck size={14} className="mt-0.5 shrink-0 text-yellow/70" />
          <span>
            Jobs people want done — paying a bill, queuing at a counter,
            collecting something ready.{" "}
            <span className="text-offwhite/80">You name your own price</span>, and
            the customer chooses.
          </span>
        </p>

        <div className="mt-5">
          <DriverDashboard only="errand" />
        </div>

        {/* Somebody approved for both should not have to guess where the rest
            of their work went. */}
        <p className="mt-8 flex items-center justify-center gap-1.5 font-dm text-xs text-muted">
          <Clock size={12} />
          <Link href="/driver" className="underline hover:text-yellow">
            Deliveries and shopping runs are on the driver console
          </Link>
        </p>
      </div>
    </main>
  );
}
