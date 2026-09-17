import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toInvoice } from "@/lib/invoicing/row";

// ── REVERSING A DOCUMENT THAT CANNOT BE ALTERED ─────────────────────────────
//
// Three refusals elsewhere in this system tell the admin to "raise a credit
// note instead". Until now there was nowhere to raise one.
//
// Like the payment endpoint, this one DOES take an amount, because only a
// person knows how much of a sale is being reversed. So it is named for its
// unit, it must be a positive whole number, and the database checks it against
// the invoice again. Unlike the payment endpoint, omitting it is meaningful:
// no amount means the whole invoice, which is the common case.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;
  const { id } = await params;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const { reason, amountCents } = (body ?? {}) as { reason?: unknown; amountCents?: unknown };

  if (typeof reason !== "string" || !reason.trim()) {
    // A credit note without a reason is an unexplained hole in the takings.
    return NextResponse.json({ error: "Why is this being credited?" }, { status: 400 });
  }
  if (
    amountCents !== undefined &&
    amountCents !== null &&
    (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0)
  ) {
    return NextResponse.json(
      { error: "How much is being credited? Give a whole number of cents, or none for all of it." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await admin.rpc("invoice_credit_note", {
      p_invoice_id: id,
      p_reason: reason.trim(),
      p_amount_cents: typeof amountCents === "number" ? amountCents : null,
    });
    if (error) return failed(error, "Could not raise the credit note.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The credit note was not returned.");
    const note = toInvoice(row);

    await audit(admin, {
      action: "invoice.credit_note",
      entityType: "invoice",
      entityId: note.id,
      diff: {
        number: note.number,
        againstInvoice: id,
        amountCents: note.totalCents,
        reason: reason.trim(),
      },
    });

    return NextResponse.json({ invoice: note }, { status: 201 });
  } catch (err) {
    return failed(err, "Could not raise the credit note.");
  }
}
