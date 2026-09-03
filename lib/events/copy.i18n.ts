// ── Every word on the /events screens, in three languages ──────────────────
//
// ── WHY THIS IS NOT IN lib/i18n.ts ─────────────────────────────────────────
// Same reason as lib/delivery/copy.i18n.ts and lib/rides/copy.i18n.ts: the site
// dictionary is imported by the navbar, so it ships on every page of
// roulerodrig.com. These keys belong to four screens — the listing, the event,
// the ticket checkout and the share card — and would ride along on the home
// page, the blog and the map for nothing. It reuses the same `Language` union,
// the same LanguageProvider and the same localStorage key, so a person who
// chose Kreol at the door is still in Kreol here.
//
// ── WHAT WAS ALREADY TRANSLATED, AND LIFTED VERBATIM ───────────────────────
// The homepage already sells tickets in three languages (components/EventsPromo
// .tsx), so the event vocabulary was settled before this file existed and is
// copied rather than re-invented:
//
//     ticket        billet (fr)              tiket (cr)
//     Sold out      Complet                  Fini vande
//     from Rs       dès Rs                   depi Rs
//     Details       Détails                  Detay
//     Rs            Rs                       Rs        (never translated)
//
// The money words come from lib/delivery/copy.i18n.ts, which is the only
// trilingual checkout in the repo — "Virement bancaire"/"Vireman banker",
// "Espèces"/"Kas", "Nom complet"/"Non konplet" — so the ticket checkout and the
// delivery checkout say the same thing the same way. "Home" is
// lib/nav-tabs.ts, "À L'AFFICHE"/"SA KI POU ARIVE" and "Explorer"/"Explor" are
// t.events / t.explore in lib/i18n.ts.
//
// ── ONE WORD THAT DID NOT SURVIVE THE CROSSING ─────────────────────────────
// "Package" (a ticket tier: Standard, VIP) is `formule` in French, which is
// exactly how a French venue names a tier. Kreol has no settled equivalent and
// `pake` is already the delivery flow's word for a PARCEL, so the Kreol says
// `tiket` where the English says package — the buyer is looking at the ticket
// either way, and a coined word would have been worse than a plain one.
//
// ── ON THE KREOL, THE SAME WARNING THE OTHER TWO FILES CARRY ───────────────
// IT HAS NOT BEEN READ BY A NATIVE SPEAKER. It follows the orthography settled
// in lib/delivery/copy.i18n.ts — <s> not <ch>, "ou" and not "to" for a stranger
// — and is correct in structure, waiting for an ear on the island. And the part
// worth repeating: FRENCH is the accessibility win. People on Rodrigues READ
// French; Kreol only recently settled an orthography. Both ship, and the French
// is the one that has to be genuinely good.

import type { Language } from "@/lib/i18n";
import { availabilityLabel, countdownLabel } from "@/lib/events/format";

