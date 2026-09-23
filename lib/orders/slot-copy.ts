// ── WHAT A BOOKED ORDER SAYS ABOUT ITS DAY (M216) ───────────────────────────
//
// lib/orders/slot.ts says a slot one way. This says what the slot MEANS, per
// fulfilment, to the three people who read about an order after it is placed:
// the customer (email, /orders/[id], /orders/track, the PDF), the kitchen (its
// email and push) and the owner (the ntfy/WhatsApp alert he phones the cook
// from).
//
// Before M216 every one of those printed the 7-day cash hold — "Your items are
// reserved until Wed 30 Sep, 10:00", "Accept by Wed 30 Sep" — and none of them
// printed the booked slot. With Chez Banane taking orders one to two days
// ahead, that is a customer walking to the kitchen on the wrong day and an
// owner calling the cook about the wrong day. The hold is not even the real
// deadline of a slotted order: see holdIsTheDeadline() in ./hold.ts.
//
// ── DELIVERY IS PHRASED WITH CARE ──────────────────────────────────────────
// A Roulé delivery is NOT dispatched when the order is placed; the job is
// created when the cook marks it ready. So for a delivery the slot is when the
// kitchen HANDS THE FOOD OVER, not when it reaches the door. "Delivered
// 12:00–12:30" would be a promise nobody on the platform is placed to keep.
//
// The emails are English by design (./hold.ts explains why), so the email and
// alert builders take no language. The two order pages speak the visitor's
// language, so slotCard() is EN/FR/CR.

import type { Language } from "@/lib/i18n";
import type { PaymentProvider } from "./hold";
import {
  formatSlot,
  isSlotToday,
  rodriguesDay,
  slotDayWords,
  slotTimes,
  type SlotWindow,
} from "./slot";

type Fulfilment = string | null | undefined;

const isDelivery = (f: Fulfilment) => f === "rr_delivery" || f === "customer_delivery";

/** "Fri 25 Sep". Three letters of the English words slot.ts already spells. */
function shortDay(w: SlotWindow): string {
  const [weekday = "", day = "", month = ""] = slotDayWords(w.from, "en").split(" ");
  return `${weekday.slice(0, 3)} ${day} ${month.slice(0, 3)}`;
}

/**
 * "Fri 25 Sep, 12:00–12:30".
 *
 * For the PDF, whose detail fields are a third of the page wide: the full
 * "Wednesday 30 September, 12:00–12:30" measures 162pt against a 142pt field
 * and was clipped to "…12:0". This one is 105pt.
 */
export function slotShortLabel(w: SlotWindow): string {
  return `${shortDay(w)}, ${slotTimes(w)}`;
}

/**
 * "For FRI 25 SEP 12:00–12:30" — the line the owner reads on his lock screen
 * before he phones the cook. Capitals because it is the one fact on that
 * alert he must not misread; no year because a slot is at most days away.
 */
export function slotAlertLine(w: SlotWindow): string {
  return `For ${shortDay(w).toUpperCase()} ${slotTimes(w)}`;
}

/** The label of the slot's detail row, in the emails and on the PDF. */
export function slotRowLabel(fulfillment: Fulfilment): string {
  if (fulfillment === "rr_delivery") return "Handed to driver";
  if (fulfillment === "customer_delivery") return "Driver collects";
  return "Collection";
}

/**
 * The sentence the customer's email LEADS with.
 *
 *   pickup             Collect on Friday 25 September, 12:00–12:30 at Chez Banane.
 *   rr_delivery        Delivery on Friday 25 September — the kitchen hands it to
 *                      the driver at 12:00–12:30.
 *   customer_delivery  Ready for your driver on Friday 25 September, 12:00–12:30
 *                      at Chez Banane.
 *
 * No `now`: an email is read hours or days later, so the date is always spelled
 * out and never "tomorrow".
 */
export function customerSlotLead(w: SlotWindow, fulfillment: Fulfilment, storeName: string): string {
  if (fulfillment === "rr_delivery") {
    return `Delivery on ${slotDayWords(w.from)} — the kitchen hands it to the driver at ${slotTimes(w)}.`;
  }
  if (fulfillment === "customer_delivery") {
    return `Ready for your driver on ${formatSlot(w)} at ${storeName}.`;
  }
  return `Collect on ${formatSlot(w)} at ${storeName}.`;
}

