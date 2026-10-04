import type { PaymentStatus, ReservationStatus } from "./status";

// ── What the guest's booking page shows, derived from the two axes ──────────
//
// Four nodes — Requested, Confirmed, Payment, Ready — and ONE sentence of
// status. Pure: the page passes `now` and the slot's start, so "Ready becomes
// active the day before" is testable and the server and browser agree.

export type NodeState = "done" | "active" | "todo" | "stopped";
export type TimelineNode = { key: "requested" | "confirmed" | "payment" | "ready"; state: NodeState };

/** Which sentence (copy key) the hub leads with. */
export type HubState =
  | "checking"
  | "needs_information"
  | "pay"
  | "pay_in_person"
  | "paid"
  | "ready"
  | "in_progress"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled";

export type HubView = { state: HubState; nodes: TimelineNode[]; payable: boolean };

const DAY = 24 * 3600_000;

export function hubView(
  r: { reservation_status: ReservationStatus; payment_status: PaymentStatus },
  slotStart: Date | null,
  now: Date,
): HubView {
  const s = r.reservation_status;
  const p = r.payment_status;
  const n = (a: NodeState, b: NodeState, c: NodeState, d: NodeState): TimelineNode[] => [
    { key: "requested", state: a },
    { key: "confirmed", state: b },
    { key: "payment", state: c },
    { key: "ready", state: d },
  ];
  const readySoon = slotStart != null && slotStart.getTime() - now.getTime() <= DAY;

  if (s === "declined") return { state: "declined", nodes: n("done", "stopped", "todo", "todo"), payable: false };
  if (s === "cancelled") return { state: "cancelled", nodes: n("done", "stopped", "todo", "todo"), payable: false };
  if (s === "expired") return { state: "expired", nodes: n("done", "done", "stopped", "todo"), payable: false };
  if (s === "draft" || s === "requested" || s === "under_review") {
    return { state: "checking", nodes: n("done", "active", "todo", "todo"), payable: false };
  }
  if (s === "needs_information") return { state: "needs_information", nodes: n("done", "active", "todo", "todo"), payable: false };
  if (s === "completed") return { state: "completed", nodes: n("done", "done", "done", "done"), payable: false };
  if (s === "in_progress") return { state: "in_progress", nodes: n("done", "done", "done", "done"), payable: false };
  if (s === "ready") return { state: "ready", nodes: n("done", "done", "done", "done"), payable: false };

  // confirmed — now the money axis decides.
  if (p === "paid" || p === "waived" || p === "not_required") {
    return { state: "paid", nodes: n("done", "done", "done", readySoon ? "active" : "todo"), payable: false };
  }
  if (p === "pay_in_person") {
    return { state: "pay_in_person", nodes: n("done", "done", "done", readySoon ? "active" : "todo"), payable: false };
  }
  // payment_pending, partially_paid, unpaid, failed: the guest has something to do.
  return { state: "pay", nodes: n("done", "done", "active", "todo"), payable: true };
}

/** "23h 42m" until the deadline, or null when it has passed / there is none. */
export function countdown(deadline: string | null, now: Date): string | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}
