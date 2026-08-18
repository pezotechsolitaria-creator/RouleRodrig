import type { Metadata } from "next";
import LiveOperationsMap from "@/components/admin/LiveOperationsMap";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by /api/admin/live-map. This page
// renders no privileged data itself — every driver, position and customer name
// arrives through that guarded fetch — so there is nothing here to leak before
// the check runs. Same posture as /admin/operations.
export default function AdminLiveMapPage() {
  return (
    <main className="px-4 py-8 text-offwhite sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">LIVE OPERATIONS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">Who is out there</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Every taxi, transfer and delivery driver on one map. Positions refresh every 10 seconds;
          the driver you select streams live.
        </p>
        <div className="mt-6">
          <LiveOperationsMap />
        </div>
      </div>
    </main>
  );
}
