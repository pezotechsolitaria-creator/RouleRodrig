import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toInvoice } from "@/lib/invoicing/row";
import { isInvoiceSubject, SUBJECTS, supportedSubjects } from "@/lib/invoicing/subjects";

// ── ISSUING AN INVOICE ──────────────────────────────────────────────────────
//
// THE CALLER SENDS NO MONEY. It names a subject and an id; invoice_issue()
// reads the authoritative row itself and converts in SQL.
//
// That is the whole design, and it is deliberate. An endpoint that accepted an
// amount would be an endpoint that could be handed the wrong unit, and this
// platform has shipped that error four times — most recently showing a
// customer "Rs 180,000" for a Rs 1,800 transfer. There is no field here to get
// wrong.

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const { subjectType, subjectId, notes } = (body ?? {}) as {
    subjectType?: unknown;
    subjectId?: unknown;
    notes?: unknown;
  };

  if (!isInvoiceSubject(subjectType)) {
    return NextResponse.json(
      { error: `Unknown service. Expected one of: ${supportedSubjects().join(", ")}.` },
      { status: 400 },
    );
  }
  if (typeof subjectId !== "string" || !subjectId.trim()) {
    return NextResponse.json({ error: "Which record is this invoice for?" }, { status: 400 });
  }

  // Refuse here as well as in the RPC, so the message can explain rather than
  // surface a Postgres exception to somebody pressing a button.
  const adapter = SUBJECTS[subjectType];
  if (!adapter.supported) {
    return NextResponse.json(
      { error: `${adapter.label} cannot be invoiced yet — ${adapter.pending}.` },
      { status: 422 },
    );
  }

  try {
    const { data, error } = await admin.rpc("invoice_issue", {
      p_subject_type: subjectType,
      p_subject_id: subjectId.trim(),
      p_notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    });
    if (error) return failed(error, "Could not issue the invoice.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The invoice was not returned.");
    // Mapped before it goes anywhere. The dialogs read camelCase money fields,
    // and a raw row cast to Invoice type-checks while every one of them is
    // undefined — which is how "Rs NaN still owed" reaches a screen.
    const inv = toInvoice(row);

    // The trail records the UNIT as well as the figure. When somebody asks in a
    // year why a document says what it says, the answer is one row away.
    await audit(admin, {
      action: "invoice.issue",
      entityType: "invoice",
      entityId: inv.id,
      diff: {
        number: inv.number,
        subjectType,
        subjectId: subjectId.trim(),
        totalCents: inv.totalCents,
        sourceAmountUnit: inv.sourceAmountUnit,
      },
    });

    return NextResponse.json({ invoice: inv }, { status: 201 });
  } catch (err) {
    return failed(err, "Could not issue the invoice.");
  }
}

// ── THE REGISTER ────────────────────────────────────────────────────────────
//
// Returns the whole book and lets the client filter and summarise with the
// SAME pure functions the CSV export uses. That is deliberate: an export that
// disagrees with what is on screen is a report somebody reconciles against the
// wrong set and only discovers much later.
//
// Safe to send everything for now — the platform has tens of transactions, not
// tens of thousands. When that stops being true the fix is a server-side
// filter using matchesFilters() on the same shape, not a different shape.
export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  try {
    const { data, error } = await admin
      .from("invoices")
      .select(
        "id, number, doc_kind, subject_type, subject_id, reference, " +
          "bill_to_name, bill_to_email, bill_to_phone, seller_name, seller_address, " +
          "currency, subtotal_cents, discount_cents, tax_cents, delivery_cents, " +
          "total_cents, paid_cents, balance_cents, " +
          "source_amount_unit, source_amount_raw, source_total_cents, " +
          "state, issued_at, due_at, paid_at, sent_at, sent_to, send_count, notes, created_at",
      )
      .order("seq", { ascending: false });
    if (error) return failed(error, "Could not load the invoices.");

    // snake_case to camelCase at the edge, once, so nothing downstream has to
    // know which side of the wire it is on — and in ONE function, shared with
    // every other route that reads an invoice. Three copies of a money mapping
    // is how a column gets read correctly in one route and not in the next.
    const invoices = ((data ?? []) as unknown as Record<string, unknown>[]).map(toInvoice);

    return NextResponse.json({ invoices });
  } catch (err) {
    return failed(err, "Could not load the invoices.");
  }
}
