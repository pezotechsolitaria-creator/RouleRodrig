import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ApplyForm from "./ApplyForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DriverApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Applying needs an account: the application IS attached to an identity, and
  // asking for one after the form would lose the answers.
  if (!user) redirect("/login?next=/driver/apply");

  // An approved DELIVERY driver has no business on this page — send them to
  // work. Somebody approved for errands only does: this form is the one
  // self-service way to set can_deliver, and it updates the existing row.
  //
  // Checking `status` alone slammed the last door on them. An applicant who
  // came through /errands/join gets can_deliver=false by default, and once
  // approved BOTH doors closed — /driver/apply sent them to /driver, and
  // /errands/join sent them to /errands — so a runner who bought a scooter and
  // wanted parcel work had to phone the owner. Admin was the only other writer.
  //
  // /errands/join already handles the mirror case, with a comment explaining
  // it. This is the same rule from the other side.
  const { data: existing } = await supabase
    .from("delivery_drivers")
    .select("status, can_deliver")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = existing as { status?: string | null; can_deliver?: boolean } | null;
  if (row?.status === "approved" && row.can_deliver) redirect("/driver");

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        <Link href="/driver" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Back
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">DELIVERY PARTNER</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">Deliver with Roulé Rodrigues</h1>
        <p className="mt-2 font-dm text-sm text-muted">
          Pick up orders from local shops and deliver them around the island, on your own schedule.
          Free to join.
        </p>
        <div className="mt-6">
          <ApplyForm existingStatus={(existing?.status as string | null) ?? null} />
        </div>
      </div>
    </main>
  );
}
