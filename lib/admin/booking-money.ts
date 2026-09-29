// ── WHAT THE ADMIN DESK SAYS ABOUT A BOOKING'S MONEY (M220) ─────────────────
//
// lib/bookings/in-person.ts owns the arithmetic (total, paid, balance, cash to
// collect). This file owns how the owner's desk READS it: which badge a card
// wears, which figure is honestly "to collect", which buttons may appear, which
// filter pill a row falls under, and what the WhatsApp reminder asks for.
//
// Pure, so the rules are pinned by tests rather than eyeballed on a card. The
// rentals desk, the Stay & Activity desk, the dashboard agenda and the revenue
// cards all ask here — one reading, so "To collect Rs 5,152" on the card and
// "Please bring Rs 5,152" in the reminder cannot disagree.
//
// MONEY IS WHOLE RUPEES throughout: both booking tables store rupees.

import {
  amountPaidRupees,
  balanceRupees,
  bookingTotalRupees,
  cashOverdue,
  cashToCollect,
  isPayInPerson,
  rupees,
  type BookingKind,
  type MoneyRow,
} from "@/lib/bookings/in-person";
import { vehicleName } from "@/lib/vehicle-slug";

/** A booking row as the desk holds it: the money columns plus what it shows. */
export type DeskRow = MoneyRow & {
  end_date?: string | null;
  deposit_paid_at?: string | null;
};

const LIVE = new Set(["confirmed", "completed"]);

/** The island's calendar date (Rodrigues is UTC+4, no DST), YYYY-MM-DD. */
export function islandToday(now: number = Date.now(), offsetDays = 0): string {
  return new Date(now + 4 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** Midnight at the start of an island day, as a UTC instant for a timestamptz filter. */
export function islandDayStartUtc(day: string): string {
  return new Date(`${day}T00:00:00+04:00`).toISOString();
}

/**
 * What is still to be collected at the handover, in rupees — or null when it
 * cannot honestly be said.
 *
 *  · confirmed PAYS IN PERSON → the balance (cashToCollect, the shared rule);
 *  · confirmed with part of it recorded as paid (an online deposit) → the
 *    balance, which is also collected at pickup;
 *  · confirmed with NOTHING recorded and not in person → null. That is the old
 *    "Confirmed" pill, which means "the bank transfer arrived" but never wrote
 *    an amount. Printing the whole price as "to collect" would send the owner
 *    to ask a customer who has paid to pay again.
 */
export function owedAtHandover(kind: BookingKind, row: DeskRow): number | null {
  const cash = cashToCollect(kind, row);
  if (cash !== null) return cash;
  if (!LIVE.has(String(row.status ?? ""))) return null;
  if (amountPaidRupees(row) > 0) return balanceRupees(kind, row);
  return null;
}

export type PaymentBadge = "in_person" | "paid" | "part_paid" | "unpaid" | "unrecorded" | "no_show";

/** The owner's words for each badge, and how loud it should be. */
export const BADGE_TEXT: Record<PaymentBadge, { label: string; tone: "good" | "cash" | "warn" | "muted" | "bad" }> = {
  in_person: { label: "Pays in person", tone: "cash" },
  paid: { label: "Paid", tone: "good" },
  part_paid: { label: "Part-paid", tone: "warn" },
  unpaid: { label: "Unpaid", tone: "muted" },
  // Confirmed through the old pill: a transfer arrived, its amount was never written.
  unrecorded: { label: "Paid — amount not recorded", tone: "muted" },
  no_show: { label: "No-show", tone: "bad" },
};

export type MoneyStrip = {
  total: number | null;
  paid: number;
  /** null = do not print a "to collect" figure (unknown, or nothing is owed). */
  toCollect: number | null;
  badge: PaymentBadge | null;
  /** "Cash received" may be offered. */
  canRecordPayment: boolean;
  /** "No-show" may be offered. */
  canMarkNoShow: boolean;
  /** The day has come and the money is still not recorded. */
  overdue: boolean;
};

/** Everything the payment strip on a desk card needs, from the row alone. */
export function moneyStrip(kind: BookingKind, row: DeskRow, today: string): MoneyStrip {
  const status = String(row.status ?? "");
  const total = bookingTotalRupees(kind, row);
  const paid = amountPaidRupees(row);
  const inPerson = isPayInPerson(row);
  const toCollect = owedAtHandover(kind, row);
  const over = status === "cancelled" || status === "unavailable";

  let badge: PaymentBadge | null;
  // Only while it IS cancelled: nothing clears no_show_at, so a no-show the
  // owner reinstates with the status pill must read as the booking it now is.
  if (row.no_show_at && over) badge = "no_show";
  else if (total !== null && paid >= total) badge = "paid";
  else if (over) badge = paid > 0 ? "part_paid" : null;
  else if (inPerson) badge = "in_person";
  else if (paid > 0) badge = "part_paid";
  else if (LIVE.has(status)) badge = "unrecorded";
  else badge = "unpaid";

  const started = !!row.start_date && row.start_date.slice(0, 10) <= today;

  return {
    total,
    paid,
    toCollect: over ? null : toCollect,
    badge,
    // A live pay-in-person booking with NO price on it (a request-only
    // listing, a very old rental) still takes cash. admin_record_booking_payment
    // has no ceiling when the total is null, so neither does the form — the
    // confirm step says the figure back before anything is written.
    canRecordPayment: LIVE.has(status) && ((toCollect ?? 0) > 0 || (inPerson && total === null)),
    // Only for a promise to pay in person: an online-paid no-show is a refund
    // question, which is not what this button answers.
    canMarkNoShow: status === "confirmed" && inPerson && started,
    overdue: cashOverdue(kind, row, today),
  };
}

// ── Filters ──────────────────────────────────────────────────────────────────

/**
 * Does a row belong under a filter pill? "in_person" is the owner's cash book:
 * bookings he agreed to be paid in person that are still on (a no-show or a
 * cancellation has nothing left to collect).
 */
export function matchesDeskFilter(row: { status?: string | null; pay_in_person?: boolean | null }, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "in_person") {
    return row.pay_in_person === true && row.status !== "cancelled" && row.status !== "unavailable";
  }
  return row.status === filter;
}

/** How many rows each pill would show — the number printed on the pill. */
export function deskFilterCounts(
  rows: { status?: string | null; pay_in_person?: boolean | null }[],
  filters: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of filters) out[f] = rows.filter((r) => matchesDeskFilter(r, f)).length;
  return out;
}

