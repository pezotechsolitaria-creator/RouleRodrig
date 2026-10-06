import { redirect } from "next/navigation";

// ── /pay — the address a guest can remember (6 Oct 2026) ────────────────────
//
// It was a 404. A guest who left "Choose a way to pay" and typed the obvious
// address found nothing. Paying needs the booking found first, and /track is
// where a reference and an email (or, for a reservation, the phone) find it —
// a reservation then opens its own payment page straight away.
export default function PayPage() {
  redirect("/track");
}
