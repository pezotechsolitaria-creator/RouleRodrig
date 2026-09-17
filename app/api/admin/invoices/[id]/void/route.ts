import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toInvoice } from "@/lib/invoicing/row";

// ── CANCELLING AN INVOICE ───────────────────────────────────────────────────
//
// A reason is REQUIRED, and the database enforces it too. A voided financial
// document with no stated reason is precisely the thing nobody can answer a
// question about a year later.
//
// This endpoint cannot cancel an invoice that has money against it. That is not
// a policy decided here — invoice_void() and the row trigger both refuse, on a
// locked row, so a void racing a payment loses to the payment. The right answer
// in that case is a credit note, and the error message says so.

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

  const { reason } = (body ?? {}) as { reason?: unknown };
  if (typeof reason !== "string" || reason.trim().length < 3) {
    return NextResponse.json(
      { error: "Why is this being cancelled? A short reason is kept with the record." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await admin.rpc("invoice_void", {
      p_invoice_id: id,
      p_reason: reason.trim(),
    });
    if (error) return failed(error, "Could not cancel the invoice.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The invoice was not returned.");
    const inv = toInvoice(row);

    await audit(admin, {
      action: "invoice.void",
      entityType: "invoice",
      entityId: inv.id,
      diff: { number: inv.number, reason: reason.trim() },
    });

    return NextResponse.json({ invoice: inv });
  } catch (err) {
    return failed(err, "Could not cancel the invoice.");
  }
}