// ── The revenue cards ────────────────────────────────────────────────────────

/**
 * "Est. Revenue" added up every confirmed total — money promised, not money
 * held — and counted a cash rental as revenue the moment it was confirmed.
 * Split in two: what has actually been recorded as received, and what is
 * still to collect at a handover (owedAtHandover, so a transfer with no
 * recorded amount is not counted as owed again).
 *
 * "Collected" is money that STAYED: confirmed and completed bookings, plus a
 * no-show (cancelled, but the cash taken is kept and nothing is refunded —
 * M220). Any other cancelled booking's amount_paid is money that was, or will
 * be, handed back, and counting it overstated the takings.
 */
export function revenueSplit(kind: BookingKind, rows: DeskRow[]): { collected: number; toCollect: number } {
  let collected = 0;
  let toCollect = 0;
  for (const r of rows) {
    if (LIVE.has(String(r.status ?? "")) || r.no_show_at) collected += amountPaidRupees(r);
    toCollect += owedAtHandover(kind, r) ?? 0;
  }
  return { collected, toCollect };
}

// ── The cash form ────────────────────────────────────────────────────────────

/**
 * Read what the owner typed into "Cash received: Rs __". Tolerates "Rs",
 * commas and spaces because that is how the figure is printed right above the
 * field; refuses decimals because the ledger is whole rupees.
 */
