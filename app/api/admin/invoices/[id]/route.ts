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

    const invoice = toInvoice(inv.data as Record<string, unknown>);

    // ── THE OTHER DOCUMENTS ABOUT THIS SALE ──────────────────────────────
    // A receipt is a separate row with its own number, and without this the
    // only way to reach it from its invoice would be to search the register
    // for a number nobody has written down yet. Both directions: an invoice
    // finds its receipt, a receipt finds the invoice it acknowledges.
    const parentId = (inv.data as { parent_invoice_id?: string | null }).parent_invoice_id ?? null;
    const rel = await admin
      .from("invoices")
      .select("id, number, doc_kind, state")
      .or(`parent_invoice_id.eq.${id}${parentId ? `,id.eq.${parentId}` : ""}`);
    if (rel.error) return failed(rel.error, "Could not load the related documents.");

    return NextResponse.json({
      invoice,
      lines: ((lines.data ?? []) as Record<string, unknown>[]).map(toLine),
      payments: ((pays.data ?? []) as Record<string, unknown>[]).map(toPayment),
      related: ((rel.data ?? []) as unknown as {
        id: string; number: string; doc_kind: string; state: string;
      }[]).map((r) => ({
        id: r.id, number: r.number, docKind: r.doc_kind, state: r.state,
      })),
    });
  } catch (err) {
    return failed(err, "Could not load the invoice.");
  }
}
