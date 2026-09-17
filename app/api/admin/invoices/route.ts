import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
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
    return NextResponse.json({ error: "Which booking or order?" }, { status: 400 });
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

    const inv = (Array.isArray(data) ? data[0] : data) as
      | { id: string; number: string; total_cents: number; source_amount_unit: string }
      | null;
    if (!inv) return failed(null, "The invoice was not returned.");

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
        totalCents: inv.total_cents,
        sourceAmountUnit: inv.source_amount_unit,
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
          "state, issued_at, due_at, paid_at, notes, created_at",
      )
      .order("seq", { ascending: false });
    if (error) return failed(error, "Could not load the invoices.");

    // snake_case to camelCase at the edge, once, so nothing downstream has to
    // know which side of the wire it is on.
    //
    // The row shape is spelled out rather than cast to any: this is the seam
    // where every money column crosses into TypeScript, and a silent `any` here
    // is how a cents column gets read as rupees two files later.
    type Row = {
      id: string; number: string; doc_kind: string;
      subject_type: string; subject_id: string; reference: string;
      bill_to_name: string; bill_to_email: string | null; bill_to_phone: string | null;
      seller_name: string; seller_address: string; currency: string;
      subtotal_cents: number; discount_cents: number; tax_cents: number;
      delivery_cents: number; total_cents: number; paid_cents: number;
      balance_cents: number;
      source_amount_unit: string; source_amount_raw: number; source_total_cents: number;
      state: string; issued_at: string | null; due_at: string | null;
      paid_at: string | null; notes: string | null; created_at: string;
    };

    const invoices = ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      number: r.number,
      docKind: r.doc_kind,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      reference: r.reference,
      billToName: r.bill_to_name,
      billToEmail: r.bill_to_email,
      billToPhone: r.bill_to_phone,
      sellerName: r.seller_name,
      sellerAddress: r.seller_address,
      currency: r.currency,
      subtotalCents: r.subtotal_cents,
      discountCents: r.discount_cents,
      taxCents: r.tax_cents,
      deliveryCents: r.delivery_cents,
      totalCents: r.total_cents,
      paidCents: r.paid_cents,
      balanceCents: r.balance_cents,
      sourceAmountUnit: r.source_amount_unit,
      sourceAmountRaw: r.source_amount_raw,
      sourceTotalCents: r.source_total_cents,
      state: r.state,
      issuedAt: r.issued_at,
      dueAt: r.due_at,
      paidAt: r.paid_at,
      notes: r.notes,
      createdAt: r.created_at,
    }));

    return NextResponse.json({ invoices });
  } catch (err) {
    return failed(err, "Could not load the invoices.");
  }
}
