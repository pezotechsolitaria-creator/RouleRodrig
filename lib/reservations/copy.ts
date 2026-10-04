import type { HubState } from "./timeline";

// ── The booking page's words and the notification templates ─────────────────
//
// English is the source; French and Kreol ship with it. This repo's Kreol
// code is "cr" (the spec called it "mfe"). Calm on purpose: a declined or
// expired booking is told plainly, never with a red alarm page.

export type ResLang = "en" | "fr" | "cr";

type HubCopy = {
  eyebrow: string;
  nodes: [string, string, string, string];
  state: Record<HubState, string>;
  next: Partial<Record<HubState, [string, string, string]>>;
  holdEnds: string;
  payTitle: string;
  payBy: (deadline: string) => string;
  iPaid: string;
  reported: string;
  reportedNote: string;
  reference: string;
  amount: string;
  party: (a: number, c: number, b: number) => string;
  with: (provider: string) => string;
  meeting: string;
  total: string;
  deposit: string;
  balance: string;
  message: string;
  answerTitle: string;
  send: string;
  sent: string;
  reason: string;
  requestAgain: string;
  error: string;
  details: string;
  quoteLater: string;
  chooseMethod: string;
  cashChoice: string;
  cashChosen: string;
  copy: string;
  copied: string;
  paidSoFar: string;
  live: string;
  offline: string;
  when: string;
  people: string;
  payPaypal: (amount: string) => string;
  paypalFee: (fee: string) => string;
  paypalDone: string;
  paypalError: string;
  account: string;
  notFoundTitle: string;
  back: string;
  retry: string;
  nextTitle: string;
  fields: Record<string, string>;
};

