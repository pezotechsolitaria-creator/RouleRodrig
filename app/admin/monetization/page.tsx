import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminMonetization from "./AdminMonetization";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Server-side gate. Same cookie session as the rest of /admin. The API route
// re-checks independently and the RPCs refuse any signed-in non-admin, so this
// redirect is UX rather than the security boundary — the same layering as
// /admin/delivery-zones.
export default async function AdminMonetizationPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">PLATFORM</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Monetization</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Choose how the marketplace earns. You can start free, switch to commission or a monthly plan
          later, or run both together — orders already placed always keep the terms they were placed under.
        </p>

        <div className="mt-6">
          <AdminMonetization />
        </div>
      </div>
      <Toaster
        theme="dark"
        toastOptions={{
          classNames: {
            toast: "bg-dark-card! border-white/10! text-offwhite! font-dm!",
            title: "text-offwhite!",
            description: "text-muted!",
          },
        }}
      />
    </main>
  );
}
