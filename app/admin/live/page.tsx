import type { Metadata } from "next";
import LiveOperationsMap from "@/components/admin/LiveOperationsMap";
import { readMapFocus, hasFocus } from "@/lib/maps/live-focus";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by /api/admin/live-map. This page
// renders no privileged data itself — every driver, position and customer name
// arrives through that guarded fetch — so there is nothing here to leak before
// the check runs. Same posture as /admin/operations.
// ── ARRIVING FROM A DISPATCH ROW ──────────────────────────────────────────
// The desk links a job's pickup here rather than to Google, so the operator
// sees the pin AND the fleet around it — "who is near this" being the question
// Google cannot answer.
//
// Parsed HERE, in the server component, rather than with useSearchParams in
// the map: that hook forces a Suspense boundary and a client-side bailout for
// a value this page already has. lib/maps/live-focus.ts owns the contract so
// the link that is written and the page that reads it cannot drift.
export default async function AdminLiveMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const focus = readMapFocus(await searchParams);
  const focused = hasFocus(focus);

  return (
    <main className="px-4 py-8 text-offwhite sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">LIVE OPERATIONS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">
          {focused ? "Who is near this job" : "Who is out there"}
        </h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          {focused
            ? "The job is pinned on the map. Every taxi, transfer and delivery driver is on it too — positions refresh every 10 seconds."
            : "Every taxi, transfer and delivery driver on one map. Positions refresh every 10 seconds; the driver you select streams live."}
        </p>
        <div className="mt-6">
          <LiveOperationsMap focus={focus} />
        </div>
      </div>
    </main>
  );
}