export const HUB_COPY: Record<ResLang, HubCopy> = {
  en: {
    eyebrow: "ROULÉ · YOUR RESERVATION",
    nodes: ["Requested", "Confirmed", "Payment", "Ready"],
    state: {
      checking: "Sent to Roulé. We're checking this with our team.",
      needs_information: "We need one detail before we can hold this.",
      pay: "You're held. Choose how to pay before the timer ends.",
      pay_in_person: "Confirmed. You'll pay Roulé on the day.",
      paid: "Paid. You're set.",
      ready: "You're set. See you there.",
      in_progress: "Under way. Enjoy it.",
      completed: "Done. Thank you for booking with Roulé.",
      declined: "We couldn't hold this one.",
      expired: "This hold ended because payment wasn't received in time. Request it again and we'll recheck the day.",
      cancelled: "This reservation was cancelled.",
    },
    next: {
      checking: ["We check availability.", "You'll see confirmation here.", "Then you choose how to pay."],
      needs_information: ["Answer Roulé's question above.", "Roulé reviews it.", "You'll see confirmation here."],
      pay: ["Choose how to pay below.", "Send the payment with your reference.", "Roulé confirms it here."],
      paid: ["Nothing more to do.", "We'll remind you the day before.", "Message Roulé if anything changes."],
      pay_in_person: ["Nothing to pay now.", "We'll remind you the day before.", "Pay Roulé on the day."],
    },
    holdEnds: "Hold ends in",
    payTitle: "How to pay",
    payBy: (d) => `Pay by ${d}`,
    iPaid: "I've paid",
    reported: "Thanks — Roulé will confirm your payment here.",
    reportedNote: "Roulé checks the account, then this page turns to Paid. Your date stays held meanwhile.",
    reference: "Reference",
    amount: "Amount",
    party: (a, c, b) => [a ? `${a} adult${a === 1 ? "" : "s"}` : "", c ? `${c} child${c === 1 ? "" : "ren"}` : "", b ? `${b} bab${b === 1 ? "y" : "ies"}` : ""].filter(Boolean).join(", "),
    with: (p) => `with ${p}`,
    meeting: "Meeting point",
    total: "Total",
    deposit: "Due now",
    balance: "On the day",
    message: "Message Roulé",
    answerTitle: "Roulé needs",
    send: "Send",
    sent: "Sent. Roulé will review it.",
    reason: "Reason",
    requestAgain: "Request another day",
    error: "We couldn't open this reservation. Check the link Roulé sent you.",
    details: "Details",
    quoteLater: "Roulé confirms the price",
    chooseMethod: "Choose a way to pay",
    cashChoice: "Pay in cash on the day",
    cashChosen: "You chose to pay in cash. Roulé will confirm.",
    copy: "Copy",
    copied: "Copied",
    paidSoFar: "Paid so far",
    live: "This page updates by itself.",
    offline: "Can't reach Roulé right now. Showing the last update.",
    when: "When",
    people: "People",
    payPaypal: (a) => `Pay ${a}`,
    paypalFee: (f) => `includes ${f} PayPal fee`,
    paypalDone: "Payment received. Updating your reservation…",
    paypalError: "The payment didn't go through. You have not been charged.",
    account: "Account",
    notFoundTitle: "Reservation not found",
    back: "Back to Roulé",
    retry: "Try again",
    nextTitle: "WHAT HAPPENS NEXT",
    fields: {
      pickup_time: "Pickup time",
      flight_number: "Flight number",
      passengers: "Number of people",
      driver_name: "Driver's name",
      meeting_point: "Meeting point",
      hotel: "Where you're staying",
      other: "Other detail",
    },
  },
  fr: {
    eyebrow: "ROULÉ · VOTRE RÉSERVATION",
    nodes: ["Demandée", "Confirmée", "Paiement", "Prête"],
    state: {
      checking: "Envoyée à Roulé. Nous vérifions avec notre équipe.",
      needs_information: "Il nous manque une information avant de pouvoir la bloquer.",
      pay: "Votre place est bloquée. Choisissez comment payer avant la fin du délai.",
      pay_in_person: "Confirmée. Vous paierez Roulé le jour même.",
      paid: "Payée. Tout est prêt.",
      ready: "Tout est prêt. À bientôt.",
      in_progress: "C'est parti. Profitez-en.",
      completed: "Terminé. Merci d'avoir réservé avec Roulé.",
      declined: "Nous n'avons pas pu bloquer cette réservation.",
      expired: "Ce blocage a pris fin faute de paiement à temps. Refaites la demande et nous revérifierons la date.",
      cancelled: "Cette réservation a été annulée.",
    },
    next: {
      checking: ["Nous vérifions la disponibilité.", "La confirmation s'affichera ici.", "Puis vous choisissez comment payer."],
      needs_information: ["Répondez à la question de Roulé ci-dessus.", "Roulé vérifie.", "La confirmation s'affichera ici."],
      pay: ["Choisissez un moyen de paiement ci-dessous.", "Envoyez le paiement avec votre référence.", "Roulé le confirme ici."],
      paid: ["Plus rien à faire.", "Nous vous rappellerons la veille.", "Écrivez à Roulé en cas de changement."],
      pay_in_person: ["Rien à payer maintenant.", "Nous vous rappellerons la veille.", "Payez Roulé le jour même."],
    },
    holdEnds: "Fin du blocage dans",
    payTitle: "Comment payer",
    payBy: (d) => `À payer avant ${d}`,
    iPaid: "J'ai payé",
    reported: "Merci — Roulé confirmera votre paiement ici.",
    reportedNote: "Roulé vérifie le compte, puis cette page passera à Payée. Votre date reste bloquée en attendant.",
    reference: "Référence",
    amount: "Montant",
    party: (a, c, b) => [a ? `${a} adulte${a === 1 ? "" : "s"}` : "", c ? `${c} enfant${c === 1 ? "" : "s"}` : "", b ? `${b} bébé${b === 1 ? "" : "s"}` : ""].filter(Boolean).join(", "),
    with: (p) => `avec ${p}`,
    meeting: "Point de rendez-vous",
    total: "Total",
    deposit: "À payer maintenant",
    balance: "Le jour même",
    message: "Écrire à Roulé",
    answerTitle: "Roulé a besoin de",
    send: "Envoyer",
    sent: "Envoyé. Roulé va vérifier.",
    reason: "Motif",
    requestAgain: "Demander une autre date",
    error: "Impossible d'ouvrir cette réservation. Vérifiez le lien envoyé par Roulé.",
    details: "Détails",
    quoteLater: "Roulé confirme le prix",
    chooseMethod: "Choisissez un moyen de paiement",
    cashChoice: "Payer en espèces le jour même",
    cashChosen: "Vous avez choisi de payer en espèces. Roulé va confirmer.",
    copy: "Copier",
    copied: "Copié",
    paidSoFar: "Déjà payé",
    live: "Cette page se met à jour toute seule.",
    offline: "Roulé est injoignable pour l'instant. Dernière mise à jour affichée.",
    when: "Quand",
    people: "Personnes",
    payPaypal: (a) => `Payer ${a}`,
    paypalFee: (f) => `dont ${f} de frais PayPal`,
    paypalDone: "Paiement reçu. Mise à jour de votre réservation…",
    paypalError: "Le paiement n'a pas abouti. Vous n'avez pas été débité.",
    account: "Compte",
    notFoundTitle: "Réservation introuvable",
    back: "Retour à Roulé",
    retry: "Réessayer",
    nextTitle: "LA SUITE",
    fields: {
      pickup_time: "Heure de prise en charge",
      flight_number: "Numéro de vol",
      passengers: "Nombre de personnes",
      driver_name: "Nom du conducteur",
      meeting_point: "Point de rendez-vous",
      hotel: "Votre hébergement",
      other: "Autre information",
    },
  },
  cr: {
    eyebrow: "ROULÉ · OU REZERVASION",
    nodes: ["Demande", "Konfirme", "Peyman", "Pare"],
    state: {
      checking: "Avoye ar Roulé. Nou pe verifie avek nou lekip.",
      needs_information: "Nou bizin enn ti detay avan nou kapav bloke li.",
      pay: "Ou plas bloke. Swazir kouma pou pey avan letan fini.",
      pay_in_person: "Konfirme. Ou pou pey Roulé lor plas.",
      paid: "Pey. Tou korek.",
      ready: "Tou pare. Ziska talerla.",
      in_progress: "Finn koumanse. Profite.",
      completed: "Fini. Mersi pou ou rezervasion avek Roulé.",
      declined: "Nou pa finn kapav bloke sa enn la.",
      expired: "Sa blokaz la finn fini parski peyman pa finn rantre alere. Refer demann la, nou pou reverifie dat la.",
      cancelled: "Sa rezervasion la finn anile.",
    },
    next: {
      checking: ["Nou verifie si ena plas.", "Konfirmasion pou paret isi.", "Apre ou swazir kouma pou pey."],
      needs_information: ["Reponn kestion Roulé lao.", "Roulé get li.", "Konfirmasion pou paret isi."],
      pay: ["Swazir kouma pou pey anba.", "Avoy peyman la avek ou referans.", "Roulé konfirm li isi."],
      paid: ["Nanye pou fer ankor.", "Nou pou rapel ou lavey.", "Ekrir Roulé si kitsoz sanze."],
      pay_in_person: ["Nanye pou pey aster.", "Nou pou rapel ou lavey.", "Pey Roulé lor plas."],
    },
    holdEnds: "Blokaz fini dan",
    payTitle: "Kouma pou pey",
    payBy: (d) => `Pey avan ${d}`,
    iPaid: "Mo finn pey",
    reported: "Mersi — Roulé pou konfirm ou peyman isi.",
    reportedNote: "Roulé get kont la, apre sa paz la pou dir Pey. Ou dat res bloke pandan sa letan la.",
    reference: "Referans",
    amount: "Montan",
    party: (a, c, b) => [a ? `${a} adilt` : "", c ? `${c} zanfan` : "", b ? `${b} baba` : ""].filter(Boolean).join(", "),
    with: (p) => `avek ${p}`,
    meeting: "Landrwa rann-vou",
    total: "Total",
    deposit: "Pou pey aster",
    balance: "Lor plas",
    message: "Ekrir Roulé",
    answerTitle: "Roulé bizin",
    send: "Avoye",
    sent: "Avoye. Roulé pou get li.",
    reason: "Rezon",
    requestAgain: "Demann enn lot zour",
    error: "Nou pa finn kapav ouver sa rezervasion la. Get lien ki Roulé finn avoy ou.",
    details: "Detay",
    quoteLater: "Roulé konfirm pri la",
    chooseMethod: "Swazir kouma pou pey",
    cashChoice: "Pey kas lor plas",
    cashChosen: "Ou finn swazir pey kas. Roulé pou konfirme.",
    copy: "Kopie",
    copied: "Kopie",
    paidSoFar: "Deza pey",
    live: "Sa paz la met li azour tousel.",
    offline: "Nou pa kapav kontak Roulé aster. Nou montre dernie nouvel.",
    when: "Kan",
    people: "Dimounn",
    payPaypal: (a) => `Pey ${a}`,
    paypalFee: (f) => `ladan ${f} fre PayPal`,
    paypalDone: "Peyman resevwar. Nou pe met ou rezervasion azour…",
    paypalError: "Peyman la pa finn pase. Pa finn pran ou kas.",
    account: "Kont",
    notFoundTitle: "Pa trouv rezervasion la",
    back: "Retour lor Roulé",
    retry: "Seye ankor",
    nextTitle: "KI PE ARIVE APRE",
    fields: {
      pickup_time: "Ler pou vinn pran ou",
      flight_number: "Nimero vol",
      passengers: "Kantite dimounn",
      driver_name: "Nom sofer",
      meeting_point: "Landrwa rann-vou",
      hotel: "Kot ou reste",
      other: "Lot detay",
    },
  },
};

