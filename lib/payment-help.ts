import type { Language } from "@/lib/i18n";

// ── "NEED HELP WITH PAYMENT?" — THE LOGIC, WITHOUT THE PIXELS ──────────────
//
// The owner asked for one button, on every screen where somebody pays, that
// takes them to WhatsApp — "very noticeable". This file is everything about it
// that can be wrong without a browser: which problems it offers, how the
// message reads in three languages, and what is allowed into that message.
//
// ── WHY THE MESSAGE IS PREFILLED ───────────────────────────────────────────
// A bare "Hi" costs the owner a round trip on every conversation: which order?
// how much? paid how? The customer already sees all of that on the screen they
// are stuck on. So the tap arrives in WhatsApp as a finished question the owner
// can act on from his phone without opening the admin at all.
//
// ── WHAT IS NOT ALLOWED IN ─────────────────────────────────────────────────
// · Money arithmetic. `amount` is a string the call site already formatted.
//   This repo has shipped a rupees-for-cents bug twice (the same column name
//   carries both units across tables), so the one component that appears on
//   every payment screen must be unable to add a third.
// · Private link tokens. /manage-booking and friends carry bearer tokens in
//   the URL; a customer pasting one into a chat hands over the booking. So no
//   URL is ever included, and a reference that looks like a token is dropped.
// · Bank details, card numbers, passwords. The component's own footnote says we
//   never ask for them — a phishing message on this island would copy our look,
//   and the one defence is that the real thing always says so.
//
// Kept OUT of lib/i18n.ts on purpose, like lib/taxi-faq.ts: LanguageContext
// casts translations[language] as typeof translations.en, so a key added to
// `en` alone is typed as present and undefined at runtime for fr/cr.

/** Where on the site somebody is paying. Every payment surface maps to one.
 *
 *  "booking" and "product" were added after review: the stays modal also books
 *  boat trips and restaurants, and product-page taps were being counted as
 *  "checkout". Both mislabelled the one thing the counts exist to show — which
 *  screen confuses people. */
export type PaymentSection =
  | "checkout"   // cart → marketplace/food checkout
  | "order"      // an order's own page: transfer details, receipt upload
  | "delivery"   // Deliver Anything: choosing cash/transfer, proof upload
  | "rental"     // scooter/car booking: deposit, PayPal, transfer receipt
  | "stay"       // accommodation booking
  | "booking"    // a restaurant table, boat trip, tour or massage — not a stay
  | "event"      // event tickets
  | "ride"       // taxi / airport transfer, paid to the driver
  | "refund"     // asking for money back
  | "product"    // a product page, before checkout — its own row in the counts
  | "invoice"    // an invoice or receipt document
  | "shop-setup"; // a merchant setting up how THEY get paid

export type PaymentTopic =
  | "transfer_not_showing"
  | "upload_failed"
  | "amount"
  | "how_to_pay"
  | "refund"
  | "setup"
  | "other";

type Copy = Record<Language, string>;

export const SECTION_LABEL: Record<PaymentSection, Copy> = {
  checkout: { en: "Checkout", fr: "Paiement de la commande", cr: "Peyman komand" },
  order: { en: "Order payment", fr: "Paiement de la commande", cr: "Peyman komand" },
  delivery: { en: "Delivery (Deliver Anything)", fr: "Livraison (Deliver Anything)", cr: "Livrezon (Deliver Anything)" },
  rental: { en: "Rental booking", fr: "Réservation de location", cr: "Rezervasion lokasion" },
  stay: { en: "Stay booking", fr: "Réservation d'hébergement", cr: "Rezervasion lakaz" },
  booking: { en: "Booking", fr: "Réservation", cr: "Rezervasion" },
  event: { en: "Event tickets", fr: "Billets d'événement", cr: "Tiké levènman" },
  ride: { en: "Taxi / airport transfer", fr: "Taxi / transfert aéroport", cr: "Taksi / transfer ayroport" },
  refund: { en: "Refund", fr: "Remboursement", cr: "Ranbourseman" },
  product: { en: "Product page", fr: "Page produit", cr: "Paz prodwi" },
  invoice: { en: "Invoice", fr: "Facture", cr: "Faktir" },
  "shop-setup": { en: "Shop payment settings", fr: "Paiements de la boutique", cr: "Peyman laboutik" },
};

