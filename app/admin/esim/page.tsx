import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import AdminEsim from "./AdminEsim";
import { Toaster } from "@/components/ui/sonner";

// The eSIM desk. Same cookie session as the rest of /admin; the API route
// re-checks independently, so this redirect is UX, not the security boundary.
export default async function AdminEsimPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">WHAT YOU SELL</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">eSIM store</h1>
        <p className="mt-1.5 max-w-2xl font-dm text-sm text-muted">
          Every eSIM sold on /esim, the plans on sale and what each one earns. Only plans that roam onto my.t or
          Emtel can be switched on — Chili has no signal on Rodrigues.
        </p>
        <div className="mt-6">
          <AdminEsim />
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
