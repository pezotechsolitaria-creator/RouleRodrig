import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getScannerContext } from "@/lib/events/scanner";
import TicketScanner from "@/components/events/TicketScanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The door, for whoever is working it.
//
// M59 CHANGED WHAT THIS PAGE LOADS. It used to call organizer_event_detail(),
// which is gated by can_manage_event() and returns the organiser's bank details,
// every buyer's email and phone, receipt paths and confirmed revenue. Door staff
// would have been refused outright — and if they hadn't been, they would have
// been handed all of that to render a scanner.
//
// It now calls scanner_event_context(), gated by can_scan_event(), which returns
// a name, a date, and whether the event is cancelled. Organisers get the same
// small payload: one door screen, not two.
export default async function ScanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Slug → permission in one gated call. No client-side id lookup to tamper
  // with, and an unknown slug is indistinguishable from a forbidden one.
  const event = await getScannerContext(supabase, slug);
  if (!event) notFound();

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-8">
      {event.canManage ? (
        <Link
          href={`/organizer/${event.slug}`}
          className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
        >
          <ArrowLeft size={14} /> {event.name}
        </Link>
      ) : (
        // Door staff have no dashboard to go back to — sending them to one they
        // cannot open would be a dead end dressed up as navigation.
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
        >
          <ArrowLeft size={14} /> My events
        </Link>
      )}

      <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">Scan tickets</h1>

      {event.cancelledAt ? (
        <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5">
          <p className="font-dm text-sm text-red-300">
            This event is cancelled. Every ticket for it is void — nobody should be admitted.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <TicketScanner eventName={event.name} />
        </div>
      )}

      <p className="mt-6 font-dm text-xs leading-relaxed text-muted">
        Each ticket admits once. If a code has already been scanned you&apos;ll be told when — that
        usually means the same person is being checked twice, but it can also mean a screenshot has
        been passed on. Keep this page open between guests; the camera stops when you leave.
      </p>
    </main>
  );
}
