import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DeliveryBoard from "./DeliveryBoard";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by /api/admin/deliveries. This
// page renders no privileged data itself — every byte arrives through a guarded
// fetch — so there is nothing here to leak before that check runs.
export default function AdminDeliveriesPage() {
  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">DELIVERY</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">Control centre</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Anything late or stuck sorts to the top. If this page looks calm, nothing needs you.
        </p>
        <div className="mt-6">
          <DeliveryBoard />
        </div>
      </div>
    </main>
  );
}
