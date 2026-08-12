import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import KitchenBoard from "./KitchenBoard";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// The cook's home. Gated here rather than client-side so someone who is not
// signed in lands on the login wall instead of a screen that flashes and then
// empties. Which KITCHEN they can see is decided by the database (M72), not by
// this page.
export default async function KitchenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/kitchen");

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ROULÉ RODRIGUES</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">Kitchen</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Today&apos;s orders. Tap the button when each step is done.
        </p>
        <div className="mt-5">
          <KitchenBoard />
        </div>
      </div>
    </main>
  );
}