export function parseRupeesInput(raw: string): number | null {
  const s = raw.replace(/rs\.?/i, "").replace(/[\s,]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The amount, checked against what is still owed before anything is sent. */
export function checkCashAmount(
  raw: string,
  balance: number | null,
): { ok: true; amount: number } | { ok: false; error: string } {
  const amount = parseRupeesInput(raw);
  if (amount === null) return { ok: false, error: "Enter the amount in whole rupees, e.g. 2500." };
  if (balance !== null && amount > balance) {
    return { ok: false, error: `That is more than is owed — only ${rupees(balance)} is left to pay.` };
  }
  return { ok: true, amount };
}

/** "in cash" / "by MCB Juice" — the words the confirm step repeats back. */
export function methodPhrase(method: string, label: string): string {
  return method === "cash" ? "in cash" : `by ${label}`;
}

/** Whether the customer heard about it, in the words the desk shows. */
export function toldLine(reply: { emailed?: boolean | null; hasEmail?: boolean | null }): string {
  if (reply.emailed) return "Customer emailed.";
  if (reply.hasEmail) return "The email did not go out — phone them.";
  return "No email on file — phone them.";
}

/**
 * A failed "Cash received" whose outcome is NOT known: the connection dropped
 * (status 0) or the server fell over (5xx) — after admin_record_booking_payment
 * may already have committed. Saying "nothing was saved" there invites a second
 * press and a second ledger row for the same cash. A 4xx is a refusal that
 * happened before anything was written, and is said as such.
 */
export function paymentOutcomeUnknown(status: number): boolean {
  return status === 0 || status >= 500;
}

// ── The day the money changed hands (M222) ───────────────────────────────────
//
// admin_record_booking_payment stamped every payment now(). The rentals the
// M220 backfill put on the cash list were paid in August and September;
// recording them on 29 Sept emailed receipts "received on 29 September" and
// put weeks-old cash in "payments recorded today". The form now asks the day.

/** A real calendar date written YYYY-MM-DD (so 2026-02-30 is refused). */
export function isIslandDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === day;
}

/**
 * The date field's first value: the booking's start day once it has passed
 * (the backfilled cash was handed over at pickup), otherwise today.
 */
export function cashDateDefault(startDate: string | null | undefined, today: string): string {
  const start = (startDate ?? "").slice(0, 10);
  return isIslandDay(start) && start < today ? start : today;
}

/**
 * Older than this, the receipt is off unless the owner ticks it: an email
 * saying "received" weeks after the customer has gone home is more likely to
 * alarm them than reassure them, so sending one is his deliberate choice.
 */
export const LATE_RECEIPT_DAYS = 7;

export function receiptByDefault(day: string, today: string): boolean {
  if (!isIslandDay(day) || !isIslandDay(today)) return true;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
  return days <= LATE_RECEIPT_DAYS;
}

/**
 * The instant stored for money received on an island day: 12:00 on Rodrigues
 * (UTC+4), so the day reads the same wherever it is printed — but never later
 * than now, because the RPC refuses a payment dated in the future (M222).
 */
export function receivedAtFor(
  day: string,
  now: number = Date.now(),
): { ok: true; at: string } | { ok: false; error: string } {
  if (!isIslandDay(day)) return { ok: false, error: "Enter the day the money was received." };
  if (day > islandToday(now)) return { ok: false, error: "The payment date cannot be in the future." };
  const noon = Date.parse(`${day}T12:00:00+04:00`);
  return { ok: true, at: new Date(Math.min(noon, now)).toISOString() };
}

// ── Two confirmed bookings, one vehicle ──────────────────────────────────────

/** How many of a model can be out at once — counted exactly as isVehicleFree does (lib/availability.ts). */
export function fleetUnits(
  fleet: { id?: string; name?: string; units?: number; assets?: { active?: boolean }[] }[],
  idOrName: string,
): number {
  const item = fleet.find((f) => f.id === idOrName || f.name === idOrName);
  const active = (item?.assets ?? []).filter((a) => a.active !== false);
  return active.length > 0 ? active.length : Math.max(1, item?.units ?? 1);
}

/**
 * Confirmed bookings that hold the same ONE-unit vehicle on overlapping days,
 * as id → the other ids. A confirmed booking holds its vehicle
 * unconditionally (lib/holds.ts), so two of them on one car is a customer who
 * will arrive to nothing — RR-87E663 and RR-BEFCA8 were exactly that, both
 * confirmed with the old pill. Read from the rows the desk already has; days
 * are inclusive, as isVehicleFree counts them (a same-day return and pickup
 * is a clash on a one-unit vehicle). Without the fleet the unit count is
 * unknown, so nothing is flagged rather than every scooter.
 */
export function confirmedClashes(
  rows: { id: string; status?: string | null; scooter?: string | null; start_date?: string | null; end_date?: string | null }[],
  fleet: Parameters<typeof fleetUnits>[0] | undefined,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!fleet) return out;
  const byVehicle = new Map<string, { id: string; from: string; to: string }[]>();
  for (const r of rows) {
    if (r.status !== "confirmed" || !r.scooter || !r.start_date || !r.end_date) continue;
    const list = byVehicle.get(r.scooter) ?? [];
    list.push({ id: r.id, from: r.start_date.slice(0, 10), to: r.end_date.slice(0, 10) });
    byVehicle.set(r.scooter, list);
  }
  for (const [vehicle, list] of byVehicle) {
    if (list.length < 2 || fleetUnits(fleet, vehicle) !== 1) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.from <= b.to && b.from <= a.to) {
          out.set(a.id, [...(out.get(a.id) ?? []), b.id]);
          out.set(b.id, [...(out.get(b.id) ?? []), a.id]);
        }
      }
    }
  }
  return out;
}

