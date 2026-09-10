import type { Language } from "@/lib/i18n";

// ── THE HALF OF A FLEET CARD THAT loc() NEVER TOUCHED ───────────────────────
//
// Vehicle `tagline` and `description` carry `*Fr` / `*Cr` siblings and go
// through loc(). Nothing else on the card does. So on the French and Kreol
// views every card still read:
//
//   NEW · POPULAR · PREMIUM
//   Air conditioning · Automatic · 5 Seats · 4 Doors
//   Full tank of fuel · Insurance · Free delivery · 24/7 support
//   From Rs 1,899 (Free delivery)  / day
//
// — thirty-three strings, in English, on the money page, permanently. The
// owner's complaint was "I do not want to see English in the French section",
// and this is the bulk of what he was looking at. No amount of translating
// site_content fixes it, because these fields have no translated sibling to
// read and the admin never asked him for one.
//
// ── WHY A DICTIONARY AND NOT NEW FIELDS ─────────────────────────────────────
// specsFr / includedCr arrays would mean the owner re-typing "Climatisation,
// Automatique, 5 places" for every vehicle he ever adds, in two languages, for
// a set of maybe twenty values that repeat across the whole fleet. He would do
// it once and never again, and the cards would drift back into English one new
// car at a time.
//
// These are not prose. They are a small, closed, repeating vocabulary, so they
// are translated once here and matched on the way out. Anything unrecognised
// falls through UNCHANGED — a term the owner invents still renders, in his own
// words, exactly as it does today. This can make the page more French; it can
// never make it emptier.

type Pair = { fr: string; cr: string };

/** Exact terms, matched case-insensitively on the trimmed string. */
const TERMS: Record<string, Pair> = {
  // ── specs ────────────────────────────────────────────────────────────────
  "air conditioning": { fr: "Climatisation", cr: "Erkondisyone" },
  "air conditioner": { fr: "Climatisation", cr: "Erkondisyone" },
  automatic: { fr: "Automatique", cr: "Otomatik" },
  manual: { fr: "Manuelle", cr: "Manyel" },
  "helmet included": { fr: "Casque inclus", cr: "Kask inklir" },
  // ── included ─────────────────────────────────────────────────────────────
  "full tank of fuel": { fr: "Plein de carburant", cr: "Plin lesans" },
  "full tank": { fr: "Plein de carburant", cr: "Plin lesans" },
  insurance: { fr: "Assurance", cr: "Lasirans" },
  "free delivery": { fr: "Livraison gratuite", cr: "Livrezon gratis" },
  "24/7 support": { fr: "Assistance 24/7", cr: "Sipor 24/7" },
  "24/7 customer support": { fr: "Service client 24/7", cr: "Servis kliyan 24/7" },
  "lock & chain": { fr: "Antivol et chaîne", cr: "Kadna ek lasenn" },
  "local support 7/7": { fr: "Assistance locale 7/7", cr: "Sipor lokal 7/7" },
  "fast pickup & drop-off": {
    fr: "Prise et restitution rapides",
    cr: "Pran ek rann vit",
  },
  "daily, weekly & long-term rentals": {
    fr: "Location à la journée, à la semaine et longue durée",
    cr: "Lokasion par zour, par semenn ek lontan",
  },
  "insurance & roadside assistance": {
    fr: "Assurance et assistance routière",
    cr: "Lasirans ek asistans lor sime",
  },
  "easy booking by phone, whatsapp or email": {
    fr: "Réservation facile par téléphone, WhatsApp ou e-mail",
    cr: "Rezervasion fasil par telefonn, WhatsApp ou email",
  },
  "well-maintained, clean vehicles": {
    fr: "Véhicules propres et bien entretenus",
    cr: "Bann veikil prop ek byen antretenir",
  },
  // ── the unit beside the price ────────────────────────────────────────────
  // Small, and on every card on the site. Wired through fleetTerm() before it
  // was in this table, so it fell through unchanged and "/ day" sat beside a
  // French price — the exact bug this file exists to remove, reintroduced one
  // line lower down.
  "/ day": { fr: "/ jour", cr: "/ zour" },
  "/day": { fr: "/jour", cr: "/zour" },
  "per day": { fr: "par jour", cr: "par zour" },
  "/ night": { fr: "/ nuit", cr: "/ lanwit" },
  "/night": { fr: "/nuit", cr: "/lanwit" },
  "per night": { fr: "par nuit", cr: "par lanwit" },
  "/ week": { fr: "/ semaine", cr: "/ semenn" },
  "per week": { fr: "par semaine", cr: "par semenn" },
  "/ hour": { fr: "/ heure", cr: "/ ler" },
  "per hour": { fr: "par heure", cr: "par ler" },
  "/ person": { fr: "/ personne", cr: "/ dimoun" },
  "per person": { fr: "par personne", cr: "par dimoun" },
  // ── badges ───────────────────────────────────────────────────────────────
  new: { fr: "NOUVEAU", cr: "NOUVO" },
  popular: { fr: "POPULAIRE", cr: "POPILER" },
  premium: { fr: "PREMIUM", cr: "PREMIEM" },
  // ── categories and body styles ───────────────────────────────────────────
  scooters: { fr: "Scooters", cr: "Skooter" },
  motorbikes: { fr: "Motos", cr: "Moto" },
  cars: { fr: "Voitures", cr: "Loto" },
  "e-bikes": { fr: "Vélos électriques", cr: "Bisiklet elektrik" },
  bicycles: { fr: "Vélos", cr: "Bisiklet" },
  kayaks: { fr: "Kayaks", cr: "Kayak" },
  // 4x4, SUV and Pick-up are the same word in French — returning them
  // unchanged is the correct translation, not a gap.
  "4x4": { fr: "4x4", cr: "4x4" },
  suv: { fr: "SUV", cr: "SUV" },
  "pick-up": { fr: "Pick-up", cr: "Pikop" },
  // "Compacte", not "Citadine": the Swift's own live descriptionFr already
  // calls it a compacte, and "citadine" appears nowhere in the site's French.
  hatchback: { fr: "Compacte", cr: "Ti loto" },
};

