import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleUser, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard } from "@/lib/merchant/context";
import { getMerchantSubscription } from "@/lib/merchant/subscription";
import SubscriptionBanner from "@/components/merchant/SubscriptionBanner";
import { signOut } from "./actions";
import QueryProvider from "@/components/merchant/QueryProvider";
import NotificationBell from "@/components/merchant/NotificationBell";
import { MerchantNavDesktop, MerchantNavMobile } from "@/components/merchant/MerchantNav";
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
              aria-label="Merchant dashboard home"
              className="flex items-baseline gap-1.5 font-syne font-extrabold leading-none transition-opacity hover:opacity-80"
            >
              <span className="text-base text-offwhite">Roulé</span>
              <span className="text-base text-yellow">Rodrigues</span>
            </Link>
            <span className="rounded-full border border-yellow/30 bg-yellow/10 px-2 py-0.5 font-bebas text-[9px] tracking-[0.2em] text-yellow">
              MERCHANT
            </span>
            <MerchantNavDesktop />
            <div className="ml-auto flex items-center gap-2">
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
        <MerchantNavMobile />
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
