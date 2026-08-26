// ── What a driver's card says about the money ───────────────────────────────
//
// Two decisions live here, and both are MIRRORS of rules that are enforced in
// SQL. That duplication is deliberate and it is also the risk: a screen that
// disagrees with the database either blocks a driver who is allowed to go, or
// — worse — invites one to set off on a job the server will refuse.
//
// So they are pure, they are named, and they are tested against the exact
// wording of the SQL they mirror:
//
//   canStartDelivery  ⇄  advance_delivery()'s RR087 branch          (M155)
//   paymentCardState  ⇄  driver_dashboard()'s collectCash CASE      (M157)
//
// The SQL remains the authority. If these two are ever wrong the server still
// refuses; what is lost is the driver knowing why before they tap.

export type PaymentCardState =
  /** Money to take at the door, in cash. */
  | "cash"
  /** A bank transfer with no receipt yet — the job is held. */
  | "awaiting"
  /** A bank transfer that has been evidenced. Nothing to collect. */
  | "settled"
  /** A store order with nothing outstanding, or a job not yet decided. */
  | "none";

export type PaymentFacts = {
  /** Minor units. driver_dashboard already returns 0 for a bank transfer. */
  collectCash?: number | null;
  paymentMethod?: string | null;
  paymentProofAt?: string | null;
  /** M158. Cash jobs wait on the customer's ID the way transfers wait on a
   *  receipt — same gate, same screen, different document. */
  idDocumentAt?: string | null;
};

/**
 * Which of the three things the card should say.
 *
 * Cash is tested FIRST and on the amount rather than on the method, because
 * `collectCash` is the authority on money owed: a store order has cash to
 * collect with no `payment_method` at all, and every delivery created before
 * M155 has a null method and a real balance. Branching on the method first
 * would have silenced the card for both.
 */
export function paymentCardState(d: PaymentFacts): PaymentCardState {
  if ((d.collectCash ?? 0) > 0) return "cash";
  if (d.paymentMethod !== "bank_transfer") return "none";
  return d.paymentProofAt ? "settled" : "awaiting";
}

/**
 * May this driver leave `assigned` yet?
 *
 * The mirror of advance_delivery():
 *
 *     if v_d.status = 'assigned'
 *        and v_d.payment_method = 'bank_transfer'
 *        and v_d.payment_proof_path is null then
 *       raise ... 'Waiting for the customer to send proof of payment.'
 *
 * Only the FIRST transition is gated. Once a driver is under way the receipt
 * has done its job, and holding up a later step would strand a delivery that is
 * already halfway across the island.
 */
export function canStartDelivery(
  d: PaymentFacts & { status: string },
): boolean {
  if (d.status !== "assigned") return true;
  if (d.paymentMethod === "bank_transfer") return Boolean(d.paymentProofAt);
  if (d.paymentMethod === "cash") return Boolean(d.idDocumentAt);
  // No method recorded: every delivery predating M155. Unchanged behaviour.
  return true;
}

/** What the job is waiting on, if anything. Drives the wording, not the gate. */
export function waitingOn(
  d: PaymentFacts & { status: string },
): "receipt" | "id" | null {
  if (canStartDelivery(d)) return null;
  return d.paymentMethod === "bank_transfer" ? "receipt" : "id";
}
