import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { toInvoice, toLine } from "@/lib/invoicing/row";
import { invoiceToReceipt } from "@/lib/invoicing/document";
import {
  invoiceEmailHtml,
  invoiceEmailSubject,
  invoiceAttachmentName,
} from "@/lib/invoicing/email";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { sendTransactionalEmail } from "@/lib/email/send";

// ── HANDING THE DOCUMENT TO THE CUSTOMER ────────────────────────────────────
//
// Everything before this produced a document an admin could download. The
// customer had no idea it existed.
//
// THE PDF IS BUILT HERE, IN THE FUNCTION. buildReceiptPdf() is pure — it
// returns bytes from data with no browser API — so the same renderer that
// makes the download makes the attachment. One renderer means the file in the
// customer's inbox is byte-for-byte the file the admin sees, which is the only
// way "can you resend it?" is ever a safe thing to answer.
//
// IDEMPOTENCY, AND WHY THE KEY CARRIES send_count.
// A double-click must not send two copies; a deliberate resend must send one.
// The key is invoice:paid:count, so:
//   two clicks in the same second -> same key -> the second is deduped
//   a click after a successful send -> count moved -> a new key -> it sends
//   a click after a payment landed -> paid moved -> a new key -> it sends
// Nothing has to remember anything, and neither the admin nor this route has
// a "force" flag to get wrong.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  const { to } = (body ?? {}) as { to?: unknown };

  try {
    const [invRes, lineRes] = await Promise.all([
      admin.from("invoices").select("*").eq("id", id).maybeSingle(),
      admin.from("invoice_lines").select("*").eq("invoice_id", id).order("position"),
    ]);
    if (invRes.error) return failed(invRes.error, "Could not load the invoice.");
    if (!invRes.data) {
      return NextResponse.json({ error: "No such invoice." }, { status: 404 });
    }
    if (lineRes.error) return failed(lineRes.error, "Could not load the lines.");

    const inv = toInvoice(invRes.data as Record<string, unknown>);
    const lines = ((lineRes.data ?? []) as Record<string, unknown>[]).map(toLine);

    // A draft has no number a customer could refer to and no issue date. There
    // is nothing to send yet, and sending one would put a document in the wild
    // that the register does not consider to exist.
    if (inv.state === "draft") {
      return NextResponse.json(
        { error: `${inv.number} has not been issued yet.` },
        { status: 422 },
      );
    }

    const recipient =
      typeof to === "string" && to.trim() ? to.trim() : (inv.billToEmail ?? "");
    if (!EMAIL_RE.test(recipient)) {
      return NextResponse.json(
        {
          error: inv.billToEmail
            ? "That address does not look like an email address."
            : "This customer has no email address on the record. Type one to send it.",
        },
        { status: 422 },
      );
    }

    const pdf = buildReceiptPdf(invoiceToReceipt(inv, lines));

    const res = await sendTransactionalEmail({
      type: "invoice_document",
      to: recipient,
      subject: invoiceEmailSubject(inv),
      html: invoiceEmailHtml(inv, lines),
      attachments: [
        {
          name: invoiceAttachmentName(inv),
          content: Buffer.from(pdf).toString("base64"),
        },
      ],
      idempotencyKey: `invoice_document:${inv.id}:${inv.paidCents}:${inv.sendCount}`,
      relatedType: "invoice",
      relatedId: inv.id,
    });

    if (res.deduped) {
      // Already in their inbox. Recording a second send would be recording an
      // email that was never sent.
      return NextResponse.json({
        sent: false,
        deduped: true,
        message: `${inv.number} has already been sent to ${inv.sentTo ?? recipient}.`,
      });
    }

    if (res.suppressed) {
      return NextResponse.json(
        { error: `Not sent — ${res.reason ?? "no email capacity right now"}. Nothing was recorded.` },
        { status: 503 },
      );
    }

    if (!res.ok && !res.ambiguous) {
      return NextResponse.json(
        { error: `The email was not accepted — ${res.reason ?? "unknown reason"}.` },
        { status: 502 },
      );
    }

    // AMBIGUOUS IS RECORDED AS SENT, ON PURPOSE. The provider neither accepted
    // nor refused, which usually means it did go. Leaving the count where it is
    // would pin the idempotency key in place, so the admin's next press would
    // be deduped and nothing would happen — the worst of both. It is recorded,
    // and the response says plainly that delivery is unconfirmed.
    const { data: marked, error: markErr } = await admin.rpc("invoice_mark_sent", {
      p_invoice_id: inv.id,
      p_to: recipient,
    });
    if (markErr) return failed(markErr, "The email went out but could not be recorded.");

    const row = (Array.isArray(marked) ? marked[0] : marked) as Record<string, unknown> | null;
    const after = row ? toInvoice(row) : inv;

    await audit(admin, {
      action: "invoice.send",
      entityType: "invoice",
      entityId: inv.id,
      diff: {
        number: inv.number,
        to: recipient,
        provider: res.provider ?? null,
        ambiguous: res.ambiguous === true,
        sendCount: after.sendCount,
      },
    });

    return NextResponse.json({
      sent: true,
      ambiguous: res.ambiguous === true,
      invoice: after,
      message: res.ambiguous
        ? `${inv.number} was sent to ${recipient}, but the provider did not confirm it. Check with the customer before sending again.`
        : `${inv.number} sent to ${recipient}.`,
    });
  } catch (err) {
    return failed(err, "Could not send the invoice.");
  }
}
