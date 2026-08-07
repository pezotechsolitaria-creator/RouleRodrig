import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CheckoutForm from "@/components/checkout/CheckoutForm";

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
export default async function CheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-dark px-4 pb-32 pt-10 text-offwhite md:pb-16">
      <div className="mx-auto max-w-lg">
        <Link href="/cart" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Back to cart
        </Link>
        <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">Checkout</h1>

        <div className="mt-6">
          <CheckoutForm
            defaultName={(user?.user_metadata?.full_name as string) ?? ""}
            defaultPhone=""
            signedInEmail={user?.email ?? null}
          />
        </div>
      </div>
    </main>
  );
}
