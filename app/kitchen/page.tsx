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

  // Name the restaurant in the title. Read here rather than left to the client
  // so it is on screen before any data loads — a cook glancing at a propped-up
  // phone should see whose kitchen this is, not a generic word.
  const { data: mine } = await supabase
    .from("kitchen_staff")
    .select("stores(name)")
    .limit(3);
  const names = ((mine ?? []) as { stores?: { name?: string } | { name?: string }[] | null }[])
    .map((r) => (Array.isArray(r.stores) ? r.stores[0]?.name : r.stores?.name))
    .filter(Boolean) as string[];
  const kitchenName = names.length === 1 ? names[0] : names.length > 1 ? names.join(" · ") : "Kitchen";

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ROULÉ RODRIGUES</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">{kitchenName}</h1>
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