const EN = {
  // ── The sticky back bar, shared by the listing and the event page ────────
  back: {
    home: "Home",
    allEvents: "All events",
    /** The event name is the organiser's, and is never translated. */
    toEvent: (name: string) => `Back to ${name}`,
  },

  // ── Honest scarcity, worded once ────────────────────────────────────────
  // The decision of WHICH of these to show belongs to availabilityLabel() in
  // lib/events/format.ts and is not repeated here — see availabilityCopy below.
  availability: {
    soldOut: "Sold out",
    lastOne: "Last ticket",
    lastFew: (n: number) => `Last ${n} tickets`,
    onlyLeft: (n: number) => `Only ${n} left`,
    remaining: (n: number) => `${n} tickets remaining`,
  },

  countdown: {
    today: "Today",
    tomorrow: "Tomorrow",
    inDays: (n: number) => `In ${n} days`,
  },

  // ── /events ─────────────────────────────────────────────────────────────
  list: {
    eyebrow: "WHAT'S ON",
    title: "Events in Rodrigues",
    getTickets: "Get tickets",
    intro:
      "Reserve your place in seconds — no account needed. Your QR code is your ticket at the gate.",
    /** Stamped across the card image. */
    cancelled: "Cancelled",
    emptyTitle: "Nothing on sale right now",
    emptyBody:
      "Sega nights, markets and festivals will appear here as soon as they open. In the meantime there is plenty happening on the island.",
    emptyCta: "See what's happening",
    alsoTitle: "Also happening",
    alsoBody: "Around the island — no tickets sold here, just what is on.",
    pastTitle: "Already happened",
    crossSell: "While you're here — get around the island your way.",
    scooters: "Scooters",
    explore: "Explore",
  },

  // ── /events/[slug] ──────────────────────────────────────────────────────
  detail: {
    cancelledTitle: "This event was cancelled",
    cancelledNote: "Nothing was charged online, so there is nothing to refund.",
    doors: (doors: string, starts: string) => `Doors ${doors} · starts ${starts}`,
    islandTime: "Rodrigues time",
    /** Shown in place of a venue the organiser never named. A proper noun, so
     *  it is the same word in all three. */
    venueFallback: "Rodrigues",
    openMaps: "Open in Maps",
    endedTitle: "This event has finished",
    endedCta: "See what's coming up",
    chooseEyebrow: "CHOOSE YOUR EXPERIENCE",
    support: "Questions about this event:",
  },

  // ── /events/[slug]/checkout — the page shell around the form ────────────
  checkout: {
    titleOpen: "Get your tickets",
    titleClosed: "Tickets are closed",
    closedCancelled:
      "This event has been cancelled, so tickets are no longer on sale.",
    closedEnded: "This event has already taken place.",
    seeOthers: "See what else is on",
  },

  // ── Choosing a package ──────────────────────────────────────────────────
  picker: {
    noneTitle: "Tickets aren't on sale yet",
    noneBody:
      "Check back soon — or follow Roulé Rodrigues to hear when they go live.",
    soldOut: "Sold out",
    notYet: "Not on sale yet",
    salesClosed: "Sales closed",
    onlyLeft: (n: number) => `Only ${n} left`,
    remaining: (n: number) => `${n} remaining`,
    moreInclusions: (n: number) => `+${n} more`,
    notAvailable: "Not available",
    viewDetails: "View details",
    detailsAria: (name: string) => `${name} details`,
    close: "Close",
    included: "WHAT'S INCLUDED",
    ticketsLeftLow: (n: number) => `Only ${n} tickets remaining`,
    ticketsLeft: (n: number) => `${n} tickets remaining`,
    quantity: "Quantity",
    oneFewer: "One fewer ticket",
    oneMore: "One more ticket",
    maxPerOrder: (n: number) => `Maximum ${n} per order for this package.`,
    minPerOrder: (n: number) => `This package is sold in ${n}s or more.`,
    total: "Total",
    reserveFailed: "Could not reserve those tickets.",
    /** When the basket knows it holds another event but not which one. */
    heldFallback: "another event",
    /** Two halves of one sentence: the event's name sits between them, in bold,
     *  and every language keeps it in the middle. */
    conflictBefore: "You already have tickets for",
    conflictAfter: "waiting. One order covers one event.",
    startFresh: (name: string) => `Start again with ${name}`,
    keep: (name: string) => `Keep ${name}`,
    reserveCta: (name: string) => `Reserve ${name}`,
    nextStep:
      "You'll confirm your details and see how to pay on the next step.",
  },

  // ── The ticket checkout itself ──────────────────────────────────────────
  form: {
    loadFailed: "Could not load your tickets.",
    noneTitle: "No tickets selected",
    noneBody: "Choose a package first and it will appear here.",
    checking: "Checking availability…",
    yourTickets: "YOUR TICKETS",
    total: "Total",
    whosComing: "WHO'S COMING",
    fullName: "Full name",
    phone: "Phone",
    email: "Email — your ticket goes here",
    emailHelp:
      "No account needed. You'll use this address and your order number to find your tickets again.",
    /** The signed-in address sits between these two, in white. */
    ticketGoesToBefore: "Your ticket goes to",
    ticketGoesToAfter: ".",
    payment: "PAYMENT",
    loading: "Loading…",
    noPayment:
      "The organiser hasn't set up a way to be paid yet, so tickets can't be sold.",
    transferTitle: "Bank transfer",
    transferDetail:
      "You'll get the organiser's account details on the next screen, then tell them once you've sent it.",
    cashTitle: "Cash",
    cashDetail: "Pay the organiser directly. Your place is held until then.",
    receiptNote:
      "This organiser asks for a photo or PDF of your transfer. You can attach it on the next screen — no account needed.",
    submitFailed: "We couldn't reserve those tickets.",
    /** Kreol takes no plural -s — the same pattern as t.booking.days. */
    reserve: (n: number) =>
      n > 0 ? `Reserve ${n} ticket${n === 1 ? "" : "s"}` : "Reserve tickets",
    held:
      "Your place is held while you pay. Nothing is charged automatically — the organiser confirms your payment and your ticket is issued then.",
  },

  // ── The share card. This text leaves the site and lands in a stranger's
  //    WhatsApp, so it follows the SENDER's language. ───────────────────────
  share: {
    title: "Tell someone",
    body: "Send it on WhatsApp — the date and place travel with the link.",
    share: "Share",
    copied: "Copied",
    copy: "Copy link",
    /** The line above the URL in the message itself. */
    message: "Reserve your ticket:",
  },
};

