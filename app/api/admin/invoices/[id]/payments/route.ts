import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { isPaymentMethod, PAYMENT_METHODS } from "@/lib/invoicing/payments";
import { toInvoice } from "@/lib/invoicing/row";

// ── RECORDING MONEY AGAINST AN INVOICE ──────────────────────────────────────
//
// Unlike issuing, this endpoint DOES take an amount — it has to, because only a
// person knows how much actually arrived. So the amount is named for its unit
// (amountCents) and is rejected unless it is a positive whole number. There is
// no rupee field to confuse it with.
//
// Everything consequential happens inside invoice_record_payment(), on a locked
// row: the running total is recomputed from the allocations rather than
// incremented, the state moves itself, and a payment against a cancelled
// invoice is refused rather than silently absorbed.

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

  const { amountCents, method, receivedAt, externalRef, note } = (body ?? {}) as {
    amountCents?: unknown;
    method?: unknown;
    receivedAt?: unknown;
    externalRef?: unknown;
    note?: unknown;
  };

  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    // Explicitly not "amount". A float here would be somebody typing rupees.
    return NextResponse.json(
      { error: "How much was received? Give a whole number of cents." },
      { status: 400 },
    );
  }
  if (!isPaymentMethod(method)) {
    return NextResponse.json(
      { error: `How was it paid? One of: ${PAYMENT_METHODS.join(", ")}.` },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await admin.rpc("invoice_record_payment", {
      p_invoice_id: id,
      p_amount_cents: amountCents,
      p_method: method,
      p_received_at:
        typeof receivedAt === "string" && receivedAt.trim() ? receivedAt : null,
      p_payment_id: null,
      p_external_ref:
        typeof externalRef === "string" && externalRef.trim() ? externalRef.trim() : null,
      p_note: typeof note === "string" && note.trim() ? note.trim() : null,
    });
    // The Postgres message is the useful one here — "already has money received
    // against it", "was cancelled" — so failed() surfaces it rather than
    // replacing it with something generic.
    if (error) return failed(error, "Could not record the payment.");

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return failed(null, "The invoice was not returned.");
    // The dialog reads balanceCents off this to tell the admin what is left.
    // Returning the raw row satisfies the compiler and hands it undefined.
    const inv = toInvoice(row);

    await audit(admin, {
      action: "invoice.payment",
      entityType: "invoice",
      entityId: inv.id,
      diff: {
        number: inv.number,
        amountCents,
        method,
        stateAfter: inv.state,
        paidCents: inv.paidCents,
        balanceCents: inv.balanceCents,
      },
    });

    return NextResponse.json({ invoice: inv }, { status: 201 });
  } catch (err) {
    return failed(err, "Could not record the payment.");
  }
}
