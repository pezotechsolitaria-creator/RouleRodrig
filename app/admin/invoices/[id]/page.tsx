import type { Metadata } from "next";
import InvoiceDetailView from "./InvoiceDetailView";

export const metadata: Metadata = {
  title: "Invoice | Roule Rodrigues admin",
  robots: { index: false, follow: false },
};

export default async function AdminInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceDetailView id={id} />;
}
