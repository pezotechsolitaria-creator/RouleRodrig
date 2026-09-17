import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";
import { toInvoice, toLine, toPayment } from "@/lib/invoicing/row";

// ── ONE INVOICE, WITH EVERYTHING THE DOCUMENT NEEDS ─────────────────────────
//
// Read fresh every time and never cached. The PDF is generated from THIS
// response, so a stale read would hand a customer a document that disagrees
// with the ledger — which is the one failure an invoice must not have.
//
// Safe to regenerate on demand precisely because an issued invoice is
// immutable: the guard trigger refuses to let its number, total or issue date
// move, so the document printed today and the one printed next year are the
// same document.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guardAdminApi(req, "Invoicing");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;
  const { id } = await params;

  try {
    const [inv, lines, pays] = await Promise.all([
      admin.from("invoices").select("*").eq("id", id).maybeSingle(),
      admin.from("invoice_lines").select("*").eq("invoice_id", id).order("position"),
      admin.from("invoice_payments").select("*").eq("invoice_id", id).order("received_at"),
    ]);
    if (inv.error) return failed(inv.error, "Could not load the invoice.");
    if (!inv.data) {
      return NextResponse.json({ error: "No such invoice." }, { status: 404 });
    }
    if (lines.error) return failed(lines.error, "Could not load the lines.");
    if (pays.error) return failed(pays.error, "Could not load the payments.");

    return NextResponse.json({
      invoice: toInvoice(inv.data as Record<string, unknown>),
      lines: ((lines.data ?? []) as Record<string, unknown>[]).map(toLine),
      payments: ((pays.data ?? []) as Record<string, unknown>[]).map(toPayment),
    });
  } catch (err) {
    return failed(err, "Could not load the invoice.");
  }
}
