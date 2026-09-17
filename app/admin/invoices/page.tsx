import type { Metadata } from "next";
import InvoiceDesk from "./InvoiceDesk";

export const metadata: Metadata = {
  title: "Invoices | Roule Rodrigues admin",
  robots: { index: false, follow: false },
};

// Client-rendered: this desk is entirely interactive — filters, a payment
// dialog, a CSV download — and it shows nobody anything until an admin session
// is verified by the API it calls.
export default function AdminInvoicesPage() {
  return <InvoiceDesk />;
}
