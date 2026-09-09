// ── ONE PLACE THAT BUILDS A wa.me LINK ──────────────────────────────────────
//
// This lived inside components/WhatsAppButton.tsx as a private function. The
// vehicle detail page needs the same href for its sticky action bar, and a
// second copy is a copy that drifts — in particular past the placeholder guard
// below, which is the only thing stopping the site linking to "5XXX".
//
// Named whatsapp-link.ts, not whatsapp.ts: lib/whatsapp.ts already exists and
// is the OWNER-NOTIFICATION sender (sendOwnerWhatsApp). Different direction,
// different job.

/**
 * A wa.me link for a raw phone number or an already-formed URL.
 *
 * Returns null when there is nothing safe to link to, so a caller can render
 * nothing rather than a dead button.
 */
export function whatsappHref(raw: string, message: string): string | null {
  if (!raw) return null;
  let href: string;
  if (raw.includes("http")) {
    href = raw;
  } else {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return null;
    href = `https://wa.me/${digits}`;
  }
  // A placeholder the owner has not filled in yet ("5XXX XXXX"). Linking it
  // opens WhatsApp on a number that does not exist, which reads as the
  // business ignoring you.
  if (/x/i.test(href)) return null;
  return href.includes("?")
    ? href
    : `${href}?text=${encodeURIComponent(message)}`;
}