/**
 * The shape every language must satisfy, taken from the English.
 *
 * DELIBERATELY NOT `as const`, for the reason spelled out in
 * lib/delivery/copy.i18n.ts: with it, every field would be typed as its own
 * string LITERAL and the French would have to say "Sold out" to type-check.
 * Widened, it enforces the thing worth enforcing — same keys, same types, in
 * all three. copy.i18n.test.ts checks the rest.
 */
export type EventsCopy = typeof EN;

const FR: EventsCopy = {
  back: {
    home: "Accueil",
    allEvents: "Tous les événements",
    toEvent: (name: string) => `Retour à ${name}`,
  },

  availability: {
    soldOut: "Complet",
    lastOne: "Dernier billet",
    lastFew: (n: number) => `Derniers ${n} billets`,
    onlyLeft: (n: number) => `Plus que ${n}`,
    remaining: (n: number) => `${n} billets restants`,
  },

  countdown: {
    today: "Aujourd’hui",
    tomorrow: "Demain",
    inDays: (n: number) => `Dans ${n} jours`,
  },

  list: {
    eyebrow: "À L'AFFICHE",
    title: "Événements à Rodrigues",
    getTickets: "Prendre les billets",
    intro:
      "Réservez votre place en quelques secondes — sans compte. Votre QR code est votre billet à l’entrée.",
    cancelled: "Annulé",
    emptyTitle: "Rien en vente pour le moment",
    emptyBody:
      "Les soirées séga, les marchés et les festivals apparaîtront ici dès leur mise en vente. En attendant, il se passe plein de choses sur l’île.",
    emptyCta: "Voir ce qui se passe",
    alsoTitle: "Aussi à l’affiche",
    alsoBody:
      "Partout sur l’île — pas de billets vendus ici, juste ce qui se passe.",
    pastTitle: "Déjà passé",
    crossSell: "Tant que vous êtes là — déplacez-vous sur l’île à votre façon.",
    scooters: "Scooters",
    explore: "Explorer",
  },

  detail: {
    cancelledTitle: "Cet événement a été annulé",
    cancelledNote:
      "Rien n’a été débité en ligne, il n’y a donc rien à rembourser.",
    doors: (doors: string, starts: string) =>
      `Ouverture ${doors} · début ${starts}`,
    islandTime: "Heure de Rodrigues",
    venueFallback: "Rodrigues",
    openMaps: "Ouvrir dans Maps",
    endedTitle: "Cet événement est terminé",
    endedCta: "Voir les prochains événements",
    chooseEyebrow: "CHOISISSEZ VOTRE EXPÉRIENCE",
    support: "Questions sur cet événement :",
  },

  checkout: {
    titleOpen: "Prenez vos billets",
    titleClosed: "Billetterie fermée",
    closedCancelled:
      "Cet événement a été annulé, les billets ne sont plus en vente.",
    closedEnded: "Cet événement a déjà eu lieu.",
    seeOthers: "Voir les autres événements",
  },

  picker: {
    noneTitle: "Les billets ne sont pas encore en vente",
    noneBody:
      "Revenez bientôt — ou suivez Roulé Rodrigues pour savoir dès leur mise en vente.",
    soldOut: "Complet",
    notYet: "Pas encore en vente",
    salesClosed: "Ventes fermées",
    onlyLeft: (n: number) => `Plus que ${n}`,
    remaining: (n: number) => `${n} restants`,
    moreInclusions: (n: number) => `+${n} autres`,
    notAvailable: "Indisponible",
    viewDetails: "Voir les détails",
    detailsAria: (name: string) => `Détails ${name}`,
    close: "Fermer",
    included: "CE QUI EST INCLUS",
    ticketsLeftLow: (n: number) => `Plus que ${n} billets`,
    ticketsLeft: (n: number) => `${n} billets restants`,
    quantity: "Quantité",
    oneFewer: "Un billet de moins",
    oneMore: "Un billet de plus",
    maxPerOrder: (n: number) =>
      `Maximum ${n} par commande pour cette formule.`,
    minPerOrder: (n: number) => `Cette formule se vend par ${n} minimum.`,
    total: "Total",
    reserveFailed: "Impossible de réserver ces billets.",
    heldFallback: "un autre événement",
    conflictBefore: "Vous avez déjà des billets pour",
    conflictAfter: "en attente. Une commande couvre un seul événement.",
    startFresh: (name: string) => `Recommencer avec ${name}`,
    keep: (name: string) => `Garder ${name}`,
    reserveCta: (name: string) => `Réserver ${name}`,
    nextStep:
      "Vous confirmerez vos coordonnées et verrez comment payer à l’étape suivante.",
  },

  form: {
    loadFailed: "Impossible de charger vos billets.",
    noneTitle: "Aucun billet sélectionné",
    noneBody: "Choisissez d’abord une formule et elle apparaîtra ici.",
    checking: "Vérification des disponibilités…",
    yourTickets: "VOS BILLETS",
    total: "Total",
    whosComing: "QUI VIENT",
    fullName: "Nom complet",
    phone: "Téléphone",
    email: "E-mail — votre billet arrive ici",
    emailHelp:
      "Pas de compte nécessaire. Vous retrouverez vos billets avec cette adresse et votre numéro de commande.",
    ticketGoesToBefore: "Votre billet sera envoyé à",
    ticketGoesToAfter: ".",
    payment: "PAIEMENT",
    loading: "Chargement…",
    noPayment:
      "L’organisateur n’a pas encore indiqué comment être payé, les billets ne peuvent donc pas être vendus.",
    transferTitle: "Virement bancaire",
    transferDetail:
      "Vous recevrez les coordonnées bancaires de l’organisateur à l’écran suivant, puis vous le prévenez une fois l’argent envoyé.",
    cashTitle: "Espèces",
    cashDetail:
      "Vous payez l’organisateur directement. Votre place est gardée jusque-là.",
    receiptNote:
      "Cet organisateur demande une photo ou un PDF du virement. Vous pourrez la joindre à l’écran suivant — sans compte.",
    submitFailed: "Nous n’avons pas pu réserver ces billets.",
    reserve: (n: number) =>
      n > 0 ? `Réserver ${n} billet${n > 1 ? "s" : ""}` : "Réserver les billets",
    held:
      "Votre place est gardée pendant que vous payez. Rien n’est débité automatiquement — l’organisateur confirme votre paiement et votre billet est émis à ce moment-là.",
  },

  share: {
    title: "Faites passer le mot",
    body: "Envoyez-le sur WhatsApp — la date et le lieu voyagent avec le lien.",
    share: "Partager",
    copied: "Copié",
    copy: "Copier le lien",
    message: "Réservez votre billet :",
  },
};

