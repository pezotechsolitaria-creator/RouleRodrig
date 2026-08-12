import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminEvents from "./AdminEvents";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Server-side gate. Same cookie session as the rest of /admin; the API route
// re-checks and every admin_* RPC refuses a signed-in non-admin, so this
// redirect is UX rather than the security boundary.
export default async function AdminEventsPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">EVENTS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Events</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Create an event, then publish it when it is ready to sell. The homepage strip and the
          /events page show only events that are <strong className="text-offwhite">published and
          still ahead</strong> — an empty listing means there is nothing upcoming, not that something
          is broken.
        </p>
        <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-xs leading-relaxed text-muted">
          <strong className="text-offwhite">Who does what.</strong> You create the event, assign an
          organiser on the Event Organisers page, and publish it. The organiser adds the ticket
          packages, sets how they get paid, staffs the door and scans tickets on the night — Roulé
          Rodrigues never holds their ticket money.
        </p>

        <div className="mt-6">
          <AdminEvents />
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
