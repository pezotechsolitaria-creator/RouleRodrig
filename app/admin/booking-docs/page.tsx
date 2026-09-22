import type { Metadata } from "next";
import BookingDocDesk from "./BookingDocDesk";

export const metadata: Metadata = {
  title: "Booking documents | Roule Rodrigues admin",
  robots: { index: false, follow: false },
};

export default function AdminBookingDocsPage() {
  return <BookingDocDesk />;
}
