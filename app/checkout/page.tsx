import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CheckoutForm from "@/components/checkout/CheckoutForm";
// From lib/cart/domains, NOT lib/cart/CartContext: this is a server component,
// and a plain value imported from a "use client" module arrives as a client
// reference that throws the moment it is used.
import { toCartDomain, type CartDomain } from "@/lib/cart/domains";
import { resolveHoldWindows } from "@/lib/orders/hold-window";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// GUEST CHECKOUT (M20).
//
// This page used to `redirect("/login?next=/checkout")` for anyone without a
// session — the single largest drop in the marketplace funnel. A tourist with a
// full cart had to create an account, leave for a confirmation email, come back
// and sign in; and with no password-reset flow, a returning customer who had
// forgotten their password could not buy at all. The vehicle side of the same
// product has always been account-free.
//
// The session is still read — it just no longer gates. When one exists the
// buyer's name is pre-filled and the order is attached to their account exactly
// as before; when it doesn't, they check out as a guest and the order is keyed
// to a validated email instead.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // WHICH cart is being checked out. There are three independent ones now
  // (food, shop, events) and this page can only ever place ONE order, so the
  // domain has to travel in the URL — the alternative is checking out whichever
  // cart the component happened to read first, which is a coin toss.
  const sp = await searchParams;
  const raw = Array.isArray(sp.cart) ? sp.cart[0] : sp.cart;
  const domain: CartDomain = toCartDomain(raw);
  // WHICH shop, inside that domain. The marketplace now holds one basket per
  // shop (M96), so ?store= says which basket is being paid for. It is a hint
  // for picking the basket and never an authority: create_order() re-derives
  // every price and rule from the storeId in the request body, and refuses a
  // total that disagrees with what the customer was shown (RR012).
  const rawStore = Array.isArray(sp.store) ? sp.store[0] : sp.store;
  const storeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawStore ?? "")
    ? (rawStore as string)
    : null;

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    // THE CLOCK THE CUSTOMER COULD NOT SEE (backlog #53).
    //
    // create_order() stamps auto_release_at and a cron cancels the order when
    // it passes. Until now that was disclosed nowhere before the order existed,
    // so a bank-transfer customer could read this page, wire the money three
    // days later and find the order already dead. Resolved here, on the server,
    // from the same SQL create_order() will use.
    holdWindows,
  ] = await Promise.all([supabase.auth.getUser(), resolveHoldWindows()]);

  return (
    <main className="min-h-screen bg-dark px-4 pb-32 pt-10 text-offwhite md:pb-16">
      <div className="mx-auto max-w-lg">
        <Link href="/cart" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Back to your bag
        </Link>
        <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">Checkout</h1>

        <div className="mt-6">
          <CheckoutForm
            domain={domain}
            storeId={storeId}
            defaultName={(user?.user_metadata?.full_name as string) ?? ""}
            defaultPhone=""
            signedInEmail={user?.email ?? null}
            holdWindows={holdWindows}
          />
        </div>
      </div>
    </main>
  );
}
