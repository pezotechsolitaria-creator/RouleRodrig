import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OperationsFeed from "@/components/admin/OperationsFeed";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by /api/admin/operations. This
// page renders no privileged data itself — every item arrives through a guarded
// fetch — so there is nothing here to leak before that check runs.
export default function AdminOperationsPage() {
  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">OPERATIONS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">What needs you</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Live state, not an inbox — an item disappears when the problem is actually fixed.
        </p>
        <div className="mt-6">
          <OperationsFeed />
        </div>
      </div>
    </main>
  );
}
