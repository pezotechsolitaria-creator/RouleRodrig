import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";

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

    const r = inv.data as unknown as {
      id: string; number: string; doc_kind: string;
      subject_type: string; subject_id: string; reference: string;
      bill_to_name: string; bill_to_email: string | null; bill_to_phone: string | null;
      bill_to_address: string | null;
      seller_name: string; seller_address: string; seller_brn: string | null;
      seller_vat: string | null; currency: string;
      subtotal_cents: number; discount_cents: number; tax_cents: number;
      delivery_cents: number; total_cents: number; paid_cents: number;
      balance_cents: number; source_amount_unit: string;
      source_amount_raw: number; source_total_cents: number;
      state: string; issued_at: string | null; due_at: string | null;
      paid_at: string | null; notes: string | null; created_at: string;
    };

    return NextResponse.json({
      invoice: {
        id: r.id, number: r.number, docKind: r.doc_kind,
        subjectType: r.subject_type, subjectId: r.subject_id, reference: r.reference,
        billToName: r.bill_to_name, billToEmail: r.bill_to_email,
        billToPhone: r.bill_to_phone,
        sellerName: r.seller_name, sellerAddress: r.seller_address,
        currency: r.currency,
        subtotalCents: r.subtotal_cents, discountCents: r.discount_cents,
        taxCents: r.tax_cents, deliveryCents: r.delivery_cents,
        totalCents: r.total_cents, paidCents: r.paid_cents,
        balanceCents: r.balance_cents,
        sourceAmountUnit: r.source_amount_unit,
        sourceAmountRaw: r.source_amount_raw,
        sourceTotalCents: r.source_total_cents,
        state: r.state, issuedAt: r.issued_at, dueAt: r.due_at,
        paidAt: r.paid_at, notes: r.notes, createdAt: r.created_at,
      },
      lines: ((lines.data ?? []) as unknown as {
        id: string; position: number; kind: string; description: string;
        qty: string | number; unit_price_cents: number; line_total_cents: number;
      }[]).map((l) => ({
        id: l.id, position: l.position, kind: l.kind, description: l.description,
        // numeric(12,3) arrives as a string from PostgREST.
        qty: Number(l.qty),
        unitPriceCents: l.unit_price_cents,
        lineTotalCents: l.line_total_cents,
      })),
      payments: ((pays.data ?? []) as unknown as {
        id: string; amount_cents: number; method: string; received_at: string;
        external_ref: string | null; note: string | null; recorded_by: string;
      }[]).map((p) => ({
        id: p.id, amountCents: p.amount_cents, method: p.method,
        receivedAt: p.received_at, externalRef: p.external_ref,
        note: p.note, recordedBy: p.recorded_by,
      })),
    });
  } catch (err) {
    return failed(err, "Could not load the invoice.");
  }
}