// ── Notification templates (outbox payloads render these) ───────────────────

type Vars = { ref: string; product?: string; name?: string; date?: string; time?: string; deadline?: string; place?: string; field?: string };

export const NOTIFY: Record<ResLang, Record<string, (v: Vars) => string>> = {
  en: {
    submitted: (v) => `Roulé has your request ${v.ref}. We'll update this page when it's reviewed.`,
    confirmed: (v) => `${v.ref} is confirmed. Payment is open until ${v.deadline}.`,
    confirmed_in_person: (v) => `${v.ref} is confirmed. You'll pay Roulé on the day.`,
    paid: (v) => `${v.ref} is paid. You're set for ${v.date}${v.time ? ` at ${v.time}` : ""}.`,
    reminder: (v) => `Tomorrow${v.time ? `, ${v.time}` : ""}. ${v.product}.${v.place ? ` Meeting: ${v.place}.` : ""} ${v.ref}.`,
    needs_info: (v) => `Roulé needs your ${v.field} before confirming ${v.ref}.`,
    declined: (v) => `We couldn't hold ${v.ref}. The reason is on your booking page.`,
    expired: (v) => `The hold on ${v.ref} ended because payment didn't arrive in time.`,
    cancelled: (v) => `${v.ref} was cancelled. Message Roulé if this is a surprise.`,
  },
  fr: {
    submitted: (v) => `Roulé a bien reçu votre demande ${v.ref}. Cette page se mettra à jour après vérification.`,
    confirmed: (v) => `${v.ref} est confirmée. Le paiement est ouvert jusqu'au ${v.deadline}.`,
    confirmed_in_person: (v) => `${v.ref} est confirmée. Vous paierez Roulé le jour même.`,
    paid: (v) => `${v.ref} est payée. Tout est prêt pour le ${v.date}${v.time ? ` à ${v.time}` : ""}.`,
    reminder: (v) => `Demain${v.time ? `, ${v.time}` : ""}. ${v.product}.${v.place ? ` Rendez-vous : ${v.place}.` : ""} ${v.ref}.`,
    needs_info: (v) => `Roulé a besoin de : ${v.field}, avant de confirmer ${v.ref}.`,
    declined: (v) => `Nous n'avons pas pu bloquer ${v.ref}. Le motif est sur votre page de réservation.`,
    expired: (v) => `Le blocage de ${v.ref} a pris fin faute de paiement à temps.`,
    cancelled: (v) => `${v.ref} a été annulée. Écrivez à Roulé si c'est une surprise.`,
  },
  cr: {
    submitted: (v) => `Roulé finn gagn ou demann ${v.ref}. Sa paz la pou sanze kan nou finn get li.`,
    confirmed: (v) => `${v.ref} konfirme. Ou kapav pey ziska ${v.deadline}.`,
    confirmed_in_person: (v) => `${v.ref} konfirme. Ou pou pey Roulé lor plas.`,
    paid: (v) => `${v.ref} pey. Tou korek pou ${v.date}${v.time ? ` a ${v.time}` : ""}.`,
    reminder: (v) => `Demin${v.time ? `, ${v.time}` : ""}. ${v.product}.${v.place ? ` Rann-vou: ${v.place}.` : ""} ${v.ref}.`,
    needs_info: (v) => `Roulé bizin ou ${v.field} avan konfirm ${v.ref}.`,
    declined: (v) => `Nou pa finn kapav bloke ${v.ref}. Rezon la lor ou paz rezervasion.`,
    expired: (v) => `Blokaz ${v.ref} finn fini parski peyman pa finn rantre alere.`,
    cancelled: (v) => `${v.ref} finn anile. Ekrir Roulé si sa pa normal.`,
  },
};

