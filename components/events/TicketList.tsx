"use client";

import { useEffect, useState } from "react";
import { Ticket as TicketIcon, CheckCircle2, XCircle } from "lucide-react";
import type { PickupQrGeometry } from "@/lib/orders/pickup-qr";

// The buyer's tickets — the half of the door that lives in their pocket.
//
// Until M56 nothing returned a ticket to the person who bought it: the RLS
// policy keys on orders.customer_id = auth.uid(), and an event buyer is a guest
// with customer_id NULL. Tickets were issued into a table nobody could read.
//
// ── WHAT THE QR CONTAINS ────────────────────────────────────────────────────
// The ticket's public_id and nothing else: a 122-bit random uuid with a UNIQUE
// index. It is not signed, and signing would add nothing — a random id cannot
// be forged without the database, and a signature copied along with a
// screenshot is still a valid signature. What actually stops a shared ticket is
// that the first scan wins and the second is told (redeem_ticket, M56).
//
// The encoder is imported dynamically, following PickupQr: it lands in its own
// chunk that only this component reaches, so a customer downloads it solely
// when they are actually holding a ticket.
export type BuyerTicket = {
  publicId: string;
  serial: number;
  type: string | null;
  state: "valid" | "used" | "void";
  usedAt: string | null;
  eventName: string | null;
  eventStartsAt: string | null;
};

export default function TicketList({ tickets }: { tickets: BuyerTicket[] }) {
  if (tickets.length === 0) return null;

  return (
    <section aria-labelledby="tk-h" className="rounded-2xl border border-yellow/25 bg-yellow/[0.04] p-5">
      <h2 id="tk-h" className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
        <TicketIcon size={16} className="text-yellow" />
        {tickets.length === 1 ? "Your ticket" : `Your ${tickets.length} tickets`}
      </h2>
      <p className="mt-1 font-dm text-sm text-muted">
        Show this at the entrance. Each one admits one person, once. A screenshot works — but if you
        send it to someone else, whoever arrives second will be turned away.
      </p>

      <div className="mt-4 space-y-4">
        {tickets.map((t) => (
          <TicketCard key={t.publicId} ticket={t} />
        ))}
      </div>
    </section>
  );
}

function TicketCard({ ticket }: { ticket: BuyerTicket }) {
  const [qr, setQr] = useState<PickupQrGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Generic QR geometry — the module is named for the pickup code because
        // that shipped first, but it encodes any payload and is imported here
        // rather than copied.
        const { buildPickupQr } = await import("@/lib/orders/pickup-qr");
        const built = buildPickupQr(ticket.publicId);
        if (!cancelled) setQr(built);
      } catch {
        /* leave the code text visible below; it can be typed in by hand */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket.publicId]);

  const spent = ticket.state !== "valid";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        spent ? "border-white/10 bg-white/[0.02]" : "border-white/10 bg-dark-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-syne text-base font-bold text-offwhite">
            {ticket.type ?? "Ticket"} <span className="font-dm text-sm text-muted">#{ticket.serial}</span>
          </p>
          {ticket.eventName && <p className="font-dm text-sm text-muted">{ticket.eventName}</p>}
        </div>
        {ticket.state === "used" ? (
          <span className="flex shrink-0 items-center gap-1 font-dm text-xs text-muted">
            <CheckCircle2 size={13} /> Used
          </span>
        ) : ticket.state === "void" ? (
          <span className="flex shrink-0 items-center gap-1 font-dm text-xs text-red-300">
            <XCircle size={13} /> Cancelled
          </span>
        ) : null}
      </div>

      {ticket.state === "valid" ? (
        <div className="mt-3 flex flex-col items-center">
          {/* White plate behind the code, always. A dark-on-dark QR reads
              perfectly on screen and then fails under a scanner at a dim
              entrance, which is the only moment it matters. */}
          <div className="rounded-xl bg-white p-3">
            {qr ? (
              <svg
                viewBox={`0 0 ${qr.span} ${qr.span}`}
                width={168}
                height={168}
                shapeRendering="crispEdges"
                role="img"
                aria-label={`Ticket ${ticket.serial} entry code`}
              >
                <rect width={qr.span} height={qr.span} fill="#fff" />
                <g transform={`translate(${qr.quiet} ${qr.quiet})`}>
                  <path d={qr.path} fill="#000" />
                </g>
              </svg>
            ) : (
              <div className="h-[168px] w-[168px] animate-pulse rounded bg-black/5" />
            )}
          </div>
          <p className="mt-2 select-all break-all text-center font-dm text-[10px] leading-relaxed text-muted">
            {ticket.publicId}
          </p>
        </div>
      ) : (
        <p className="mt-2 font-dm text-sm text-muted">
          {ticket.state === "used"
            ? ticket.usedAt
              ? `Admitted at ${new Date(ticket.usedAt).toLocaleString()}.`
              : "Already admitted."
            : "This ticket was cancelled and will not be accepted."}
        </p>
      )}
    </div>
  );
}