/** Terms whose meaning is "<number> of something" — the number is the owner's
 *  and must survive untouched, so these are patterns rather than entries. */
const COUNTED: { re: RegExp; fr: (n: string) => string; cr: (n: string) => string }[] = [
  { re: /^(\d+)\s*seats?$/i, fr: (n) => `${n} places`, cr: (n) => `${n} plas` },
  { re: /^(\d+)\s*doors?$/i, fr: (n) => `${n} portes`, cr: (n) => `${n} laport` },
  { re: /^(\d+)\s*riders?$/i, fr: (n) => `${n} personnes`, cr: (n) => `${n} dimoun` },
  { re: /^(\d+)\s*helmets?$/i, fr: (n) => `${n} casques`, cr: (n) => `${n} kask` },
  {
    re: /^(\d+)\s*reflective\s*vests?$/i,
    fr: (n) => `${n} gilets réfléchissants`,
    cr: (n) => `${n} zile reflektif`,
  },
  {
    re: /^(\d+)\s*cc\s*engine$/i,
    fr: (n) => `Moteur ${n}cc`,
    cr: (n) => `Moter ${n}cc`,
  },
];

/**
 * One fleet-card term, in the reader's language.
 *
 * Returns the input UNCHANGED for English, for an empty value, and for
 * anything not in the vocabulary above. A term the owner invents tomorrow
 * still renders in his own words.
 */
export function fleetTerm(lang: Language, text?: string | null): string {
  const raw = (text ?? "").trim();
  if (!raw || lang === "en") return text ?? "";

  const hit = TERMS[raw.toLowerCase()];
  if (hit) return lang === "fr" ? hit.fr : hit.cr;

  for (const c of COUNTED) {
    const m = raw.match(c.re);
    if (m) return lang === "fr" ? c.fr(m[1]) : c.cr(m[1]);
  }
  return raw;
}

/** Every term on a list, in order. */
export function fleetTerms(lang: Language, list?: (string | null | undefined)[]): string[] {
  return (list ?? []).filter(Boolean).map((s) => fleetTerm(lang, s));
}

// ── THE WORDS WRAPPED AROUND THE PRICE ─────────────────────────────────────
//
// The owner types a whole price as one string: "From Rs 699(free delivery)",
// " Rs 1899(Free delivery)". Two of its parts are English words sitting on a
// French page, and the rest is money.
//
// So this replaces ONLY the leading "From" and the delivery parenthetical, by
// pattern, and is incapable of touching a digit, a currency or a separator —
// see the test, which asserts every digit survives byte for byte. Money in
// this repo has shipped wrong three times; it is not going to be four because
// a translation helper got clever.
const PRICE_PREFIX: Record<Exclude<Language, "en">, { from: string; free: string }> = {
  fr: { from: "Dès", free: "livraison gratuite" },
  cr: { from: "Apartir", free: "livrezon gratis" },
};

export function fleetPrice(lang: Language, price?: string | null): string {
  const raw = price ?? "";
  if (lang === "en" || !raw.trim()) return raw;
  const w = PRICE_PREFIX[lang];
  return raw
    .replace(/^(\s*)From\b/i, (_m, sp: string) => `${sp}${w.from}`)
    .replace(/free\s*delivery/gi, w.free);
}