// ── The agenda ───────────────────────────────────────────────────────────────

/**
 * The vehicle's NAME for a booking's `scooter` column. The column holds the
 * fleet id ("veh-1788973628068") because availability matches on it; nobody
 * should read that, least of all a customer in a WhatsApp message.
 */
export function fleetName(
  fleet: { id?: string; name?: string }[] | undefined,
  idOrName: string,
): string {
  const item = (fleet ?? []).find((f) => f.id === idOrName || f.name === idOrName);
  return item ? vehicleName(item) : idOrName;
}

/** Is this booking for a car (whose refundable security deposit is separate)? */
export function isCarBooking(
  fleet: { id?: string; name?: string; category?: string }[] | undefined,
  idOrName: string,
): boolean {
  const item = (fleet ?? []).find((f) => f.id === idOrName || f.name === idOrName);
  return item?.category === "car";
}

/**
 * The WhatsApp reminder the agenda card opens. The pickup wording used to say
 * "tomorrow" on the Deliver TODAY card too. For a booking paid in person it
 * now names the cash to bring — the figure the customer would otherwise learn
 * at the door, and the one the old reminders got wrong (M220).
 */
export function reminderText(
  when: "today" | "tomorrow" | "return",
  customer: string,
  vehicle: string,
  cashRupees: number | null,
): string {
  const bring = cashRupees && cashRupees > 0 ? ` Please bring ${rupees(cashRupees)} in cash.` : "";
  if (when === "return") {
    return `Hi ${customer}, reminder from Roule Rodrigues — your ${vehicle} is due back today.${bring} Thanks for riding with us! 💛`;
  }
  return `Hi ${customer}, friendly reminder from Roule Rodrigues — your ${vehicle} pickup is ${when}.${bring} See you soon! 🛵`;
}

/** A wa.me link, or null when there is no number to send it to. */
export function waHref(phone: string | null | undefined, text?: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ── The Money desk ───────────────────────────────────────────────────────────

export type CashRow = {
  kind: BookingKind;
  id: string;
  reference: string;
  customer: string;
  item: string | null;
  startDate: string | null;
  totalRupees: number | null;
  paidRupees: number;
  /** WHOLE RUPEES — never cents, unlike the transfers list's amountCents. */
  toCollectRupees: number;
  overdue: boolean;
  desk: string;
};

/** Overdue first (the day has passed and nothing is recorded), then soonest. */
export function sortCashRows(rows: CashRow[]): CashRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) || (a.startDate ?? "").localeCompare(b.startDate ?? ""),
  );
}

/** How many live in-person bookings have reached their day with money still owed. */
export function countUnrecordedCash(kind: BookingKind, rows: DeskRow[], today: string): number {
  return rows.filter((r) => cashOverdue(kind, r, today)).length;
}
