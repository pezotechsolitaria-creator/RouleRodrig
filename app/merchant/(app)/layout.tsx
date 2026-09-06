import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleUser, LogOut, ChefHat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard, getAccessibleStores, getOwnStoreId } from "@/lib/merchant/context";
import { getMerchantSubscription } from "@/lib/merchant/subscription";
import SubscriptionBanner from "@/components/merchant/SubscriptionBanner";
import StoreSwitcher from "@/components/merchant/StoreSwitcher";
import { signOut, switchStore } from "./actions";
import QueryProvider from "@/components/merchant/QueryProvider";
import NotificationBell from "@/components/merchant/NotificationBell";
import { MerchantNavDesktop, MerchantNavMobile } from "@/components/merchant/MerchantNav";
import { getBilling } from "@/lib/merchant/billing";
import { KIND_VOCAB } from "@/lib/merchant/kind";
import { Toaster } from "@/components/ui/sonner";

// Private area — keep it out of search indexes.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authoritative server-side guard (middleware also redirects, this is the backstop).
  if (!user) redirect("/merchant/login");

  // Surfaced on every merchant page: the server-side block is otherwise a bare
  // RR008 at the worst moment, with no explanation of what stopped or why.
  const dashboard = await getMerchantDashboard(supabase);
  const subscription = dashboard ? await getMerchantSubscription(supabase, dashboard.merchantId) : null;
  // Only fetched to decide whether a switcher is needed at all; it renders
  // nothing when there is one store, which is every ordinary merchant.
  const [stores, currentStoreId] = await Promise.all([
    getAccessibleStores(supabase),
    getOwnStoreId(supabase),
  ]);
  // Drives the food-only Menu tab. Read from the switcher's own list rather
  // than a second query, so the tab and the store selector can never disagree.
  // The kind itself now, not a boolean flattened from it (M172).
  const kind = stores.find((st) => st.id === currentStoreId)?.kind ?? "shop";
  const isKitchen = kind === "kitchen";
  // Whether a "Plan" tab has anything to point at (M171). Under commission
  // billing there is no plan, so the tab is not shown at all.
  const billing = await getBilling(supabase);

  return (
    <QueryProvider>
      <div className="min-h-screen bg-dark text-offwhite">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-dark/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
            {/* A link, not a <span>: the wordmark is the conventional way back
                to a dashboard home, and it was inert — one of two reasons
                /merchant was unreachable from every section page. */}
            <Link
              href="/merchant"
              aria-label={isKitchen ? "Kitchen dashboard home" : "Merchant dashboard home"}
              className="flex items-baseline gap-1.5 font-syne font-extrabold leading-none transition-opacity hover:opacity-80"
            >
              <span className="text-base text-offwhite">Roulé</span>
              <span className="text-base text-yellow">Rodrigues</span>
            </Link>
            {/* Says which business this is, not which codebase it runs on. The
                same dashboard serves shops and restaurants (M81), and calling a
                restaurant "MERCHANT" is the kind of small wrongness that makes
                an owner doubt they are in the right place. */}
            <span className="rounded-full border border-yellow/30 bg-yellow/10 px-2 py-0.5 font-bebas text-[9px] tracking-[0.2em] text-yellow">
              {KIND_VOCAB[kind].badge}
            </span>
            <MerchantNavDesktop kind={kind} hasPlan={billing.chargesSubscription} />
            <div className="ml-auto flex items-center gap-2">
              <StoreSwitcher stores={stores} currentId={currentStoreId} action={switchStore} />
              {/* An owner has two screens: this one, and the cook's board. The
                  cook's board was only reachable by typing /kitchen, which the
                  owner has said repeatedly is not acceptable. Restaurants only —
                  a shop has no kitchen screen to go to. */}
              {isKitchen && (
                <Link
                  href="/kitchen"
                  className="hidden items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted transition-colors hover:border-yellow/50 hover:text-yellow sm:inline-flex"
                >
                  <ChefHat size={13} /> Cook&apos;s screen
                </Link>
              )}
              {/* The way out. A merchant is usually a customer too, and this
                  console had no route to the rest of their account except
                  retyping a URL. */}
              <Link
                href="/account"
                aria-label="My account"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:border-yellow/50 hover:text-yellow"
              >
                <CircleUser size={16} />
              </Link>
              <NotificationBell />
              <form action={signOut}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:border-yellow/50 hover:text-yellow"
                >
                  <LogOut size={16} />
                </button>
              </form>
            </div>
          </div>
        </header>
        {/* Extra bottom padding on phones so the fixed tab bar never covers
            the last control on a page (typically a Save button). */}
        <main className="mx-auto max-w-6xl px-4 pb-28 sm:pb-16">
          <div className="pt-4"><SubscriptionBanner sub={subscription} /></div>
          {children}
        </main>
        <MerchantNavMobile kind={kind} hasPlan={billing.chargesSubscription} />
      </div>
      <Toaster
        theme="dark"
        toastOptions={{
          classNames: {
            toast: "bg-dark-card! border-white/10! text-offwhite! font-dm!",
            title: "text-offwhite!",
            description: "text-muted!",
            actionButton: "bg-yellow! text-dark!",
            cancelButton: "bg-white/10! text-offwhite!",
          },
        }}
      />
    </QueryProvider>
  );
}
