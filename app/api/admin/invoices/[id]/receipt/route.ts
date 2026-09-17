import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toInvoice } from "@/lib/invoicing/row";

// ── ACKNOWLEDGING THE MONEY ─────────────────────────────────────────────────
//
// The invoice says "this is owed". The receipt says "this was paid", carries
// its own RR-RCP number, and is what somebody puts in front of an accountant.
//
// Like issuing, this endpoint takes NO money. It names an invoice; the RPC
// copies every figure from it, provenance included. A route that could pass an
// amount is a route that could make the two documents disagree, which is the
// one failure a receipt must not have.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;
  const { id } = await params;

  try {
    const { data, error } = await admin.rpc("invoice_issue_receipt", {
      p_invoice_id: id,
      p_notes: null,
    });
    // The database's message is the useful one — "is not paid in full",
    // "already has a receipt" — so it is surfaced rather than replaced.
    if (error) return failed(error, "Could not issue the receipt.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The receipt was not returned.");
    const rcp = toInvoice(row);

    await audit(admin, {
      action: "invoice.receipt",
      entityType: "invoice",
      entityId: rcp.id,
      diff: { number: rcp.number, forInvoice: id, totalCents: rcp.totalCents },
    });

    return NextResponse.json({ invoice: rcp }, { status: 201 });
  } catch (err) {
    return failed(err, "Could not issue the receipt.");
  }
}
