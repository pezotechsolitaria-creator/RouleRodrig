// ── Can this merchant be deleted, or must it be archived? ───────────────────
//
// The owner's report: "The admin should have an option to clear merchants too,
// I tried to clear test but I could not."
//
// There was no delete anywhere in the admin — but adding a raw DELETE would not
// have worked either, and understanding why is what makes the right answer
// obvious. Three foreign keys onto `stores` are ON DELETE RESTRICT:
//
//   orders.store_id                     RESTRICT
//   deliveries.store_id                 RESTRICT
//   event_organizer_assignments.store_id RESTRICT
//
// Everything else — products, variants, store_hours, coupons, reviews, events,
// tickets, food_kitchens, payment settings, staff, subscriptions, invoices —
// is ON DELETE CASCADE and disappears with the merchant.
//
// Those three RESTRICTs are not an obstacle to route around; they are the
// database refusing to erase money that changed hands. So the rule is:
//
//   · Never traded  → hard delete. A test shop leaves no trace, which is
//                     exactly what "clear test" should mean.
//   · Has traded    → archive. The shop goes off the site and out of the
//                     merchant list; its orders, payouts and delivery history
//                     stay intact and auditable.
//
// This module is the pure decision. It takes counts and returns a verdict, so
// the rule is testable without a database and the route stays a thin wrapper.

export type MerchantFootprint = {
  /** Rows in `orders` for any of this merchant's stores. */
  orders: number;
  /** Rows in `deliveries` for any of this merchant's stores. */
  deliveries: number;
  /** Rows in `event_organizer_assignments` for any of this merchant's stores. */
  organizerAssignments: number;
  /** Paid subscription invoices. Not a FK block, but real financial history. */
  paidInvoices: number;
};

export type DeleteVerdict = {
  /** True only when a hard delete will actually succeed. */
  canDelete: boolean;
  /** Machine-readable reasons, most severe first. */
  blockers: string[];
  /** One sentence for the operator, in their language, not the database's. */
  message: string;
  /** What the UI should offer instead when deletion is refused. */
  suggestion: "delete" | "archive";
};

export function deleteVerdict(f: MerchantFootprint): DeleteVerdict {
  const blockers: string[] = [];
  // Ordered by how much explaining each one needs, not alphabetically: an
  // operator who sees "3 orders" stops reading and understands already.
  if (f.orders > 0) blockers.push(`${f.orders} order${f.orders === 1 ? "" : "s"}`);
  if (f.deliveries > 0) blockers.push(`${f.deliveries} deliver${f.deliveries === 1 ? "y" : "ies"}`);
  if (f.organizerAssignments > 0) {
    blockers.push(`${f.organizerAssignments} event organiser link${f.organizerAssignments === 1 ? "" : "s"}`);
  }
  if (f.paidInvoices > 0) blockers.push(`${f.paidInvoices} paid invoice${f.paidInvoices === 1 ? "" : "s"}`);

  if (blockers.length === 0) {
    return {
      canDelete: true,
      blockers: [],
      message:
        "This merchant has never traded. Deleting removes it and its shops, products, hours and photos for good.",
      suggestion: "delete",
    };
  }

  return {
    canDelete: false,
    blockers,
    message:
      `This merchant has ${blockers.join(", ")}. Deleting it would erase financial history, ` +
      `so archive it instead — the shops come off the site and the records stay.`,
    suggestion: "archive",
  };
}

/**
 * Whether a confirmation string authorises the delete.
 *
 * Typing the merchant's own name is the difference between "I meant this one"
 * and "I clicked the wrong row" — the only protection that survives a tired
 * operator, since the action is irreversible by design.
 */
export function confirmationMatches(typed: string, merchantName: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(typed).length > 0 && norm(typed) === norm(merchantName);
}
