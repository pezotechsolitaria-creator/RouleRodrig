import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requestRef } from "@/lib/delivery/request-status";
import { REQUEST_KINDS, KIND_LABEL } from "@/lib/delivery/kind";
import { SUBJECTS, supportedSubjects } from "./subjects";

const readSql = (file: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8")
    // SQL comments stripped: this migration explains itself at length and an
    // assertion that reads prose fails on its own documentation.
    .replace(/^\s*--.*$/gm, "");
const readTs = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const M208 = readSql("20260917220000_m208_a_delivery_is_billed_for_the_fee.sql");
const M209 = readSql("20260917230000_m209_the_net_delivery_no_longer_needs_switched_off.sql");
const M200 = readSql("20260917090000_m200_a_document_the_customer_can_keep.sql");
const DIALOG = readTs("app", "admin", "invoices", "IssueDialog.tsx");
const ISSUABLE = readTs("app", "api", "admin", "invoices", "issuable", "route.ts");

/** Just the delivery branch, so a claim about it cannot be satisfied by another. */
const BRANCH = M208.slice(
  M208.indexOf("elsif p_subject_type = 'delivery' then"),
  M208.indexOf("  else\n"),
);

// ── THE SAME JOURNEY, TWICE, ON TWO NUMBERED DOCUMENTS ──────────────────────
//
// A delivery has exactly one origin (deliveries_one_origin). When it comes from
// a store order, order_amounts() has already folded the fee into orders.total —
// so the order's invoice bills it, and a second invoice for the delivery would
// bill the same journey again. This is the failure this adapter exists to avoid.
describe("an order-backed delivery is never invoiced separately", () => {
  it("bills orders.total, which is the figure that already contains the fee", () => {
    // The live order_amounts() ends `select v_tax, v_fee, p_subtotal + v_tax +
    // v_fee` and create_order() writes that third column into orders.total —
    // verified against the database, not against a migration file, because the
    // arithmetic has moved between files more than once. What can be pinned
    // offline is the other half: that an order invoice bills exactly that
    // column, which is what makes a second delivery invoice a double charge.
    expect(M208).toContain("select o.total,");
    expect(SUBJECTS.order.amountColumn).toBe("total");
  });

  it("is refused by the database, with the remedy in the message", () => {
    expect(BRANCH).toMatch(/if v_order_id is not null then/);
    expect(BRANCH).toContain("Invoice the order instead");
  });

  it("is never offered by the picker", () => {
    expect(ISSUABLE).toMatch(/from\("deliveries"\)[\s\S]*?\.is\("order_id", null\)/);
  });
});

// ── THE FEE, AND ONLY THE FEE ───────────────────────────────────────────────
//
// The platform sells the journey, not the parcel. Three columns nearby are the
// customer's own money or our internal split, and none may reach a document.
describe("what a delivery invoice may not contain", () => {
  it("never reads max_budget — that is the customer's shopping money", () => {
    // One live row: max_budget 25500 against customer_fee 30000. A Rs 255
    // shopping budget and a Rs 300 service charge, two different pockets.
    expect(M208).not.toContain("max_budget");
    expect(ISSUABLE).not.toContain("max_budget");
  });

  it("never reads payment_amount — an unverified claim about paying THIS fee", () => {
    expect(M208).not.toContain("payment_amount");
  });

  it("never reads the internal split", () => {
    expect(M208).not.toContain("driver_earning");
    expect(M208).not.toContain("platform_fee");
  });

  it("bills customer_fee, raw, in cents, with no arithmetic", () => {
    expect(BRANCH).toContain("d.customer_fee");
    expect(BRANCH).toMatch(/v_unit\s*:=\s*'cents';/);
    expect(BRANCH).toMatch(/v_cents\s*:=\s*v_raw;/);
    expect(BRANCH).not.toMatch(/[*/]\s*100\b/);
  });

  it("says on the document itself that the shopping is not billed", () => {
    // A customer reading an invoice headed "Shopping and delivery" needs to
    // know it does not bill the shopping. In the notes, not only in a comment.
    expect(BRANCH).toContain("delivery fee only");
    // "separate" is the site's own word for this boundary; "cash at the door"
    // is NOT — on this site that labels a payment method for the fee itself.
    expect(BRANCH).toContain("is separate");
    expect(BRANCH).not.toContain("cash at the door");
    // APPENDED, never replaced: coalesce(p_notes, disclaimer) would let an
    // operator's "Thanks for your custom" delete the only sentence stopping a
    // customer from reading this as a bill for their own groceries.
    expect(BRANCH).not.toMatch(/v_notes\s*:=\s*coalesce\(\s*p_notes/);
    expect(BRANCH).toMatch(/v_notes := 'This is the delivery fee only[\s\S]*?\|\| coalesce\(chr\(10\)/);
  });
});

// ── THE REFERENCE THE CUSTOMER ACTUALLY HOLDS ───────────────────────────────
//
// requestRef() is built from the REQUEST id and is what the customer was shown
// and asked to keep; paired with their email it is the credential the lookup
// checks. An invoice quoting the DELIVERY id would carry a string they have
// never seen.
describe("the reference comes from the request, not the delivery", () => {
  it("is the request id in SQL", () => {
    expect(BRANCH).toContain("'RR-' || upper(substr(replace(r.id::text,'-',''), 1, 6))");
    expect(BRANCH).not.toContain("replace(d.id::text");
  });

  it("is requestRef in the picker", () => {
    expect(ISSUABLE).toContain("reference: requestRef(r.id)");
  });

  it("is the same string both sides produce", () => {
    expect(requestRef("6678ce28-d831-4d8c-97c5-3e39d7312acb")).toBe("RR-6678CE");
  });
});

// ── WHO IS BILLED ───────────────────────────────────────────────────────────
describe("the customer is found whichever way they arrived", () => {
  it("takes the guest email, or the account holder's", () => {
    // delivery_requests_identity guarantees one of the two exists.
    expect(BRANCH).toContain("r.guest_email");
    expect(BRANCH).toContain("auth.users u on u.id = r.customer_id");
  });

  it("takes the name and phone the request carries", () => {
    expect(BRANCH).toContain("r.contact_name");
    expect(BRANCH).toContain("r.contact_phone");
  });

  it("describes the job by kind, not by the goods", () => {
    // delivery_requests.what is the customer's own description of their
    // parcel or shopping. Putting it on an invoice would read as though the
    // platform sold it.
    expect(BRANCH).not.toContain("r.what");
  });

  it("uses KIND_LABEL's words for every kind, with nothing invented", () => {
    // lib/delivery/kind.ts exists because the ternary spelling of this is
    // correct for two kinds and silently wrong for three. SQL cannot import
    // the record, so this loop is what stops the fourth copy drifting — add a
    // kind to REQUEST_KINDS and this fails until the migration knows about it.
    for (const kind of REQUEST_KINDS) {
      expect(BRANCH, kind).toContain(`when '${kind}'`);
      expect(BRANCH, kind).toContain(`'${KIND_LABEL[kind]}'`);
    }
    // Including the one that reads oddly on an invoice and is used anyway,
    // because it is what every other surface calls that job.
    expect(KIND_LABEL.errand).toBe("Do it for me");
  });
});

// ── WHAT IS NOT WORTH INVOICING ─────────────────────────────────────────────
describe("a fee that was never earned", () => {
  it("invoices only a delivery that was actually delivered", () => {
    // Nothing ever writes customer_fee after insert, so a cancelled, failed or
    // returned row still carries its full fee and would invoice cleanly. And
    // the failed-delivery tracker already tells the customer "You have not been
    // charged a delivery fee" — invoicing one would contradict a promise they
    // have read.
    expect(BRANCH).toMatch(/if v_status <> 'delivered' then/);
    expect(BRANCH).toContain("the fee was not earned");
    expect(ISSUABLE).toMatch(/from\("deliveries"\)[\s\S]*?\.eq\("status", "delivered"\)/);
  });

  it("refuses a free one rather than issuing a zero invoice", () => {
    expect(BRANCH).toMatch(/if coalesce\(v_raw, 0\) = 0 then/);
    expect(ISSUABLE).toMatch(/from\("deliveries"\)[\s\S]*?\.gt\("customer_fee", 0\)/);
  });
});

describe("the registry agrees with the adapter", () => {
  it("names customer_fee, in cents, and is open for business", () => {
    expect(SUBJECTS.delivery.amountColumn).toBe("customer_fee");
    expect(SUBJECTS.delivery.unit).toBe("cents");
    expect(SUBJECTS.delivery.supported).toBe(true);
    expect(SUBJECTS.delivery.pending).toBeUndefined();
    expect(supportedSubjects()).toContain("delivery");
  });

  it("passes the fee through the picker unconverted", () => {
    expect(ISSUABLE).toContain("totalCents: d.customer_fee");
  });

  it("still multiplies by 100 only for the one table holding rupees", () => {
    const multiplications = ISSUABLE.match(/\*\s*100/g) ?? [];
    expect(multiplications.length).toBe(1); // bookings.total_amount
  });

  it("leaves no public role able to issue a document in the company's name", () => {
    expect(M208).toContain("raise exception 'anon can issue invoices'");
    expect(M208).toContain("raise exception 'authenticated can issue invoices'");
  });
});

// ── THE NET THAT WAS SWITCHED OFF FOR THIS SUBJECT ──────────────────────────
//
// M200 exempted 'delivery' from invoices_not_above_source because a delivery
// invoice was imagined as billing the whole door total. M208 bills the fee
// alone, so the exemption protected nothing — and the other net is inert here
// too: invoices_unit_provenance reduces to source_total_cents =
// source_amount_raw for a 'cents' subject, which M208 satisfies by
// construction. Between them a delivery invoice had no structural protection.
describe("a delivery invoice can no longer bill above its source", () => {
  it("was exempt in M200", () => {
    expect(M200).toContain("subject_type in ('delivery','service_booking')");
  });

  it("is not exempt any more", () => {
    expect(M209).toContain("subject_type = 'service_booking'");
    expect(M209).not.toMatch(/subject_type in \('delivery'/);
  });

  it("leaves service_booking exempt, which has no money column to compare with", () => {
    expect(M209).toContain("or total_cents <= source_total_cents");
    expect(SUBJECTS.service_booking.amountColumn).toBe(null);
  });
});

// ── THE MONEY IS USUALLY ALREADY IN THE TILL ────────────────────────────────
//
// By the 'delivered' gate the fee has been collected — cash at the door, or a
// transfer evidenced before the driver could leave 'assigned'. The invoice is
// still issued unpaid, correctly, because nothing RECORDS the cash. What must
// not happen is an operator handing a customer "Awaiting payment" for money
// they have already paid without knowing it.
describe("the operator is told the fee was already collected", () => {
  it("says so on every delivery in the picker", () => {
    expect(ISSUABLE).toContain("The driver was told to collect this at the door");
    expect(ISSUABLE).toContain("Paid by bank transfer, verified");
    expect(ISSUABLE).toContain("Paid by bank transfer, not yet verified");
  });

  it("distinguishes a verified transfer from an unverified one", () => {
    // An unverified transfer is the customer's claim, not a confirmed receipt.
    // The column appearing in the select proves nothing; the branch does.
    expect(ISSUABLE).toMatch(
      /d\.payment_verified_at\s*\?[\s\S]*?verified[\s\S]*?:[\s\S]*?not yet verified/,
    );
  });

  it("is actually rendered, not just returned", () => {
    expect(DIALOG).toContain("{r.note}");
  });

  it("does not mark the invoice paid on its own", () => {
    // A cash collection is INSTRUCTED, not recorded. A function that issues a
    // document must not also record a payment nobody counted.
    //
    // Asserted over the WHOLE migration, not the delivery branch: the branch
    // could never have contained the INSERT's column list, so the slice made
    // this assertion vacuous — it would have passed while the function marked
    // every invoice paid two hundred lines further down.
    expect(M208).not.toContain("invoice_record_payment");
    expect(M208).not.toContain("paid_cents");
    expect(M208).toContain("'issued', now(), v_notes");
  });
});
