import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, ShieldCheck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ApplyForm from "../../driver/apply/ApplyForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// ── The way in for people who are not drivers ───────────────────────────────
//
// The owner: "everyone can do it but first should be confirmed by the admin."
//
// The second half already existed and the first half was invisible. `foot` has
// been a registerable vehicle type since the beginning, so a person with no
// vehicle could always have applied, been approved, and qualified for every
// standard job — which is what almost every errand is. Nobody could have known
// that. The only door said "DELIVERY PARTNER · Deliver with Roulé Rodrigues ·
// Pick up orders from local shops", and a person willing to queue at the bank
// for a neighbour does not read that and see themselves.
//
// So this is the same application behind a door they recognise. It shares
// ApplyForm rather than copying it — one form, one validation, one place where
// the terms live — and only changes what it defaults to: errands, on foot.
//
// It is NOT a promise of instant work. The admin still confirms, exactly as
// for a driver, and the page says so in the first screenful rather than after
// somebody has filled the whole thing in.
export default async function ErrandsJoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/errands/join");

  const { data: existing } = await supabase
    .from("delivery_drivers")
    .select("status, can_run_errands")
    .eq("user_id", user.id)
    .maybeSingle();

  const row = existing as
    | { status?: string | null; can_run_errands?: boolean }
    | null;

  // Already approved AND already signed up for errands — there is nothing to
  // apply for, so send them to the work.
  if (row?.status === "approved" && row.can_run_errands) redirect("/errands");
  // Approved as a driver but not for errands: the form is still the right
  // place (it updates the existing row), so they fall through to it.

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        <Link
          href="/deliver"
          className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">
          ERRAND RUNNER
        </p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">
          Get things done for people
        </h1>
        <p className="mt-2 font-dm text-sm text-muted">
          Somebody needs their CEB bill paid, a place held in a queue, or a
          prescription collected. You say what you would charge, and they choose.
        </p>

        <ul className="mt-5 space-y-2.5">
          {[
            {
              Icon: ClipboardCheck,
              title: "No vehicle needed",
              body: "Most errands are done on foot. If you have a scooter or a car, say so and you will see more.",
            },
            {
              Icon: Wallet,
              title: "You name the price",
              body: "Every job is yours to price. Nothing is assigned to you and you are never obliged to take one.",
            },
            {
              Icon: ShieldCheck,
              // Said here, not discovered later. Somebody who fills in a form
              // expecting to start this afternoon and then hears nothing has
              // been misled by the page, not by the queue.
              title: "We check every applicant first",
              body: "Roulé Rodrigues confirms your account before any job reaches you. People are trusting you with their money and their errands.",
            },
          ].map(({ Icon, title, body }) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3"
            >
              <Icon size={17} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
              <span className="min-w-0">
                <span className="block font-syne text-sm font-bold text-offwhite">
                  {title}
                </span>
                <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-7">
          <ApplyForm
            existingStatus={(row?.status as string | null) ?? null}
            defaultRole="errand"
          />
        </div>
      </div>
    </main>
  );
}
