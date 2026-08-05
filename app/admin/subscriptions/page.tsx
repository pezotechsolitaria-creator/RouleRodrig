import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminSubscriptions from "./AdminSubscriptions";
import { Toaster } from "@/components/ui/sonner";

// Server-side gate. Same cookie session as the rest of /admin — a merchant has
// no way to obtain it, since it is issued only by /admin/login against
// ADMIN_PASSWORD and signed with SESSION_SECRET. The API route re-checks
// independently, so this redirect is UX, not the security boundary.
export default async function AdminSubscriptionsPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">PLATFORM</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Merchants &amp; subscriptions</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Approve renewals, change plans, suspend or reactivate a shop. Suspending stops new orders and edits
          immediately — existing products and order history stay intact.
        </p>

        <div className="mt-6">
          <AdminSubscriptions />
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