/**
 * What the customer owes, and when, for a booked order.
 *
 * Replaces customerHoldCopy() for these orders, whose "reserved until <hold>"
 * named a day a week away while the food was booked for tomorrow.
 */
export function customerSlotPayment(provider: PaymentProvider | undefined, fulfillment: Fulfilment): string {
  if (provider === "bank_transfer") {
    return "Send the transfer and upload your proof of payment on your order page before then — the kitchen confirms your order once it arrives. You are never charged automatically.";
  }
  if (provider === "cash") {
    // "At handover" named the wrong handover for a delivery: the sentence
    // before it is about the kitchen handing the food to the DRIVER. The
    // customer pays when it reaches them — checkout's own words.
    return isDelivery(fulfillment)
      ? "Pay in cash when it reaches you — nothing is charged now."
      : "Pay in cash when you collect — nothing is charged now.";
  }
  return "You pay the kitchen directly — nothing is charged now.";
}

/**
 * What the KITCHEN is told in its email, in place of merchantHoldCopy()'s
 * "Confirm within 7 days". A cash pre-order waits in pending_payment until the
 * cook presses Start cooking on the day, and expire_order() cancels one nobody
 * started once its slot is over — so "the end of that slot" is the deadline
 * worth stating, and it errs early rather than late.
 */
export function merchantSlotCopy(
  w: SlotWindow,
  fulfillment: Fulfilment,
  provider: PaymentProvider | undefined,
): string {
  const handover =
    fulfillment === "rr_delivery"
      ? "Mark it ready then and a Roulé driver is sent for it — the delivery is only booked when you do."
      : fulfillment === "customer_delivery"
        ? "The customer’s own driver collects it then."
        : "The customer collects it then.";
  const pay =
    provider === "cash"
      ? fulfillment === "pickup"
        ? " The customer pays in cash when they collect."
        : " The customer pays in cash when it is delivered."
      : provider === "bank_transfer"
        ? " The customer pays by bank transfer — confirm it on your dashboard once it arrives."
        : "";
  return (
    `Booked for ${formatSlot(w)}. ${handover}${pay} ` +
    `Start cooking it on the day. If it has not been started by the end of that slot, it is cancelled automatically.`
  );
}

// ── THE ORDER PAGES ─────────────────────────────────────────────────────────

export type SlotCardCopy = {
  eyebrow: string;
  /** "Collect tomorrow, 12:00–12:30" — the one line that must not be missed. */
  headline: string;
  /** The date, spelled out, when the headline said "today" or "tomorrow". */
  date: string | null;
  lines: string[];
};

type CardWords = {
  eyebrow: string;
  today: string;
  tomorrow: string;
  /** A named day inside a sentence: "on Friday 25 September". */
  onDay: (day: string) => string;
  collect: (day: string, times: string) => string;
  delivery: (day: string) => string;
  handsToDriver: (from: string, to: string) => string;
  forDriver: (day: string, times: string) => string;
  at: (store: string) => string;
  driverCollects: (store: string) => string;
  payCash: string;
  payCashDelivery: string;
  payTransfer: string;
  cookOnTheDay: string;
};

