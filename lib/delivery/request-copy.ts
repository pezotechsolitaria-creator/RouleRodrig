import { centsToShortString } from "@/lib/money";

// ── Every message the Deliver Anything loop sends ───────────────────────────
//
// Pure, so the wording is pinned by tests rather than by whoever last edited a
// route. Three audiences, three moments:
//
//   1. A job is on the board          → every eligible driver
//   2. A price has arrived            → the customer
//   3. A driver has been chosen       → that driver
//
// ── The address rule ───────────────────────────────────────────────────────
// The owner's standing instruction is that the ADDRESS GOES IN EVERY DRIVER
// MESSAGE, including the one sent before anybody has committed. The trade-off
// was raised and decided: a driver on this island cannot price a job without
// knowing where it starts and ends, and a village name is not a doorstep.
// lib/delivery/offer-copy.ts records the same decision for store orders — this
// module follows it rather than re-opening it.

export type RequestFacts = {
  id: string;
  kind: string;
  what: string;
  sizeClass: string;
  pickupText: string;
  pickupNote?: string | null;
  dropoffText: string;
  dropoffNote?: string | null;
  spendCap?: number | null;
  contactName?: string | null;
  quoteCount?: number;
};

function rs(cents: number): string {
  return `Rs ${centsToShortString(cents)}`;
}

/** "Fatima Bay — blue gate, first floor" — the place and how to find it, as one
 *  line, because two lines on a lock screen is one line nobody sees. */
function place(text: string, note?: string | null): string {
  const n = (note ?? "").trim();
  return n ? `${text.trim()} — ${n}` : text.trim();
}

// ── 1. A job is on the board ────────────────────────────────────────────────

/**
 * What a driver is told about a job they could quote on.
 *
 * Says explicitly that this is a QUOTE, not an assignment. Every other message
 * a delivery driver gets from this system is a job that is already theirs if
 * they tap fast enough, so a board post that does not say otherwise will be
 * read as one — and a driver who thinks they have lost a race they were never
 * in stops opening the next one.
 */
export function newRequestTitle(f: RequestFacts): string {
  return f.kind === "shop_and_deliver"
    ? "New shopping run — name your price"
    : "New delivery — name your price";
}

export function newRequestLines(f: RequestFacts): string[] {
  const lines = [
    f.what.trim(),
    `Collect: ${place(f.pickupText, f.pickupNote)}`,
    `Deliver: ${place(f.dropoffText, f.dropoffNote)}`,
  ];

  if (f.kind === "shop_and_deliver" && f.spendCap) {
    // The two numbers, kept apart. A driver who reads the shopping cap as their
    // fee will quote against the wrong figure and lose money on the job.
    lines.push(`They will repay what you spend, up to ${rs(f.spendCap)}. Your fee is separate.`);
  }
  if (f.sizeClass === "large") {
    lines.push("Large item — car or van needed.");
  }
  if (f.quoteCount && f.quoteCount > 0) {
    lines.push(
      f.quoteCount === 1
        ? "1 driver has already quoted."
        : `${f.quoteCount} drivers have already quoted.`,
    );
  }
  return lines;
}

export function newRequestAction(driverUrl: string): string {
  return `Open your jobs to quote: ${driverUrl}`;
}

// ── 2. A price has arrived ──────────────────────────────────────────────────

/**
 * What the customer is told when a driver quotes.
 *
 * The entire message exists to carry ONE fact: nobody is coming until they
 * choose. This is the moment the quote model diverges hardest from every other
 * order on the site, and a customer who misreads it sits waiting for a driver
 * who was never dispatched.
 */
export function quoteArrivedTitle(input: { fee: number; quoteCount: number }): string {
  return input.quoteCount > 1
    ? `A new price for your delivery: ${rs(input.fee)}`
    : `You have a price: ${rs(input.fee)}`;
}

export function quoteArrivedLines(input: {
  fee: number;
  driverName: string;
  vehicleType?: string | null;
  note?: string | null;
  what: string;
  quoteCount: number;
}): string[] {
  const vehicle = (input.vehicleType ?? "").trim();
  const lines = [
    `${input.driverName}${vehicle ? ` (${vehicle})` : ""} will do it for ${rs(input.fee)}.`,
    `For: ${input.what.trim()}`,
  ];
  if (input.note?.trim()) lines.push(`They said: ${input.note.trim()}`);
  if (input.quoteCount > 1) {
    lines.push(`You now have ${input.quoteCount} prices to compare.`);
  }
  // Last, and unconditional. If one line of this message survives the lock
  // screen, it has to be this one.
  lines.push("Nobody is on the way until you choose a price.");
  return lines;
}

