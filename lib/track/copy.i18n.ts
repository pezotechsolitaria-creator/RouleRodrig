// ── Every word on /track, the universal activity centre, in three languages ──
//
// /track is the one surface that covers everything: scooter and car rentals,
// boat trips, fishing, massages, shop orders, food and event tickets. It is
// where a customer arrives when something has gone quiet and they want to know
// where their thing is — and it was written entirely in English, down to the
// h1. Somebody who booked a scooter in French, from a French confirmation
// email, came back to an English screen at the one moment they were already
// anxious.
//
// ── WHY THIS IS NOT IN lib/i18n.ts ──────────────────────────────────────────
// The site dictionary is imported by the navbar, so it ships in the bundle of
// every page on roulerodrig.com. These keys belong to two files. Same reason
// lib/delivery/copy.i18n.ts and lib/rides/copy.i18n.ts are split out, and this
// follows their shape exactly: same `Language` union, same LanguageProvider,
// same localStorage key — split at the bundle, not at the concept.
//
// ── WHAT IS DELIBERATELY NOT IN HERE ────────────────────────────────────────
// Four things on this screen are English and stay English, because translating
// them here would either break something or duplicate a decision that lives
// somewhere else:
//
//   1. THE BOOKING REFERENCE. RR-XXXXXX and RR260811-D9220F are a format, not
//      prose. The placeholder below translates the word "or" between the two
//      examples and nothing else — the examples themselves are byte-identical
//      in all three languages, because a customer copying the shape of what
//      they were shown must copy the right shape.
//
//   2. THE STATUS BADGE. `activity.statusLabel` — "Awaiting confirmation",
//      "Out now", "Ready for pickup" — is written by activityLabel() in
//      lib/activity.ts and arrives from /api/activity/lookup already finished.
//      The client cannot translate a sentence it did not author, and writing a
//      second copy of that vocabulary here would be two vocabularies drifting
//      apart, in a repo that has already been bitten by exactly that. It needs
//      the treatment lib/rides/track-errors.ts gave the ride lookup: the server
//      sends the machine value, the dictionary supplies the word. That is a
//      change to lib/activity.ts and to the route, which is not this package.
//
//   3. THE COUNTDOWN'S OWN WORDS. holdRemaining() in lib/orders/hold.ts returns
//      "2 days" / "under an hour", and holdDeadlineLabel() formats the deadline
//      with the "en-GB" locale. Both are shared helpers with other callers
//      (the order notifications, the admin desk). The sentence AROUND them is
//      translated below; the two values they produce are still English inside
//      it, and that is honest rather than fixed.
//
//   4. THE PAGE METADATA. <title> and description are resolved on the server,
//      and the chosen language lives in localStorage, so there is nothing for
//      the server to read. /track is noindex, so the only reader of those two
//      strings is a browser tab.
//
// ── ON THE KREOL ────────────────────────────────────────────────────────────
// Written to match lib/delivery/copy.i18n.ts and lib/rides/copy.i18n.ts — the
// settled orthography, and "ou" rather than "to" for a stranger. Where those
// files already said a thing, it is lifted verbatim rather than re-invented.
// IT HAS NOT BEEN READ BY A NATIVE SPEAKER: correct in structure, waiting for
// an ear on the island.
//
// And the thing worth repeating from the delivery file: FRENCH is the
// accessibility win here. People on Rodrigues READ French — bank letters,
// government notices, forms — while Kreol only recently settled an orthography.
// Both ship; the French is the one that has to be genuinely good.

import type { Language } from "@/lib/i18n";
import type { ActivityKind } from "@/lib/activity";

const EN = {
  // ── The page around the box (app/track/page.tsx) ──────────────────────────
  page: {
    home: "Home",
    eyebrow: "TRACK",
    title: "Where is it?",
    subtitle: "One reference, one email — whatever you booked or ordered.",
    /** Naming everything this covers is the point: the old tab implied it was
     *  only for rentals, so nobody tried it for anything else. */
    covers: {
      vehicle: "Scooter & car rentals",
      place: "Boat trips, fishing & massage",
      food: "Food orders",
      shop: "Shop orders",
      event: "Event tickets",
    },
    accountNote: "Have an account? Everything is already listed.",
    accountCta: "My orders →",
  },

  // ── The one box (app/track/TrackLookup.tsx) ───────────────────────────────
  form: {
    refLabel: "REFERENCE",
    /** The two reference SHAPES are not translatable — only the "or". */
    refPlaceholder: "RR-A1B2C3 or RR260811-D9220F",
    /** Says plainly that ONE box takes all of them — otherwise a customer
     *  holding an order number assumes this is the rentals page. */
    refHelp:
      "Rentals, boat trips, massages, shop orders, food and tickets — all of them.",
    emailLabel: "THE EMAIL YOU USED",
    emailPlaceholder: "you@example.com",
    submit: "Find it",
  },

  errors: {
    heading: "Not found",
    /** Shown only when the route sent no sentence of its own. The route's own
     *  prose is still English — see note 2 at the top of this file. */
    notFound: "We couldn't find that.",
    generic: "Something went wrong.",
  },

  // ── The card that comes back ──────────────────────────────────────────────
  card: {
    /** The eyebrow above the title. Keyed by ActivityKind: the KEYS are the
     *  machine values and never change, only the words. */
    kind: {
      vehicle: "Rental",
      place: "Booking",
      order: "Order",
    } as Record<ActivityKind, string>,
    cta: "See the full details",
    /** The reservation clock. Split around the deadline because the screen
     *  bolds it — the same before/after shape lib/i18n.ts already uses for
     *  shopSwitchBefore/After. `remaining` is holdRemaining(), still English. */
    hold: {
      expired:
        "This reservation has lapsed. If it was not confirmed, the items have been released and you have not been charged.",
      reservedBefore: "Reserved until ",
      reservedAfter: (remaining: string) =>
        ` — ${remaining} left to pay, or the order is cancelled.`,
    },
  },
};

