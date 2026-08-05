import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminDeliveryZones from "./AdminDeliveryZones";
import { Toaster } from "@/components/ui/sonner";

// Server-side gate. Same cookie session as the rest of /admin. The API route
// re-checks independently, so this redirect is UX, not the security boundary.
export default async function AdminDeliveryZonesPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">PLATFORM</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Delivery areas &amp; fees</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Customers pick their area at checkout and pay that area&apos;s fee. Changing a fee only affects new
          orders — every past order keeps the price it was placed at.
        </p>

        <div className="mt-6">
          <AdminDeliveryZones />
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
