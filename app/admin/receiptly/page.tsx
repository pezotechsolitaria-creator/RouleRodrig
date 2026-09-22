import type { Metadata } from "next";
import ReceiptlyStudio from "./ReceiptlyStudio";

export const metadata: Metadata = {
  title: "Receiptly | Roule Rodrigues",
  robots: { index: false, follow: false },
};

export default function ReceiptlyPage() {
  return <ReceiptlyStudio />;
}
