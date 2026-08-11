import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, AlertTriangle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEventDetail } from "@/lib/events/organizer";
import { centsToDecimalString } from "@/lib/money";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";

export const dynamic = "force-dynamic";

// One event, for the organiser who runs it.
//
// The slug is resolved to a store id and then handed to organizer_event_detail(),
// which is gated by can_manage_event() (M43). So an organiser who edits the URL
// to another event's slug gets RR003 → notFound(), and a wrong slug and a
// forbidden slug are indistinguishable from outside. That is deliberate: a
// distinguishable "forbidden" tells an attacker the event exists.
export default async function OrganizerEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Resolve the slug through the events RLS, which already hides anything this
  // user may not see. The RPC re-checks anyway — this is not the gate.
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!store) notFound();

  const event = await getEventDetail(supabase, (store as { id: string }).id);
  if (!event) notFound();

  const totalSold = event.packages.reduce((n, p) => n + p.sold, 0);
  const totalAwaiting = event.packages.reduce((n, p) => n + p.awaiting, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-8">
      <Link href="/organizer" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
        <ArrowLeft size={14} /> My events
      </Link>

      <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">{event.name}</h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={13} />
          {new Date(event.startsAt).toLocaleString("en-GB", {
            timeZone: event.timezone, weekday: "long", day: "numeric", month: "long",
            hour: "2-digit", minute: "2-digit",
          })}
        </span>
        {event.venueName && <span className="flex items-center gap-1.5"><MapPin size={13} /> {event.venueName}</span>}
      </p>

      {event.cancelledAt && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 font-dm text-sm text-red-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          This event is cancelled. Existing tickets are void and no new reservations can be made.
        </p>
      )}

      {/* ── Packages ─────────────────────────────────────────────────── */}
      <section aria-labelledby="pk-h" className="mt-8">
        <h2 id="pk-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">TICKET PACKAGES</h2>
        {event.packages.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
            <p className="font-syne text-base font-bold text-offwhite">No packages yet</p>
            <p className="mx-auto mt-1 max-w-sm font-dm text-sm text-muted">
              Nobody can buy a ticket until this event has at least one package. Roulé Rodrigues sets
              these up with you.
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {event.packages.map((p) => {
              const pct = p.sold + p.awaiting + p.remaining > 0
                ? Math.round((p.sold / (p.sold + p.awaiting + p.remaining)) * 100) : 0;
              return (
                <div key={p.variantId} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-syne text-base font-bold text-offwhite">{p.name ?? "Ticket"}</p>
                      <p className="font-dm text-sm text-yellow">Rs {centsToDecimalString(p.price)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!p.isActive && (
                        <span className="rounded-full border border-white/15 px-2.5 py-1 font-dm text-[11px] text-muted">
                          Hidden
                        </span>
                      )}
                      {/* Never show a state without saying what it means. */}
                      {p.isActive && !p.salesOpen && (
                        <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 font-dm text-[11px] text-orange-300">
                          {p.salesEnd && new Date(p.salesEnd) < new Date() ? "Sales closed" : "Not on sale yet"}
                        </span>
                      )}
                      {p.remaining === 0 && (
                        <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 font-dm text-[11px] text-red-300">
                          Sold out
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                       role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                       aria-label={`${p.name ?? "Ticket"}: ${pct}% sold`}>
                    <div className="h-full rounded-full bg-yellow" style={{ width: `${pct}%` }} />
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-dm text-sm">
                    <div><dt className="inline text-muted">Sold </dt><dd className="inline font-medium text-offwhite">{p.sold}</dd></div>
                    <div><dt className="inline text-muted">Awaiting payment </dt><dd className="inline font-medium text-offwhite">{p.awaiting}</dd></div>
                    <div><dt className="inline text-muted">Left </dt><dd className="inline font-medium text-offwhite">{p.remaining}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Reservations ─────────────────────────────────────────────── */}
      <section aria-labelledby="rs-h" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rs-h" className="font-bebas text-[11px] tracking-[0.3em] text-yellow">RECENT RESERVATIONS</h2>
          <p className="font-dm text-xs text-muted">{totalSold} sold · {totalAwaiting} awaiting payment</p>
        </div>

        {event.recent.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
            <p className="font-dm text-sm text-muted">No reservations yet. They&apos;ll appear here as they come in.</p>
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-dark-card">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="border-b border-white/10 font-dm text-[11px] uppercase tracking-wide text-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Reference</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Tickets</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Total</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {event.recent.map((r) => (
                  <tr key={r.orderNumber} className="border-b border-white/5 font-dm text-sm last:border-0">
                    <td className="px-4 py-3 font-medium text-offwhite">{r.orderNumber}</td>
                    <td className="px-4 py-3 text-muted">
                      {r.customerName ?? "—"}
                      {r.customerPhone && (
                        <a href={`tel:${r.customerPhone.replace(/\s+/g, "")}`} className="block text-xs text-muted hover:text-yellow">
                          {r.customerPhone}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.units ?? "—"}</td>
                    <td className="px-4 py-3 text-offwhite">Rs {centsToDecimalString(r.total)}</td>
                    <td className="px-4 py-3">
                      <span className="text-muted">{STATUS_LABEL[r.status as OrderStatus] ?? r.status}</span>
                      {r.status === "pending_payment" && r.autoReleaseAt && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-orange-300">
                          <Clock size={10} /> holds until {new Date(r.autoReleaseAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 font-dm text-[11px] text-muted">Showing the 50 most recent.</p>
      </section>
    </main>
  );
}
