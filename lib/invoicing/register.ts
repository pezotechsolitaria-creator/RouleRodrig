import { centsToDisplay } from "@/lib/money";
import type { Invoice, InvoiceState, InvoiceSubjectType } from "./types";
import { SUBJECTS } from "./subjects";

// ── THE REGISTER ────────────────────────────────────────────────────────────
//
// Everything on /admin/invoices that involves arithmetic or a decision lives
// here, pure, so the money on the owner's screen is testable without a browser
// or a database. The page renders; it does not compute.

/**
 * Badge tone, by WHOSE MOVE IT IS — the rule PeopleDesk already established.
 *
 * Amber: we are waiting on the customer.
 * Sky:   we owe them something (a draft is a document we have not sent).
 * Quiet: nothing is outstanding.
 *
 * `paid` is deliberately NOT green. A register exists to show what is still
 * owed, and forty green badges would hide the three amber ones. A settled
 * invoice earns no colour.
 */
export const STATE_TONE: Record<InvoiceState, string> = {
  draft: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  issued: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  part_paid: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  paid: "border-white/12 bg-white/[0.03] text-muted",
  void: "border-white/12 bg-white/[0.03] text-muted",
  written_off: "border-white/12 bg-white/[0.03] text-muted",
};

export const STATE_LABEL: Record<InvoiceState, string> = {
  draft: "Draft",
  issued: "Awaiting payment",
  part_paid: "Part paid",
  paid: "Paid",
  void: "Cancelled",
  written_off: "Written off",
};

/** Does this invoice still want something from somebody? */
export function isOutstanding(inv: Invoice): boolean {
  return inv.state === "issued" || inv.state === "part_paid";
}

export type InvoiceFilters = {
  /** Matches the number, the customer, or the source reference. */
  q?: string;
  state?: InvoiceState | "outstanding" | "all";
  subjectType?: InvoiceSubjectType | "all";
  /** ISO dates, inclusive, compared against issued_at. */
  from?: string;
  to?: string;
};

/**
 * One predicate, used by the list AND by the CSV export.
 *
 * Shared on purpose: an export that does not match what is on screen is a
 * report somebody reconciles against the wrong set and only discovers later.
 */
export function matchesFilters(inv: Invoice, f: InvoiceFilters): boolean {
  const q = (f.q ?? "").trim().toLowerCase();
  if (q) {
    const hay = [inv.number, inv.billToName, inv.reference, inv.billToEmail ?? ""]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (f.state && f.state !== "all") {
    if (f.state === "outstanding") {
      if (!isOutstanding(inv)) return false;
    } else if (inv.state !== f.state) return false;
  }

  if (f.subjectType && f.subjectType !== "all" && inv.subjectType !== f.subjectType) {
    return false;
  }

  // A draft has no issue date. It is never excluded by a date range it cannot
  // have an opinion about — otherwise drafts vanish the moment anybody filters.
  const at = inv.issuedAt;
  if (at) {
    if (f.from && at < f.from) return false;
    // `to` is inclusive of the whole day, so compare against the day after.
    if (f.to && at >= `${f.to}T23:59:59.999Z`) return false;
  }
  return true;
}

export type RegisterSummary = {
  count: number;
  invoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  outstandingCount: number;
  creditCents: number;
  cancelledCount: number;
  byService: { subjectType: InvoiceSubjectType; label: string; totalCents: number; count: number }[];
};

/**
 * The cards at the top.
 *
 * Cancelled and written-off documents are EXCLUDED from every money figure. A
 * cancelled invoice was never owed, and counting it would overstate a year's
 * takings on a screen the owner uses to judge the business. They are counted,
 * not summed.
 */
export function summarise(invoices: Invoice[]): RegisterSummary {
  const live = invoices.filter((i) => i.state !== "void" && i.state !== "written_off");
  const byService = new Map<InvoiceSubjectType, { totalCents: number; count: number }>();

  let invoiced = 0;
  let collected = 0;
  let outstanding = 0;
  let outstandingCount = 0;
  let credit = 0;

  for (const inv of live) {
    invoiced += inv.totalCents;
    collected += inv.paidCents;
    if (isOutstanding(inv)) {
      outstanding += Math.max(0, inv.balanceCents);
      outstandingCount += 1;
    }
    // A negative balance is money held that is not ours. Kept apart from
    // "outstanding" — the two are opposite directions and adding them would
    // quietly net a debt against a credit.
    if (inv.balanceCents < 0) credit += -inv.balanceCents;

    const cur = byService.get(inv.subjectType) ?? { totalCents: 0, count: 0 };
    byService.set(inv.subjectType, {
      totalCents: cur.totalCents + inv.totalCents,
      count: cur.count + 1,
    });
  }

  return {
    count: invoices.length,
    invoicedCents: invoiced,
    collectedCents: collected,
    outstandingCents: outstanding,
    outstandingCount,
    creditCents: credit,
    cancelledCount: invoices.filter((i) => i.state === "void").length,
    byService: [...byService.entries()]
      .map(([subjectType, v]) => ({
        subjectType,
        label: SUBJECTS[subjectType].label,
        totalCents: v.totalCents,
        count: v.count,
      }))
      .sort((a, b) => b.totalCents - a.totalCents),
  };
}

/**
 * Rows for the CSV.
 *
 * Money is written as a PLAIN DECIMAL — 5997.00, not "Rs 5,997" — because this
 * lands in a spreadsheet that has to add it up. A thousands separator turns the
 * column into text and the total into zero.
 */
export function csvRows(invoices: Invoice[]): (readonly unknown[])[] {
  const head = [
    "Number", "Issued", "Service", "Reference", "Customer", "Email",
    "Status", "Currency", "Total", "Paid", "Balance",
  ] as const;
  const body = invoices.map((i) => [
    i.number,
    i.issuedAt ? i.issuedAt.slice(0, 10) : "",
    SUBJECTS[i.subjectType].label,
    i.reference,
    i.billToName,
    i.billToEmail ?? "",
    STATE_LABEL[i.state],
    i.currency,
    (i.totalCents / 100).toFixed(2),
    (i.paidCents / 100).toFixed(2),
    (i.balanceCents / 100).toFixed(2),
  ]);
  return [head, ...body];
}

/** "Rs 5,997" — for the screen, never for the CSV. */
export function money(cents: number): string {
  return `Rs ${centsToDisplay(cents)}`;
}