const CARD: Record<Language, CardWords> = {
  en: {
    eyebrow: "Your booked time",
    today: "today",
    tomorrow: "tomorrow",
    onDay: (day) => `on ${day}`,
    collect: (day, times) => `Collect ${day}, ${times}`,
    delivery: (day) => `Delivery ${day}`,
    handsToDriver: (from, to) => `The kitchen hands it to the driver between ${from} and ${to}.`,
    forDriver: (day, times) => `Ready for your driver ${day}, ${times}`,
    at: (store) => `At ${store}.`,
    driverCollects: (store) => `Your driver collects it from ${store}.`,
    payCash: "Pay in cash when you collect — nothing is charged now.",
    payCashDelivery: "Pay in cash when it reaches you — nothing is charged now.",
    payTransfer: "Send the transfer before then — the kitchen confirms your order once it arrives.",
    cookOnTheDay: "The cook starts it on the day.",
  },
  fr: {
    eyebrow: "Votre créneau",
    today: "aujourd’hui",
    tomorrow: "demain",
    onDay: (day) => `le ${day}`,
    collect: (day, times) => `À retirer ${day}, ${times}`,
    delivery: (day) => `Livraison ${day}`,
    handsToDriver: (from, to) => `La cuisine le remet au chauffeur entre ${from} et ${to}.`,
    forDriver: (day, times) => `Prêt pour votre chauffeur ${day}, ${times}`,
    // "Auprès de", never "Chez": the only kitchen is CALLED Chez Banane, and
    // "Chez Chez Banane." is what the first draft of this line printed.
    at: (store) => `Auprès de ${store}.`,
    driverCollects: (store) => `Votre chauffeur le récupère auprès de ${store}.`,
    payCash: "Payez en espèces au retrait — rien n’est débité maintenant.",
    payCashDelivery: "Payez en espèces à la réception — rien n’est débité maintenant.",
    payTransfer: "Envoyez le virement avant — la cuisine confirme votre commande dès réception.",
    cookOnTheDay: "Le cuisinier la prépare le jour même.",
  },
  cr: {
    eyebrow: "Ou ler rezerve",
    today: "zordi",
    tomorrow: "demin",
    onDay: (day) => day,
    collect: (day, times) => `Vinn pran li ${day}, ${times}`,
    delivery: (day) => `Livrezon ${day}`,
    handsToDriver: (from, to) => `Lakwizinn donn li sofer la ant ${from} ek ${to}.`,
    forDriver: (day, times) => `Pare pou ou sofer ${day}, ${times}`,
    at: (store) => `Kot ${store}.`,
    driverCollects: (store) => `Ou sofer vinn pran li kot ${store}.`,
    payCash: "Peye an kas kan ou vinn pran li — ou pa peye nanye aster.",
    payCashDelivery: "Peye an kas kan ou gagn li — ou pa peye nanye aster.",
    payTransfer: "Avoy virman la avan sa — lakwizinn konfirm ou komann kan li gagn li.",
    cookOnTheDay: "Kwizinie la kwi li sa zour la mem.",
  },
};

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The card at the top of /orders/[id] and /orders/track.
 *
 * Unlike an email the page is read NOW, so today and tomorrow are named — and
 * the date is printed under them anyway, because "tomorrow" read at 00:10 is
 * the kind of word a customer should be able to check.
 */
export function slotCard(
  w: SlotWindow,
  opts: {
    fulfillment: Fulfilment;
    storeName: string;
    provider?: PaymentProvider | null;
    /** orders.status. The pay and cook lines only apply before it is started. */
    status?: string | null;
    lang?: Language;
    now?: Date;
  },
): SlotCardCopy {
  const lang = opts.lang ?? "en";
  const c = CARD[lang] ?? CARD.en;
  const now = opts.now ?? new Date();

  const relative = isSlotToday(w, now)
    ? c.today
    : rodriguesDay(w.from) === rodriguesDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))
      ? c.tomorrow
      : null;
  const day = relative ?? c.onDay(slotDayWords(w.from, lang));
  const date = relative ? capitalise(slotDayWords(w.from, lang)) : null;
  const times = slotTimes(w);
  const [from = "", to = ""] = times.split("–");

  let headline: string;
  const lines: string[] = [];
  if (opts.fulfillment === "rr_delivery") {
    headline = c.delivery(day);
    lines.push(c.handsToDriver(from, to));
  } else if (opts.fulfillment === "customer_delivery") {
    headline = c.forDriver(day, times);
    lines.push(c.driverCollects(opts.storeName));
  } else {
    headline = c.collect(day, times);
    lines.push(c.at(opts.storeName));
  }

  // Still waiting for the cook. "Pending payment" is what the status line says
  // about a booked cash order for the day or two before it is cooked; this is
  // the sentence that makes that status not alarming.
  const waiting = opts.status == null || opts.status === "pending_payment";
  // Only while the cash is still owed. /admin/food's "Confirm payment" moves a
  // cash booking to 'paid' at the handover, and a card that then still said
  // "Pay in cash when you collect" asked for the money twice.
  if (opts.provider === "cash" && waiting) {
    lines.push(isDelivery(opts.fulfillment) ? c.payCashDelivery : c.payCash);
  } else if (opts.provider === "bank_transfer" && waiting) {
    lines.push(c.payTransfer);
  }
  if (waiting) lines.push(c.cookOnTheDay);

  return { eyebrow: c.eyebrow, headline: capitalise(headline), date, lines };
}

/** The slot card is for an order still to be handed over — never a finished one. */
export function slotCardApplies(status: string | null | undefined): boolean {
  return status !== "collected" && status !== "cancelled" && status !== "refunded";
}
