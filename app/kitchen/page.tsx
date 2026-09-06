import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UtensilsCrossed, Package, Truck, Clock } from "lucide-react";
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

  // An OWNER gets a way back to their own dashboard; a cook does not, because
  // there is nothing there for them and the link would only lead to a screen
  // that refuses them. role='owner' is the same line that decides who may see
  // money at all (M81).
  const { data: ownerRows } = await supabase
    .from("kitchen_staff")
    .select("store_id")
    .eq("role", "owner")
    .limit(1);
  const isOwner = (ownerRows?.length ?? 0) > 0;

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-6 text-offwhite">
      <div className="mx-auto max-w-lg">
        {/* THE WAY OUT. There was none: the only link here was "My dashboard"
            and only for owners, so a cook opening /kitchen from a bookmark had
            no route to anything else on the platform — and neither did an owner
            who wanted their orders or their account rather than the shop. */}
        <div className="flex items-start justify-between gap-3">
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-yellow"
          >
            <ArrowLeft size={14} /> My account
          </Link>
          <p className="shrink-0 font-bebas text-[11px] tracking-[0.3em] text-yellow">
            ROULÉ RODRIGUES
          </p>
        </div>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">{kitchenName}</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Today&apos;s orders. Tap the button when each step is done.
        </p>

        {/* ── RUNNING THE PLACE, not just cooking for it ──────────────────
            The owner asked for "the option to add menu, delivery, etc" here.
            All four screens already exist and are complete under /merchant —
            the problem was that /kitchen never said so, and MenuPanel's empty
            state told an OWNER "Roulé Rodrigues adds dishes for you", which was
            never true of somebody who owns the shop.

            Linked rather than rebuilt. A second way to create a product is a
            second set of rules about price, stock and category to keep in step.

            Owners only: a cook on somebody else's team has no business setting
            that shop's prices or delivery, and the merchant console would
            refuse them anyway — a tile that leads to a refusal is worse than no
            tile. */}
        {isOwner && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { href: "/merchant/products", Icon: Package, label: "Add or edit dishes" },
              { href: "/merchant/menu", Icon: UtensilsCrossed, label: "Today's menu" },
              { href: "/merchant/payments", Icon: Truck, label: "Payments & delivery" },
              { href: "/merchant/hours", Icon: Clock, label: "Opening hours" },
            ].map(({ href, Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-white/12 bg-dark-card px-3 font-dm text-sm text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
              >
                <Icon size={15} className="shrink-0 text-yellow/80" aria-hidden />
                <span className="min-w-0 leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-5">
          <KitchenBoard canManage={isOwner} />
        </div>
      </div>
    </main>
  );
}
