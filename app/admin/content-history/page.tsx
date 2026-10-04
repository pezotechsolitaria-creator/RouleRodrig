import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import ContentHistoryDesk from "./ContentHistoryDesk";

export const metadata: Metadata = {
  title: "Content history — Admin",
  robots: { index: false, follow: false },
};

// Server-side gate; /api/admin/content-history re-checks on every call
// (architecture review 2026-09-30, item 6).
export default async function ContentHistoryPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/content" className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Content studio
        </Link>
        <p className="mt-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">WEBSITE</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Content history</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          A copy of the website&apos;s content is kept for every day it changed, for 90 days. Each one
          shows which sections differ from the site as it is now. Restoring one saves a copy of today&apos;s
          content first, so a restore can be undone from this same list.
        </p>

        <div className="mt-6">
          <ContentHistoryDesk />
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
