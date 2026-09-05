import { redirect } from "next/navigation";

// ── EVENTS ARE OFF THE WEBSITE (owner decision, 2026-08-29) ─────────────────
// The owner removed the events/ticketing product from the public site. The
// route stays as a permanent redirect rather than a 404 because /events was
// indexed and linked from WhatsApp shares — a dead end punishes old links,
// a redirect forgives them. The ticketing infrastructure (tables, sold
// tickets, /orders/track receipts and QR codes, organizer + admin consoles)
// is deliberately untouched: money and admission records outlive the page
// that sold them.
export default function EventsGone() {
  redirect("/");
}