export const TOPIC_LABEL: Record<PaymentTopic, Copy> = {
  transfer_not_showing: {
    en: "I paid, but it isn't showing",
    fr: "J'ai payé, mais ça n'apparaît pas",
    cr: "Mo'nn peye, me li pa pe paret",
  },
  upload_failed: {
    en: "My receipt won't upload",
    fr: "Mon reçu ne s'envoie pas",
    cr: "Mo resi pa pe monte",
  },
  amount: {
    en: "The amount looks wrong",
    fr: "Le montant semble faux",
    cr: "Montan-la paret fos",
  },
  how_to_pay: {
    en: "I'm not sure how to pay",
    fr: "Je ne sais pas comment payer",
    cr: "Mo pa kone kouma pou peye",
  },
  refund: {
    en: "I need a refund",
    fr: "J'ai besoin d'un remboursement",
    cr: "Mo bizin enn ranbourseman",
  },
  setup: {
    en: "Setting up how I get paid",
    fr: "Configurer mes paiements",
    cr: "Met an plas kouma mo gagn peye",
  },
  other: { en: "Something else", fr: "Autre chose", cr: "Enn lot zafer" },
};

/**
 * The problems worth offering on each screen, most likely first.
 *
 * Chosen per section rather than one list for all: a taxi is paid in cash to
 * the driver, so "my receipt won't upload" there is noise, and noise is what
 * makes somebody skip a list and send "hi".
 */
export const SECTION_TOPICS: Record<PaymentSection, PaymentTopic[]> = {
  // No receipt can exist at checkout — the upload is on the order page after.
  checkout: ["how_to_pay", "amount", "other"],
  order: ["transfer_not_showing", "upload_failed", "how_to_pay", "amount", "other"],
  delivery: ["how_to_pay", "transfer_not_showing", "upload_failed", "other"],
  rental: ["transfer_not_showing", "upload_failed", "how_to_pay", "other"],
  stay: ["transfer_not_showing", "upload_failed", "how_to_pay", "other"],
  booking: ["how_to_pay", "transfer_not_showing", "amount", "other"],
  // Ticket checkout comes BEFORE payment, so "how to pay" leads, not "it isn't showing".
  event: ["how_to_pay", "transfer_not_showing", "upload_failed", "amount", "other"],
  ride: ["how_to_pay", "amount", "other"],
  refund: ["refund", "transfer_not_showing", "other"],
  // Before checkout nobody has paid yet, so "it isn't showing" cannot apply.
  product: ["how_to_pay", "amount", "other"],
  invoice: ["amount", "transfer_not_showing", "other"],
  "shop-setup": ["setup", "transfer_not_showing", "other"],
};

/** The card's own words. */
export const UI_COPY = {
  eyebrow: { en: "PAYMENT HELP", fr: "AIDE AU PAIEMENT", cr: "LED POU PEYE" },
  title: {
    en: "Stuck on payment?",
    fr: "Un souci avec le paiement ?",
    cr: "Ena problem pou peye?",
  },
  // Short on purpose: measured at 375px, the long version wrapped to four lines
  // beside the badge and helped make the card 532px tall — taller than the pay
  // button it sits beside is worth.
  body: {
    en: "A real person on WhatsApp — your details are already filled in.",
    fr: "Une vraie personne sur WhatsApp — vos informations sont déjà remplies.",
    cr: "Enn vre dimounn lor WhatsApp — ou detay deza ranpli.",
  },
  pick: {
    en: "What's the problem?",
    fr: "Quel est le problème ?",
    cr: "Ki problem-la?",
  },
  cta: { en: "Chat on WhatsApp", fr: "Écrire sur WhatsApp", cr: "Koz lor WhatsApp" },
  ctaEmail: { en: "Email our team", fr: "Écrire à notre équipe", cr: "Avoy enn email" },
  compact: {
    en: "Need help paying?",
    fr: "Besoin d'aide pour payer ?",
    cr: "Bizin led pou peye?",
  },
  includes: { en: "Included:", fr: "Inclus :", cr: "Inkli:" },
  safety: {
    en: "We will never ask for a card number, a password or a code.",
    fr: "Nous ne vous demanderons jamais de numéro de carte, de mot de passe ni de code.",
    cr: "Nou pa pou zame demann ou nimero kart, modpas ouswa kod.",
  },
} satisfies Record<string, Copy>;

const GREETING: Copy = {
  en: "Hello Roulé Rodrigues, I need help with a payment.",
  fr: "Bonjour Roulé Rodrigues, j'ai besoin d'aide pour un paiement.",
  cr: "Bonzour Roulé Rodrigues, mo bizin led pou enn peyman.",
};

