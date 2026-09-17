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
