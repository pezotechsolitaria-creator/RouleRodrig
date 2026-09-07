"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { downloadReceipt } from "@/lib/receipt";
import { centsToDecimalString } from "@/lib/money";

// ── The invoice, as a file ──────────────────────────────────────────────────
//
// This column said "Soon" with a greyed icon. A merchant asked to produce an
// invoice for their accountant had a table on a screen and nothing to hand
// over, and "Soon" on a billing page reads as "we have not built the part that
// proves what you paid".
//
// ── NO NEW MACHINERY ───────────────────────────────────────────────────────
// buildReceiptPdf already emits a real PDF with no library — it was written for
// customer receipts and its shape (reference, heading, who, what, rows) is a
// document, not a rental. An invoice is that document with different rows, so
// this is a mapping and not a feature. Adding a PDF library to a mobile-first
// bundle to render one page of text would be the wrong trade twice over.

export type InvoiceForPdf = {
  id: string;
  plan: string;
  amount: number;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string | null;
};

function day(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Indian/Mauritius",
      });
}

export default function InvoicePdfButton({
  invoice,
  shopName,
  label = "PDF",
}: {
  invoice: InvoiceForPdf;
  shopName: string;
  /** The table shows an icon; the phone list has room for a word. */
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  function save() {
    setBusy(true);
    try {
      downloadReceipt({
        ref: invoice.id.slice(0, 8).toUpperCase(),
        heading: "Subscription invoice",
        customer: shopName,
        itemLabel: "Plan",
        item: invoice.plan,
        rows: [
          { label: "Invoice date", value: day(invoice.createdAt) },
          { label: "Period", value: `${day(invoice.periodStart)} – ${day(invoice.periodEnd)}` },
          { label: "Amount", value: `Rs ${centsToDecimalString(invoice.amount)}` },
          // The word from the database, not a prettier one. An invoice is a
          // record: if it says "due", the accountant needs to see "due".
          { label: "Status", value: invoice.status },
        ],
        note:
          invoice.status === "paid"
            ? "Paid in full. Roulé Rodrigues, Rodrigues Island, Republic of Mauritius."
            : "This invoice is not yet settled. Roulé Rodrigues, Rodrigues Island, Republic of Mauritius.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={save}
      disabled={busy}
      aria-label={`Download invoice ${invoice.id.slice(0, 8).toUpperCase()} as PDF`}
      className="inline-flex min-h-9 items-center gap-1 rounded-full border border-white/15 px-2.5 font-dm text-xs text-muted transition-colors hover:border-yellow/50 hover:text-yellow disabled:opacity-40"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} {label}
    </button>
  );
}
