import type { Metadata } from "next";
import ReservationCenter from "./ReservationCenter";

export const metadata: Metadata = { title: "Reservations — Admin", robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by /api/admin/reservations. This
// page renders no privileged data itself — every byte arrives through that
// guarded fetch — so there is nothing here to leak before the check runs.
export default function AdminReservationsPage() {
  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">BOOKINGS</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">Reservation Center</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Requests to book experiences. Confirm holds the date. It does not take payment.
        </p>
        <div className="mt-6">
          <ReservationCenter />
        </div>
      </div>
    </main>
  );
}
