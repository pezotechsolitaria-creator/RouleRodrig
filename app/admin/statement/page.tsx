import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OrderStatement from "@/components/admin/OrderStatement";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by /api/admin/statement. This page
// renders no privileged data itself — every figure arrives through a guarded
// fetch — so there is nothing here to leak before that check runs.
export default function AdminStatementPage() {
  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>
        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">STATEMENT</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">Order statement</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Every transaction, oldest first, with a running balance — the record a completed order leaves
          behind once it drops out of the live queue.
        </p>
        <div className="mt-6">
          <OrderStatement />
        </div>
      </div>
    </main>
  );
}
