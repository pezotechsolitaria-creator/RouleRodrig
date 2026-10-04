import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import CategoriesDesk from "./CategoriesDesk";

// Unique and private: every page under /admin shares the layout's title, and
// this one says which desk the tab is (architecture review 2026-09-30, item 5).
export const metadata: Metadata = {
  title: "Marketplace categories — Admin",
  robots: { index: false, follow: false },
};

// Server-side gate. Same cookie session as the rest of /admin. The API route
// re-checks independently, so this redirect is UX, not the security boundary.
export default async function AdminCategoriesPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">MARKETPLACE</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Marketplace categories</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          The shelves people browse the shop by. Each one is a subject — local products, vehicle care —
          and can hold things to buy and services to book. A shelf only shows on /shop once something is
          filed on it.
        </p>

        <div className="mt-6">
          <CategoriesDesk />
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
