import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminManagedTicketing from "./AdminManagedTicketing";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Server-side gate. Same cookie session as the rest of /admin. The API route
// re-checks independently and every admin_* RPC refuses a signed-in non-admin
// (and does not grant EXECUTE to `authenticated` at all), so this redirect is
// UX rather than the security boundary.
export default async function AdminManagedTicketingPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">EVENTS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Managed ticketing</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Organisers who have asked Roulé Rodrigues to run their ticketing. You set the fee and what
          it covers — there is no default price anywhere in the system, so nothing is charged until
          you quote it here and the organiser accepts.
        </p>
        <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-xs leading-relaxed text-muted">
          <strong className="text-offwhite">This fee is separate from ticket money.</strong> Buyers pay
          the organiser directly and Roulé Rodrigues never holds that money. What you set here is a
          service charge the organiser owes us — it never changes a ticket price, is never deducted
          from their sales, and a ticket refund never reduces an invoice that has already been issued.
        </p>

        <div className="mt-6">
          <AdminManagedTicketing />
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
