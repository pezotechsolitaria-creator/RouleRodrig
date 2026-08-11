import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEventDetail } from "@/lib/events/organizer";
import TicketScanner from "@/components/events/TicketScanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The door, for the organiser working it.
//
// The slug is resolved to a store id and handed to organizer_event_detail(),
// which is gated by can_manage_event() — so an organiser who edits the URL to
// another event's slug gets RR003 → notFound(), and a wrong slug is
// indistinguishable from a forbidden one. redeem_ticket() re-checks the same
// predicate per scan, so this page is not the gate; it only decides what to
// render.
export default async function ScanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!store) notFound();

  const event = await getEventDetail(supabase, (store as { id: string }).id);
  if (!event) notFound();

  return (
    <main className="mx-auto max-w-md px-4 pb-24 pt-8">
      <Link
        href={`/organizer/${event.slug}`}
        className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
      >
        <ArrowLeft size={14} /> {event.name}
      </Link>

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
