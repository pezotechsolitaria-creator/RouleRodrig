import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import KitchenStaffPanel from "@/components/admin/KitchenStaffPanel";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by /api/admin/kitchen-staff. This
// page renders no privileged data itself — everything arrives through a guarded
// fetch — so there is nothing here to leak before that check runs.
export default function AdminKitchenStaffPage() {
  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">KITCHENS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">Kitchen teams</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Give a cook their own screen at /kitchen, so handovers stop going through you.
        </p>
        <div className="mt-6">
          <KitchenStaffPanel />
        </div>
      </div>
    </main>
  );
}
