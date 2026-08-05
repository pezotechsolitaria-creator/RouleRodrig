import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ClipboardList, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import QueryProvider from "@/components/merchant/QueryProvider";
import NotificationBell from "@/components/merchant/NotificationBell";
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

  return (
    <QueryProvider>
      <div className="min-h-screen bg-dark text-offwhite">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-dark/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
            <span className="flex items-baseline gap-1.5 font-syne font-extrabold leading-none">
              <span className="text-base text-offwhite">Roulé</span>
              <span className="text-base text-yellow">Rodrigues</span>
            </span>
            <span className="rounded-full border border-yellow/30 bg-yellow/10 px-2 py-0.5 font-bebas text-[9px] tracking-[0.2em] text-yellow">
              MERCHANT
            </span>
            <Link
              href="/merchant/orders"
              className="ml-4 hidden items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-yellow sm:flex"
            >
              <ClipboardList size={14} /> Orders
            </Link>
            <Link
              href="/merchant/payments"
              className="ml-3 hidden items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-yellow sm:flex"
            >
              <Wallet size={14} /> Payments
            </Link>
            <div className="ml-auto flex items-center gap-2">
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
        <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
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