const CR: EventsCopy = {
  back: {
    home: "Lakaz",
    allEvents: "Tou bann evennman",
    toEvent: (name: string) => `Retour ver ${name}`,
  },

  availability: {
    soldOut: "Fini vande",
    lastOne: "Dernie tiket",
    lastFew: (n: number) => `Dernie ${n} tiket`,
    onlyLeft: (n: number) => `Zis ${n} ki reste`,
    remaining: (n: number) => `${n} tiket ki reste`,
  },

  countdown: {
    today: "Zordi",
    tomorrow: "Demen",
    inDays: (n: number) => `Dan ${n} zour`,
  },

  list: {
    eyebrow: "SA KI POU ARIVE",
    title: "Evennman dan Rodrig",
    getTickets: "Pran tiket",
    intro:
      "Rezerv ou plas an detrwa segonn — pena kont pou fer. Ou QR code sa mem ou tiket kot laport.",
    cancelled: "Anile",
    emptyTitle: "Nanye pa an vant pou lemoman",
    emptyBody:
      "Bann sware sega, bazar ek festival pou paret isi deswit ki zot ouver. Antretan, ena boukou zafer ki pe pase lor zil la.",
    emptyCta: "Get seki pe pase",
    alsoTitle: "Osi pe pase",
    alsoBody: "Partou lor zil la — pena tiket ki vande isi, zis seki pe pase.",
    pastTitle: "Finn deza pase",
    crossSell: "Pandan ou la — deplas ou lor zil la kouma ou anvi.",
    scooters: "Skooter",
    explore: "Explor",
  },

  detail: {
    cancelledTitle: "Sa evennman la finn anile",
    cancelledNote:
      "Nanye pa finn debite online, alor pena nanye pou rambourse.",
    doors: (doors: string, starts: string) =>
      `Laport ouver ${doors} · koumans ${starts}`,
    islandTime: "Ler Rodrig",
    venueFallback: "Rodrigues",
    openMaps: "Ouver dan Maps",
    endedTitle: "Sa evennman la finn fini",
    endedCta: "Get bann prosen evennman",
    chooseEyebrow: "SWAZIR OU EXPERYANS",
    support: "Kestion lor sa evennman la :",
  },

  checkout: {
    titleOpen: "Pran ou bann tiket",
    titleClosed: "Vant tiket ferme",
    closedCancelled:
      "Sa evennman la finn anile, alor tiket pa an vant ankor.",
    closedEnded: "Sa evennman la finn deza pase.",
    seeOthers: "Get lezot evennman",
  },

  picker: {
    noneTitle: "Tiket pankor an vant",
    noneBody:
      "Revini biento — ouswa swiv Roulé Rodrigues pou kone ler zot sorti.",
    soldOut: "Fini vande",
    notYet: "Pankor an vant",
    salesClosed: "Vant ferme",
    onlyLeft: (n: number) => `Zis ${n} ki reste`,
    remaining: (n: number) => `${n} ki reste`,
    moreInclusions: (n: number) => `+${n} ankor`,
    notAvailable: "Pa Disponib",
    viewDetails: "Get detay",
    detailsAria: (name: string) => `Detay ${name}`,
    close: "Ferme",
    included: "SEKI INKLI",
    ticketsLeftLow: (n: number) => `Zis ${n} tiket ki reste`,
    ticketsLeft: (n: number) => `${n} tiket ki reste`,
    quantity: "Kantite",
    oneFewer: "Enn tiket demwens",
    oneMore: "Enn tiket anplis",
    maxPerOrder: (n: number) => `Maximum ${n} par komann pou sa tiket la.`,
    minPerOrder: (n: number) => `Sa tiket la vann par ${n} minimum.`,
    total: "Total",
    reserveFailed: "Pa finn kapav rezerv sa bann tiket la.",
    heldFallback: "enn lot evennman",
    conflictBefore: "Ou deza ena tiket pou",
    conflictAfter: "ki pe atann. Enn komann kouver enn sel evennman.",
    startFresh: (name: string) => `Rekoumans ar ${name}`,
    keep: (name: string) => `Gard ${name}`,
    reserveCta: (name: string) => `Rezerv ${name}`,
    nextStep:
      "Lor letap swivan ou pou konfirm ou detay ek trouv kouma peye.",
  },

  form: {
    loadFailed: "Pa finn kapav sarz ou bann tiket.",
    noneTitle: "Pena tiket swazi",
    noneBody: "Swazir enn tiket avan ek li pou paret isi.",
    checking: "Pe verifie disponibilite…",
    yourTickets: "OU BANN TIKET",
    total: "Total",
    whosComing: "KI PE VINI",
    fullName: "Non konplet",
    phone: "Telefonn",
    email: "Email — ou tiket pou vinn la",
    emailHelp:
      "Pena bezwin kont. Ou pou retrouv ou bann tiket ar sa adres la ek ou nimero komann.",
    ticketGoesToBefore: "Nou pou avoy ou tiket lor",
    ticketGoesToAfter: ".",
    payment: "PEYMAN",
    loading: "Pe sarze…",
    noPayment:
      "Organizater la pankor dir kouma pou peye li, alor tiket pa kapav vande.",
    transferTitle: "Vireman banker",
    transferDetail:
      "Lor lekran swivan ou pou gagn detay kont organizater la, apre ou dir li kan ou finn avoy kas la.",
    cashTitle: "Kas",
    cashDetail:
      "Ou peye organizater la direk. Ou plas reste gard ziska sa ler la.",
    receiptNote:
      "Sa organizater la demann enn foto ouswa PDF vireman la. Ou pou kapav zwenn li lor lekran swivan — pena bezwin kont.",
    submitFailed: "Nou pa finn kapav rezerv sa bann tiket la.",
    reserve: (n: number) => (n > 0 ? `Rezerv ${n} tiket` : "Rezerv bann tiket"),
    held:
      "Ou plas reste gard pandan ou peye. Nanye pa debite otomatikman — organizater la konfirm ou peyman ek ou tiket sorti sa ler la.",
  },

  share: {
    title: "Dir enn dimounn",
    body: "Avoy li lor WhatsApp — dat ek plas la vwayaz ar lien la.",
    share: "Partaze",
    copied: "Kopie",
    copy: "Kopie lien",
    message: "Rezerv ou tiket :",
  },
};

