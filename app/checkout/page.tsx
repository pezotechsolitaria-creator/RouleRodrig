import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CheckoutForm from "@/components/checkout/CheckoutForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/checkout");

  // pb-32: the fixed BottomNav pill occupies ~75px of the mobile viewport (more
  // on iPhones with a home indicator), and pb-16 left the full-width "Place
  // order" button — the last element of the form — partly underneath it, so
  // taps on the covered strip hit the nav instead of submitting the order.
  return (
    <main className="min-h-screen bg-dark px-4 pb-32 pt-10 text-offwhite md:pb-16">
      <div className="mx-auto max-w-lg">
        <Link href="/cart" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Back to cart
        </Link>
        <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">Checkout</h1>

        <div className="mt-6">
          <CheckoutForm
            defaultName={user.user_metadata?.full_name ?? ""}
            defaultPhone=""
          />
        </div>
      </div>
    </main>
  );
}