/**
 * The shape every language must satisfy, taken from the English.
 *
 * DELIBERATELY NOT `as const`, for the reason lib/delivery/copy.i18n.ts spells
 * out: with it, every field would be typed as its own string LITERAL and the
 * French would have to say "Find it" to type-check. Widened, it enforces the
 * thing worth enforcing — same keys, same types, in all three.
 */
export type TrackCopy = typeof EN;

const FR: TrackCopy = {
  page: {
    home: "Accueil",
    eyebrow: "SUIVI",
    title: "Où en est-ce ?",
    subtitle:
      "Une référence, un e-mail — quoi que vous ayez réservé ou commandé.",
    covers: {
      vehicle: "Location de scooters et de voitures",
      place: "Sorties en bateau, pêche et massage",
      food: "Commandes de plats",
      shop: "Commandes boutique",
      event: "Billets d’événement",
    },
    accountNote: "Vous avez un compte ? Tout y est déjà listé.",
    accountCta: "Mes commandes →",
  },

  form: {
    refLabel: "RÉFÉRENCE",
    refPlaceholder: "RR-A1B2C3 ou RR260811-D9220F",
    refHelp:
      "Locations, sorties en bateau, massages, commandes boutique, plats et billets — tout.",
    emailLabel: "L’E-MAIL UTILISÉ",
    emailPlaceholder: "you@example.com",
    submit: "Trouver",
  },

  errors: {
    heading: "Introuvable",
    notFound: "Nous n’avons rien trouvé.",
    generic: "Une erreur s’est produite.",
  },

  card: {
    kind: {
      vehicle: "Location",
      place: "Réservation",
      order: "Commande",
    },
    cta: "Voir tous les détails",
    hold: {
      expired:
        "Cette réservation a expiré. Si elle n’a pas été confirmée, les articles ont été libérés et vous n’avez pas été débité.",
      reservedBefore: "Réservé jusqu’au ",
      reservedAfter: (remaining: string) =>
        ` — il reste ${remaining} pour payer, sinon la commande est annulée.`,
    },
  },
};

const CR: TrackCopy = {
  page: {
    home: "Lakaz",
    eyebrow: "SWIVI",
    title: "Kot li ete ?",
    subtitle:
      "Enn referans, enn email — pou tou seki ou finn rezerve ouswa komande.",
    covers: {
      vehicle: "Lokasion skooter ek loto",
      place: "Sorti bato, lapes ek masaz",
      food: "Komann manze",
      shop: "Komann laboutik",
      event: "Tiket evennman",
    },
    accountNote: "Ou ena enn kont ? Tou deza la.",
    accountCta: "Mo bann komann →",
  },

  form: {
    refLabel: "REFERANS",
    refPlaceholder: "RR-A1B2C3 ouswa RR260811-D9220F",
    refHelp:
      "Lokasion, sorti bato, masaz, komann laboutik, manze ek tiket — tou sa.",
    emailLabel: "EMAIL KI OU FINN SERVI",
    emailPlaceholder: "you@example.com",
    submit: "Trouv li",
  },

  errors: {
    heading: "Pa finn trouve",
    notFound: "Nou pa finn trouv nanye.",
    generic: "Enn zafer finn mal pase.",
  },

  card: {
    kind: {
      vehicle: "Lokasion",
      place: "Rezervasion",
      order: "Komann",
    },
    cta: "Get tou bann detay",
    hold: {
      expired:
        "Sa rezervasion la finn expire. Si li pa finn konfirme, bann zafer la finn liber ek nanye pa finn debite.",
      reservedBefore: "Rezerve ziska ",
      reservedAfter: (remaining: string) =>
        ` — ou ena ${remaining} pou peye, sinon komann la anile.`,
    },
  },
};

export const TRACK_COPY: Record<Language, TrackCopy> = {
  en: EN,
  fr: FR,
  cr: CR,
};