export function quoteArrivedAction(url: string): string {
  return `See your prices and book: ${url}`;
}

// ── 3. A driver has been chosen ─────────────────────────────────────────────

/**
 * What the winning driver is told.
 *
 * This one is an instruction, not an offer — the job is already theirs and the
 * customer is expecting them. It carries the customer's phone and both
 * addresses because the driver is about to set off, and everything they need
 * has to be in the message rather than behind a tap on a bad signal.
 */
export function quoteAcceptedTitle(input: { fee: number }): string {
  return `Your price was accepted — ${rs(input.fee)}`;
}

export function quoteAcceptedLines(input: {
  fee: number;
  request: RequestFacts;
  contactPhone?: string | null;
  pin?: string | null;
}): string[] {
  const f = input.request;
  const lines = [
    f.what.trim(),
    `Collect: ${place(f.pickupText, f.pickupNote)}`,
    `Deliver: ${place(f.dropoffText, f.dropoffNote)}`,
  ];
  if (f.contactName || input.contactPhone) {
    lines.push(`Customer: ${[f.contactName, input.contactPhone].filter(Boolean).join(" · ")}`);
  }

  if (f.kind === "shop_and_deliver" && f.spendCap) {
    lines.push(
      `Buy it first. They repay what you spend, up to ${rs(f.spendCap)} — keep the receipt.`,
    );
    lines.push(`Collect at the door: ${rs(input.fee)} for you, plus what you spent.`);
  } else {
    lines.push(`Collect at the door: ${rs(input.fee)}.`);
  }

  // Never the PIN itself. The code is the customer's proof that the right
  // person turned up, and a driver who already knows it is a driver who can
  // close a delivery they never made.
  lines.push("They will read you a 4-digit code when you hand it over.");
  return lines;
}

export function quoteAcceptedAction(driverUrl: string): string {
  return `Open the job: ${driverUrl}`;
}

// ── 4. The customer changed their mind ──────────────────────────────────────

/**
 * What the driver is told when a customer cancels before pickup.
 *
 * Written to be read by somebody who may already be on the road. It leads with
 * the fact that the job is off — that is the only thing they need in the first
 * two seconds — and it says explicitly that this is not held against them,
 * because a driver who thinks a cancellation dents their standing is a driver
 * who stops accepting the marginal job.
 */
export function cancelledTitle(input: { what: string }): string {
  return `Cancelled: ${input.what.trim()}`;
}

export function cancelledLines(input: {
  pickupText: string;
  dropoffText: string;
  contactName?: string | null;
  reason?: string | null;
}): string[] {
  const lines = [
    "The customer cancelled this one before pickup. Do not collect it.",
    `Was: ${input.pickupText.trim()} to ${input.dropoffText.trim()}`,
  ];
  if (input.reason?.trim()) lines.push(`They said: ${input.reason.trim()}`);
  // The sentence that keeps a driver taking work. driver_cancellations is
  // deliberately not incremented for this, and saying so out loud is the only
  // way they would ever know.
  lines.push("This does not count against you. You are free for the next job.");
  return lines;
}

// ── 5. The drivers who did not win ──────────────────────────────────────────

/**
 * What a driver is told when somebody else got the job, or the customer pulled
 * it.
 *
 * A driver who quotes and then hears NOTHING learns that the board is a waste
 * of their attention, and stops opening it. That is the quiet way a reverse
 * auction dies: not with a complaint, but with fewer prices every week.
 *
 * The winning fee is deliberately NOT included. Telling somebody they lost by
 * Rs 30 invites a race to the bottom, and this island has few enough drivers
 * that a price war costs everybody. They are told THAT they lost, not by how
 * much.
 */
export function lostQuoteTitle(input: { outcome: string }): string {
  return input.outcome === "cancelled" ? "Request withdrawn" : "Somebody else got that one";
}

export function lostQuoteLines(input: {
  what: string;
  pickupText: string;
  dropoffText: string;
  outcome: string;
}): string[] {
  const where = `${input.pickupText.trim()} to ${input.dropoffText.trim()}`;
  return input.outcome === "cancelled"
    ? [
        `The customer withdrew this one: ${input.what.trim()}`,
        `Was: ${where}`,
        "Your price is closed. Nothing to do.",
      ]
    : [
        `The customer chose another driver for: ${input.what.trim()}`,
        `Was: ${where}`,
        // Says the thing that keeps them bidding.
        "Your price is closed. Nothing to do — there will be more on the board.",
      ];
}
