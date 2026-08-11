import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import FoodOps from "./FoodOps";

// Server-side gate. Same cookie session as the rest of /admin. Every
// /api/admin/food/* route re-checks independently, so this redirect is UX, not
// the security boundary.
export default async function AdminFoodPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">FOOD OPERATIONS</p>
            <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">The kitchen desk</h1>
            <p className="mt-1.5 max-w-2xl font-dm text-sm text-muted">
              You run the food platform from here. Cookers have no login and nothing to install — you
              publish their dishes, take the orders, and ring them. Everything on this page is live on
              /food the moment you save it.
            </p>
          </div>
          <Link
            href="/food"
            target="_blank"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 font-dm text-sm text-muted hover:border-yellow/40 hover:text-yellow"
          >
            View /food <ExternalLink size={13} />
          </Link>
        </div>

        <div className="mt-7">
          <FoodOps />
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
