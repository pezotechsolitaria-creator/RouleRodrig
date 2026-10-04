"use client";

import { Trash2, X } from "lucide-react";
import { canCancelInstead, deleteRefusal, type DeleteFacts } from "@/lib/admin/booking-delete";

/**
 * The last button on a booking card (architecture review 2026-09-30, item 3).
 *
 * Delete was offered on every row, paid and confirmed ones included, and
 * removed the customer's history and orphaned the payments ledger. Now it is
 * offered only where the DELETE route would allow it (lib/admin/booking-delete
 * is the one rule both read). A row that must be kept and is still going to
 * happen gets Cancel in its place — the row stays, marked cancelled. One that
 * is already over gets no button, only a note saying it stays on file.
 *
 * The reason is a VISIBLE line under the row, not only a title tooltip: the
 * desk is used on a phone, where a tooltip never shows, and "KEPT ON FILE"
 * with no why reads as a broken button (wave 1 review). Shown for the
 * client-side rule only — a server refusal already has its own notice line.
 *
 * Its own file, beside BookingMoney.tsx, so a test can render it: the desk
 * cannot be driven locally (no service-role key), and a green rule test says
 * nothing about which button the owner actually sees.
 */
export default function DeleteOrKeep({
  kind, row, refusedByServer, busy, onDelete, onCancel,
}: {
  kind: "vehicle" | "place";
  row: DeleteFacts;
  /** The route's sentence, when it refused a row this rule let through. */
  refusedByServer?: string;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const refusal = deleteRefusal(kind, row, null);
  const keep = refusal?.message ?? refusedByServer ?? null;
  // The rule decides whether Cancel means anything (a declared transfer, for
  // one, must be reconciled, not cancelled); status alone only when the server
  // refused a row this copy of the rule let through.
  const offerCancel = refusal ? refusal.canCancel : canCancelInstead(row.status);
  const why = refusal ? (
    <p className="w-full basis-full font-dm text-[11px] leading-snug text-muted">{refusal.message}</p>
  ) : null;
  const pill =
    "flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.12em] border px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto";

  if (!keep) {
    return (
      <button
        disabled={busy}
        onClick={onDelete}
        title={kind === "vehicle" ? "Delete this booking permanently" : "Delete this reservation permanently"}
        className={`${pill} border-red-500/30 text-red-400/80 hover:bg-red-500/10 hover:text-red-400`}
      >
        <Trash2 size={10} /> Delete
      </button>
    );
  }
  if (offerCancel) {
    return (
      <>
      <button
        disabled={busy}
        onClick={onCancel}
        title={keep}
        className={`${pill} border-[#2a2a2a] text-muted/70 hover:border-yellow/40 hover:text-yellow`}
      >
        <X size={10} /> Cancel instead
      </button>
      {why}
      </>
    );
  }
  return (
    <>
      <span title={keep} className="ml-auto font-bebas text-[9px] tracking-[0.12em] text-muted">
        KEPT ON FILE
      </span>
      {why}
    </>
  );
}
