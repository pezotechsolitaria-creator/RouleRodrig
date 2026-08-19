import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminLegal from "./AdminLegal";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Server-side gate, same cookie session as the rest of /admin. Both API routes
// re-check independently, so this redirect is UX rather than the boundary.
export default async function AdminLegalPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">PLATFORM</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Legal identity</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Who is legally publishing this site. These details appear on the legal notice, in the
          privacy policy and in the footer. Anything left blank shows publicly as{" "}
          <span className="text-yellow/80">&ldquo;to be confirmed by the operator&rdquo;</span> — which is
          honest, but it is what a bank or a supplier will notice first.
        </p>

        <div className="mt-6">
          <AdminLegal />
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
