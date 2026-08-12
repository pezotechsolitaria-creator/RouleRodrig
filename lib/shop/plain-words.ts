import { RODRIGUES_TZ, nowInRodrigues, hhmm } from "@/lib/schedule";

// ── The words a shop card says, written for someone who is not in a hurry ────
//
// The owner, after testing: "very difficult to use as a seller and customer …
// it will be exposed to ELDERS. If youngster like me find it difficult, elders
// will find it extremely difficult."
//
// Three specific things the marketplace was saying, and what was wrong with
// each. None of them is a bug in the logic — every one is a bug in the wording,
// which is the harder kind to see because the tests all pass.
//
// 1. "Opens 08:00" at 17:12, when the shop shut at 17:00 and reopens TOMORROW.
//    Literally true (its opening time IS 08:00) and completely misleading. The
//    database already computes next_open_at; the card was rendering opens_at.
//
// 2. "Not taking orders yet" — this means the merchant has no active
//    subscription. That is the platform's business model leaking onto a
//    customer's screen. The customer needs to know they cannot order here, not
//    why the platform will not let them.
//
// 3. "Your own driver" — for a shop that will hand the parcel to someone the
//    customer sends. Read cold, it sounds like a requirement to own a driver.
//
// Kept pure and separate so the wording can be tested without a browser, and so
// there is one place to change it when the owner hears something better in
// Creole.

export type ShopStatusWords = {
  /** Short badge, e.g. "Open now" · "Opens tomorrow 08:00" · "Closed today". */
  badge: string;
  tone: "open" | "closed" | "unknown";
};

export type ShopScheduleFacts = {
  hasSchedule: boolean;
  isOpen: boolean;
  isClosedToday: boolean;
  opensAt: string | null;
  closesAt: string | null;
  /** ISO instant of the next opening, from store_schedule_at(). */
  nextOpenAt: string | null;
};

/**
 * When this shop is next open, said the way a person would say it.
 *
 * "today", "tomorrow" and a weekday name are three different pieces of news;
 * collapsing them into a bare time is what made a closed shop look open.
 */
export function statusWords(s: ShopScheduleFacts, now: Date = nowInRodrigues()): ShopStatusWords {
  // A shop that never set hours gets no claim made about it. Guessing "open"
  // sends someone on a drive across the island for nothing.
  if (!s.hasSchedule) return { badge: "", tone: "unknown" };
  if (s.isOpen) {
    const until = hhmm(s.closesAt);
    return { badge: until ? `Open until ${until}` : "Open now", tone: "open" };
  }

  const when = s.nextOpenAt ? new Date(s.nextOpenAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return { badge: s.isClosedToday ? "Closed today" : "Closed", tone: "closed" };
  }

  const dayOf = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: RODRIGUES_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: RODRIGUES_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(when);

  const today = dayOf(now);
  const target = dayOf(when);
  if (target === today) return { badge: `Opens at ${time}`, tone: "closed" };

  // One calendar day ahead is "tomorrow" — not "Thursday", which makes the
  // reader count days.
  const tomorrow = dayOf(new Date(now.getTime() + 86_400_000));
  if (target === tomorrow) return { badge: `Opens tomorrow ${time}`, tone: "closed" };

  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: RODRIGUES_TZ, weekday: "long" }).format(when);
  return { badge: `Opens ${weekday} ${time}`, tone: "closed" };
}

export type FulfilmentFacts = {
  offersPickup: boolean;
  offersRrDelivery: boolean;
  offersOwnDelivery: boolean;
  acceptsCash: boolean;
  acceptsBankTransfer: boolean;
};

/**
 * How you get it and how you pay, in words that survive being read once.
 *
 * Order matters: how the goods reach you first, money second. That is the
 * order the questions arrive in.
 */
export function fulfilmentWords(f: FulfilmentFacts): string[] {
  const out: string[] = [];
  if (f.offersPickup) out.push(FULFILMENT.pickup.chip);
  if (f.offersRrDelivery) out.push(FULFILMENT.rr_delivery.chip);
  if (f.offersOwnDelivery) out.push(FULFILMENT.customer_delivery.chip);
  if (f.acceptsCash) out.push("Pay cash");
  if (f.acceptsBankTransfer) out.push("Bank transfer");
  return out;
}

/**
 * What to say about a shop that is listed but cannot take an order.
 *
 * `acceptingOrders` is store_subscription_active() — a billing fact. The
 * customer gets the consequence, never the cause.
 */
export function notSellingNote(acceptingOrders: boolean): string {
  return acceptingOrders ? "" : "Not selling online yet";
}

// ── ONE set of words for pickup-or-delivery, used everywhere ─────────────────
//
// A customer met this same choice up to four times with different wording each
// time. Browsing food: "Pick up" / "Delivery". Filtering shops: "Delivery" /
// "Pickup". On a shop card: "Pickup" / "Delivery" / "Your own driver". At
// checkout: "Pickup" / "My own delivery" / "Roulé Rodrigues delivery".
//
// "Your own driver" and "My own delivery" are the same option under two names,
// and neither says what actually happens. Somebody who has already hesitated
// once now has to work out whether these are the same three choices they saw a
// screen ago — and for an elderly customer that hesitation is where the order
// ends.
//
// So: one definition. Every surface imports from here. If a word turns out to be
// wrong in Creole, it changes once.

export type FulfilmentKind = "pickup" | "customer_delivery" | "rr_delivery";

export const FULFILMENT: Record<FulfilmentKind, { label: string; hint: string; chip: string }> = {
  pickup: {
    label: "I'll collect it myself",
    hint: "Go to the shop and pick it up. Nothing extra to pay.",
    chip: "Collect in person",
  },
  customer_delivery: {
    label: "Someone will collect it for me",
    hint: "You send a friend, a taxi or your own driver. Nothing extra to pay.",
    chip: "Send someone to collect",
  },
  rr_delivery: {
    label: "Roulé Rodrigues delivers it",
    hint: "We bring it to you. The fee depends on where you are.",
    chip: "Delivered to you",
  },
};

/** The short chip for a card or a filter — never the long label. */
export function fulfilmentChip(kind: FulfilmentKind): string {
  return FULFILMENT[kind].chip;
}