/** Subject line and button of each guest email. */
export const EMAIL_COPY: Record<ResLang, { subject: Record<string, string>; cta: string; eyebrow: string }> = {
  en: {
    eyebrow: "Roulé · Your reservation",
    cta: "Open your reservation",
    subject: {
      submitted: "We have your request",
      confirmed: "Confirmed — pay to keep it",
      confirmed_in_person: "Confirmed",
      paid: "Paid — you're set",
      reminder: "See you tomorrow",
      needs_info: "One detail needed",
      declined: "We couldn't hold this one",
      expired: "Your hold has ended",
      cancelled: "Reservation cancelled",
    },
  },
  fr: {
    eyebrow: "Roulé · Votre réservation",
    cta: "Ouvrir votre réservation",
    subject: {
      submitted: "Nous avons votre demande",
      confirmed: "Confirmée — payez pour la garder",
      confirmed_in_person: "Confirmée",
      paid: "Payée — tout est prêt",
      reminder: "À demain",
      needs_info: "Une information manque",
      declined: "Nous n'avons pas pu la bloquer",
      expired: "Votre blocage a pris fin",
      cancelled: "Réservation annulée",
    },
  },
  cr: {
    eyebrow: "Roulé · Ou rezervasion",
    cta: "Ouver ou rezervasion",
    subject: {
      submitted: "Nou finn gagn ou demann",
      confirmed: "Konfirme — pey pou gard li",
      confirmed_in_person: "Konfirme",
      paid: "Pey — tou korek",
      reminder: "Ziska demin",
      needs_info: "Nou bizin enn detay",
      declined: "Nou pa finn kapav bloke li",
      expired: "Ou blokaz finn fini",
      cancelled: "Rezervasion anile",
    },
  },
};

