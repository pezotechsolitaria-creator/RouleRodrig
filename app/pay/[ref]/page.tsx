import { redirect } from "next/navigation";

// ── /pay/RR-8F42K — the same, with the reference already in the box ─────────
//
// A reference is not a credential (lib/reservations/reference.ts), so this
// never opens a booking by itself: it fills /track's reference box and the
// guest proves the rest with their email or phone.
export default async function PayRefPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const clean = decodeURIComponent(ref).trim().toUpperCase();
  // Only something shaped like a reference travels on; anything else lands on
  // the empty form rather than in a query string.
  redirect(/^[A-Z0-9-]{4,24}$/.test(clean) ? `/track?ref=${encodeURIComponent(clean)}` : "/track");
}
