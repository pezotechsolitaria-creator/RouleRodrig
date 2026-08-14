// ── Building a wa.me link, once ─────────────────────────────────────────────
//
// This is hand-rolled in about a dozen places in this codebase (taxi, food,
// transfers, driver home, admin) as some variant of
// `https://wa.me/${phone.replace(/\D/g,"")}`. That inline version has two real
// failure modes, and both produce a link that LOOKS fine and opens a WhatsApp
// screen with no chat behind it:
//
//   1. A local number. Rodrigues numbers are written "5942 1234" all over the
//      island; stripping non-digits gives "59421234", which wa.me reads as a
//      country code it doesn't recognise. WhatsApp needs the full international
//      form with no plus and no leading zero.
//   2. An owner who pastes a whole wa.me/chat URL into a phone field instead of
//      a number — which is exactly what an admin field invites.
//
// So this module is pure and tested, and new surfaces use it rather than
// growing a thirteenth copy. It deliberately does NOT rewrite the existing
// call sites: those are live payment and dispatch paths, and changing how they
// resolve a number is its own change with its own verification.

/** Mauritius/Rodrigues. They share the +230 country code. */
const DEFAULT_COUNTRY_CODE = "230";

/** A local Rodrigues mobile is 8 digits once the country code is off. */
const LOCAL_LENGTH = 8;

/**
 * Normalise whatever the owner typed into the digits wa.me expects.
 *
 * Accepts "+230 5942 1234", "5942 1234", "0230...", "https://wa.me/2305942...".
 * Returns null when there is nothing usable, so a caller can render no button
 * at all rather than a dead one.
 */
export function normalizeWaNumber(
  raw: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!raw) return null;

  // A pasted wa.me / api.whatsapp.com link: take the number out of it and
  // ignore any ?text= the owner may have saved with it.
  const fromUrl = raw.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d[\d\s-]*)/i);
  const source = fromUrl ? fromUrl[1] : raw;

  let digits = source.replace(/\D/g, "");
  if (!digits) return null;

  // "00230…" — the other way of writing "+230".
  if (digits.startsWith(`00${countryCode}`)) digits = digits.slice(2);

  // A bare local number: prepend the country code. Checked BEFORE the
  // already-prefixed case, because an 8-digit local number can't also be a
  // prefixed one.
  if (digits.length === LOCAL_LENGTH) return `${countryCode}${digits}`;

  // A local number written with a trunk zero, e.g. "05942 1234".
  if (digits.length === LOCAL_LENGTH + 1 && digits.startsWith("0")) {
    return `${countryCode}${digits.slice(1)}`;
  }

  // Already international (ours or another country's) — leave it alone. Guard
  // the low end so a scrap like "123" never becomes a link.
  return digits.length >= 9 ? digits : null;
}

/**
 * A tappable wa.me URL with an optional pre-filled first message.
 *
 * Returns null when the number is unusable — render nothing rather than a
 * button that opens WhatsApp on an empty screen.
 */
export function waLink(
  raw: string | null | undefined,
  message?: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  const number = normalizeWaNumber(raw, countryCode);
  if (!number) return null;
  const text = message?.trim();
  return text ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : `https://wa.me/${number}`;
}