/** The owner's alert, English only (the desk works in English). */
export const adminNewRequest = (v: { ref: string; product: string; name: string; date: string }) =>
  `New request ${v.ref} — ${v.product} — ${v.name} — ${v.date}.`;

/** Every owner alert the outbox carries, one line each. */
export const ADMIN_ALERT: Record<string, (v: { ref: string; product: string; name: string; date: string; method?: string }) => string> = {
  new_request: adminNewRequest,
  payment_reported: (v) => `${v.name} says they paid ${v.ref} by ${v.method ?? "?"} — check the account, then record it. ${v.product}, ${v.date}.`,
  cash_chosen: (v) => `${v.name} will pay ${v.ref} in cash on the day. ${v.product}, ${v.date}.`,
  info_received: (v) => `${v.name} answered your question on ${v.ref}. ${v.product}, ${v.date}.`,
};

/** The prefilled WhatsApp line a guest sends about a reservation. */
export function waText(lang: ResLang, ref: string, product: string, date: string): string {
  if (lang === "fr") return `Bonjour Roulé Rodrigues. Je vous écris au sujet de ${ref} — ${product}, ${date}.`;
  if (lang === "cr") return `Bonzour Roulé Rodrigues. Mo pe ekrir ou lor ${ref} — ${product}, ${date}.`;
  return `Hi Roulé Rodrigues. I'm writing about ${ref} — ${product}, ${date}.`;
}
