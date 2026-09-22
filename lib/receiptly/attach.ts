import { DOC_KIND_LABEL, type ReceiptlyDoc } from "./model";
import { buildReceiptlyPdf } from "./pdf";

// ── A DOCUMENT, ON ITS WAY INTO AN EMAIL ────────────────────────────────────
//
// Attaching costs nothing the platform is short of. The daily ceiling counts
// ROWS in email_log, not bytes, so a booking confirmation carrying a PDF uses
// exactly the same quota as the same email without one — and that quota is
// shared with Supabase Auth's password resets, which is why the alternative
// (a second "here is your receipt" email) was never the right shape.

export type EmailAttachment = { name: string; content: string };

/**
 * What the file is called in the customer's downloads folder.
 *
 * Named after what it IS and not after the row it came from: "RR-4F2A1B.pdf"
 * is unsearchable six months later, and six months later is exactly when
 * somebody looks for it.
 */
export function attachmentName(doc: ReceiptlyDoc): string {
  const kind = DOC_KIND_LABEL[doc.kind].replace(/\s+/g, "-");
  const ref = doc.reference.replace(/[^A-Za-z0-9-]/g, "");
  return ref ? `${kind}-${ref}.pdf` : `${kind}.pdf`;
}

/**
 * A document → the attachment row both providers take, or null.
 *
 * NULL RATHER THAN A THROW, and the caller sends the email anyway. The email is
 * the load-bearing half: a customer who receives their confirmation without the
 * PDF has lost a convenience, while a customer who receives nothing because a
 * font metric was missing has lost their booking. Nothing in the renderer is
 * worth that trade.
 */
export function documentAttachment(doc: ReceiptlyDoc | null): EmailAttachment | null {
  if (!doc) return null;
  try {
    const bytes = buildReceiptlyPdf(doc);
    if (!bytes?.length) return null;
    return { name: attachmentName(doc), content: Buffer.from(bytes).toString("base64") };
  } catch (err) {
    console.error("receiptly: could not build the attachment", {
      reference: doc.reference,
      kind: doc.kind,
      err,
    });
    return null;
  }
}

/** Spreadable: `...attachmentsFor(doc)` adds nothing when there is nothing. */
export function attachmentsFor(doc: ReceiptlyDoc | null): EmailAttachment[] {
  const one = documentAttachment(doc);
  return one ? [one] : [];
}