const FIELD: Record<"problem" | "section" | "shop" | "reference" | "amount" | "method" | "detail", Copy> = {
  problem: { en: "Problem", fr: "Problème", cr: "Problem" },
  section: { en: "Where", fr: "Où", cr: "Kot" },
  shop: { en: "Shop", fr: "Boutique", cr: "Laboutik" },
  reference: { en: "Reference", fr: "Référence", cr: "Referans" },
  amount: { en: "Amount", fr: "Montant", cr: "Montan" },
  method: { en: "Paying by", fr: "Paiement par", cr: "Peye par" },
  detail: { en: "On my screen", fr: "Sur mon écran", cr: "Lor mo lekran" },
};

export type PaymentMethod = "bank_transfer" | "cash" | "paypal" | "card" | "juice";

export const METHOD_LABEL: Record<PaymentMethod, Copy> = {
  bank_transfer: { en: "Bank transfer", fr: "Virement bancaire", cr: "Transfer labank" },
  cash: { en: "Cash", fr: "Espèces", cr: "Kas" },
  paypal: { en: "PayPal", fr: "PayPal", cr: "PayPal" },
  card: { en: "Card", fr: "Carte", cr: "Kart" },
  juice: { en: "MCB Juice", fr: "MCB Juice", cr: "MCB Juice" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Make a reference safe and useful to put in a chat.
 *
 *  · A UUID becomes RR-XXXXXX — the short form admin_operations_feed and the
 *    delivery board already use, so the owner can find it by eye.
 *  · Anything else long and opaque (a manage-booking or tracking token) is
 *    dropped entirely. The owner can find the booking by name and amount; he
 *    cannot un-send a working link that lets a stranger manage it.
 *  · Ordinary human references (RR-1042, RR-RCP-2026-000001) pass unchanged.
 */
export function safeReference(ref: string | null | undefined): string | null {
  const r = (ref ?? "").trim();
  if (!r) return null;
  if (UUID.test(r)) return `RR-${r.slice(0, 6).toUpperCase()}`;
  // Token-shaped: 24+ chars with no spaces, and not an ordinary dashed ref.
  if (r.length >= 24 && /^[A-Za-z0-9_\-.~]+$/.test(r) && !/^RR-/i.test(r)) return null;
  return r.slice(0, 40);
}

/**
 * An on-screen error, made fit for a chat line: one line, no URL, bounded.
 * Error text here is ours (API refusals), but it can carry a URL or run long,
 * and the message rides in a wa.me query string where length is a real limit.
 */
export function clampDetail(detail: string | null | undefined): string | null {
  const d = (detail ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!d) return null;
  return d.length > 160 ? `${d.slice(0, 157).trimEnd()}…` : d;
}

export function pick<T extends Copy>(copy: T, lang: Language): string {
  return copy[lang] ?? copy.en;
}

/**
 * The WhatsApp message, as the owner will receive it.
 *
 * Every line after the greeting is a labelled fact, and a fact with no value is
 * left out rather than printed empty — "Reference: " reads like the customer
 * forgot something.
 */
export function composePaymentHelpMessage(opts: {
  lang: Language;
  section: PaymentSection;
  topic: PaymentTopic;
  reference?: string | null;
  /** The shop, when there is no order yet (checkout, a merchant's own setup).
   *  Its own line so "Reference" only ever carries an order or booking number. */
  shop?: string | null;
  /** Already formatted by the caller, e.g. "Rs 1,250". Never a number. */
  amount?: string | null;
  method?: PaymentMethod | null;
  /** The error the customer is looking at, so the owner sees the same refusal
   *  ("this shop has closed", "the price changed") without asking. */
  detail?: string | null;
}): string {
  const { lang } = opts;
  const ref = safeReference(opts.reference);
  const shop = (opts.shop ?? "").trim().slice(0, 60) || null;
  const amount = (opts.amount ?? "").trim() || null;
  const detail = clampDetail(opts.detail);
  const lines = [
    pick(GREETING, lang),
    "",
    `• ${pick(FIELD.problem, lang)}: ${pick(TOPIC_LABEL[opts.topic], lang)}`,
    `• ${pick(FIELD.section, lang)}: ${pick(SECTION_LABEL[opts.section], lang)}`,
    shop ? `• ${pick(FIELD.shop, lang)}: ${shop}` : null,
    ref ? `• ${pick(FIELD.reference, lang)}: ${ref}` : null,
    amount ? `• ${pick(FIELD.amount, lang)}: ${amount}` : null,
    opts.method ? `• ${pick(FIELD.method, lang)}: ${pick(METHOD_LABEL[opts.method], lang)}` : null,
    detail ? `• ${pick(FIELD.detail, lang)}: "${detail}"` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** The first topic offered on a section — what the card preselects. */
export function defaultTopicFor(section: PaymentSection): PaymentTopic {
  return SECTION_TOPICS[section][0];
}