export const EVENTS_COPY: Record<Language, EventsCopy> = {
  en: EN,
  fr: FR,
  cr: CR,
};

/**
 * The availability line, in the reader's language.
 *
 * The JUDGEMENT — sold out, last ticket, last few, almost gone, or a plain
 * count — belongs to availabilityLabel() in lib/events/format.ts, and is not
 * repeated here. This calls it, keeps its `tone` untouched (the tone is what
 * colours the text and what the pages test against), and only chooses the
 * words. So the "20 left out of 5,000 is not the same story as 20 out of 25"
 * rule stays in one place: change it there and every language follows.
 */
export function availabilityCopy(
  language: Language,
  remaining: number,
  capacity: number,
): { text: string; tone: "gone" | "low" | "ok" } {
  const { tone } = availabilityLabel(remaining, capacity);
  const c = EVENTS_COPY[language].availability;
  if (tone === "gone") return { text: c.soldOut, tone };
  if (tone === "ok") return { text: c.remaining(remaining), tone };
  if (remaining === 1) return { text: c.lastOne, tone };
  if (remaining <= 5) return { text: c.lastFew(remaining), tone };
  return { text: c.onlyLeft(remaining), tone };
}

/**
 * "Today" / "Tomorrow" / "In 3 days", or nothing.
 *
 * countdownLabel() owns whether a badge appears at all and the 14-day window it
 * appears inside; this returns null exactly when it does, so the two can never
 * disagree about visibility. `now` is passed in rather than read here because
 * the badge is rendered by a client component: the SERVER's clock has to decide
 * it, or a phone with a wrong clock would hydrate a different day.
 */
export function countdownCopy(
  language: Language,
  iso: string,
  now: number,
): string | null {
  if (countdownLabel(iso, now) === null) return null;
  const days = Math.floor((new Date(iso).getTime() - now) / 86_400_000);
  const c = EVENTS_COPY[language].countdown;
  if (days === 0) return c.today;
  if (days === 1) return c.tomorrow;
  return c.inDays(days);
}
