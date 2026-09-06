import Link from "next/link";
import ConsoleBackLink from "@/components/ConsoleBackLink";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard, getAccessibleStores, getOwnStoreId } from "@/lib/merchant/context";
import { getMerchantSubscription } from "@/lib/merchant/subscription";
import SubscriptionBanner from "@/components/merchant/SubscriptionBanner";
import StoreSwitcher from "@/components/merchant/StoreSwitcher";
import { switchStore } from "./actions";
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
          {/* NOTHING IN HERE MAY PUSH THE STORE NAME OFF THE SCREEN.
              At 360px the wordmark, the kind badge, the back link, the store
              switcher and the bell were laid out in one non-wrapping row, so
              the switcher — the control that says WHICH BUSINESS YOU ARE
              LOOKING AT, on an account with five of them — was clipped to
              "M4 Tes". The two decorative items collapse on a phone and the
              switcher takes the space they leave. */}
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4">
            {/* A link, not a <span>: the wordmark is the conventional way back
                to a dashboard home, and it was inert — one of two reasons
                /merchant was unreachable from every section page. */}
            <Link
              href="/merchant"
              aria-label={isKitchen ? "Kitchen dashboard home" : "Merchant dashboard home"}
              className="flex shrink-0 items-baseline gap-1.5 font-syne font-extrabold leading-none transition-opacity hover:opacity-80"
            >
              <span className="text-base text-offwhite">Roulé</span>
              {/* The second word is the first thing to go: the merchant knows
                  whose app this is, and does not know which of their five shops
                  is selected until the switcher can be read. */}
              <span className="hidden text-base text-yellow sm:inline">Rodrigues</span>
            </Link>
            {/* Says which business this is, not which codebase it runs on. The
                same dashboard serves shops and restaurants (M81), and calling a
                restaurant "MERCHANT" is the kind of small wrongness that makes
                an owner doubt they are in the right place. */}
            {/* Hidden on a phone. It is the least useful thing in the row —
                the switcher below already names the business, and the badge
                repeats a category the merchant already knows. */}
            <span className="hidden shrink-0 rounded-full border border-yellow/30 bg-yellow/10 px-2 py-0.5 font-bebas text-[9px] tracking-[0.2em] text-yellow sm:inline">
              {KIND_VOCAB[kind].badge}
            </span>
            <MerchantNavDesktop kind={kind} hasPlan={billing.chargesSubscription} />
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
              {/* Labelled "Website", not "Roulé Rodrigues", because the wordmark
                  two inches to the left already says that and goes somewhere
                  else — to /merchant. Two identical labels with different
                  destinations in one header is worse than no back link. */}
              <ConsoleBackLink compactOnMobile />
              {/* min-w-0 so it TRUNCATES inside the row instead of overflowing
                  it, which is what clipped the name in the first place. */}
              <div className="min-w-0 flex-1 sm:flex-none">
                <StoreSwitcher stores={stores} currentId={currentStoreId} action={switchStore} />
              </div>
              {/* An owner has two screens: this one, and the cook's board. The
                  cook's board was only reachable by typing /kitchen, which the
                  owner has said repeatedly is not acceptable. Restaurants only —
                  a shop has no kitchen screen to go to. */}
              {/* The cook's screen was `hidden ... sm:inline-flex`, so it was
                  invisible on exactly the device a cook holds. It is a row in
                  /merchant/more now, where it is reachable at every width. */}
              {/* The account icon that stood here is gone: ConsoleBackLink now
                  goes to /account, so the two were the same destination twice in
                  one header — the exact fault the comment above ConsoleBackLink
                  warns about.

                  Sign out is gone too. It lives at the bottom of /merchant/more
                  as a full-width row, instead of being a 36px target in the
                  worst corner of a phone screen for a thumb — and beside seven
                  other controls, which is where a mis-tap logs somebody out
                  mid-service. */}
              <NotificationBell />
            </div>
          </div>
        </header>
        {/* Extra bottom padding on phones so the fixed tab bar never covers
            the last control on a page (typically a Save button). */}
        <main className="mx-auto max-w-6xl px-4 pb-28 sm:pb-16">
          {/* ONLY WHERE A SUBSCRIPTION IS ACTUALLY CHARGED (M171).
              This banner sits in the LAYOUT, so "Your subscription has expired"
              was following the merchant onto every single page of the console —
              on a platform that stopped charging a subscription and where a
              lapsed plan no longer stops anyone trading. The rows are kept, and
              so is this banner, for the day the owner turns billing back on. */}
          {billing.chargesSubscription && (
            <div className="pt-4">
              <SubscriptionBanner sub={subscription} />
            </div>
          )}
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
