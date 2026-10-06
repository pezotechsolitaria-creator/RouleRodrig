// ── The "finish what you started" bar, in the three site languages ─────────
//
// One line of what is waiting, one of when, one button. Calm on purpose: it
// rides along every page until the booking is settled, so it must read as
// help, never as an alarm.

export type PendingLang = "en" | "fr" | "cr";
export const pendingLang = (l: string): PendingLang => (l === "fr" || l === "cr" ? l : "en");

type Copy = {
  pay: (amount: string) => string;
  payNoAmount: string;
  left: (time: string) => string;
  needsInfo: string;
  checking: string;
  rental: string;
  ctaPay: string;
  ctaAnswer: string;
  ctaOpen: string;
  hide: string;
  label: string;
};

export const PENDING_COPY: Record<PendingLang, Copy> = {
  en: {
    pay: (a) => `Finish paying ${a}`,
    payNoAmount: "Finish your payment",
    left: (t) => `${t} left`,
    needsInfo: "Roulé needs one detail",
    checking: "Your request is with Roulé",
    rental: "Finish your booking",
    ctaPay: "Pay",
    ctaAnswer: "Answer",
    ctaOpen: "Open",
    hide: "Hide",
    label: "Your unfinished booking",
  },
  fr: {
    pay: (a) => `Terminez le paiement de ${a}`,
    payNoAmount: "Terminez votre paiement",
    left: (t) => `encore ${t}`,
    needsInfo: "Roulé a besoin d’une précision",
    checking: "Votre demande est chez Roulé",
    rental: "Terminez votre réservation",
    ctaPay: "Payer",
    ctaAnswer: "Répondre",
    ctaOpen: "Ouvrir",
    hide: "Masquer",
    label: "Votre réservation en cours",
  },
  cr: {
    pay: (a) => `Fini pey ${a}`,
    payNoAmount: "Fini ou peyman",
    left: (t) => `res ${t}`,
    needsInfo: "Roulé bizin enn detay",
    checking: "Ou demann ar Roulé",
    rental: "Fini ou rezervasion",
    ctaPay: "Pey",
    ctaAnswer: "Reponn",
    ctaOpen: "Ouver",
    hide: "Kasiet",
    label: "Ou rezervasion ki pa fini",
  },
};
