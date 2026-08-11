import { downloadBlob } from "./download";
import { buildReceiptPdf, receiptFilename } from "./receipt-pdf";

// ── Booking receipts ─────────────────────────────────────────────────────────
//
// This used to render a styled HTML document into a hidden iframe and call
// print() on it, behind a button labelled "Download receipt". That was the bug:
// it never downloaded anything. It asked for a print dialog and hoped the
// customer would find "Save as PDF" inside it — and then removed the iframe on
// a 4-second timer, which cancelled the dialog for anyone slower than that.
//
// Worse, it failed hardest exactly where this site's traffic is. iframe print()
// is unreliable across WebKit, and an installed PWA frequently has no print UI
// at all — and this app actively pushes users to install it.
//
// So the button now does what it says: it builds a real PDF in the browser and
// saves it. No dialog, no popup to block, nothing for the customer to
// interpret. See lib/receipt-pdf.ts for why that needs no dependency.

export type ReceiptRow = { label: string; value: string; strong?: boolean };

export type ReceiptData = {
  ref: string;
  heading: string; // e.g. "Booking receipt" / "Deposit receipt"
  customer: string;
  itemLabel: string; // "Vehicle" / "Stay" / "Table"
  item: string;
  rows: ReceiptRow[];
  note?: string;
};

/**
 * Saves the receipt as a PDF. Returns false only if the browser refused the
 * download outright, in which case downloadBlob has already fallen back to
 * opening the file in a tab, so the customer still gets their receipt.
 */
export function downloadReceipt(d: ReceiptData): boolean {
  if (typeof window === "undefined") return false;

  const pdf = buildReceiptPdf(d);
  // Copy into a fresh ArrayBuffer so the Blob owns its bytes regardless of how
  // the Uint8Array was allocated.
  const blob = new Blob([pdf.slice().buffer as ArrayBuffer], { type: "application/pdf" });

  return downloadBlob(blob, receiptFilename(d.ref));
}
