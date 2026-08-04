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

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
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
