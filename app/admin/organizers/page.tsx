import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminOrganizers from "./AdminOrganizers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Server-side gate. Same cookie session as the rest of /admin. The API route
// re-checks independently and every admin_* RPC refuses a signed-in non-admin,
// so this redirect is UX rather than the security boundary — the same layering
// as /admin/delivery-zones and /admin/monetization.
export default async function AdminOrganizersPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">EVENTS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Organisers</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          People who run events on Roulé Rodrigues. An organiser is <strong className="text-offwhite">not</strong> a
          shop — they never see the marketplace, and they can only reach the events you assign them here.
          Invitation is the only way in; nobody can register as an organiser.
        </p>

        <div className="mt-6">
          <AdminOrganizers />
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
