// ── WHAT WE SAY TO THE PERSON WHO IS WAITING ────────────────────────────────
//
// On 6 September a guest posted a delivery, was quoted Rs 25, accepted it at
// 22:30, and then nobody came. Every one of the nine notifications that job
// produced went to the OWNER's WhatsApp and ntfy. She was told nothing — not
// that it had stalled, not that it had been closed, not ever. She had given us
// an email address and we never used it.
//
// The owner has always been told when a job stalls. This is the half that did
// not exist: the customer.
//
// ── THE RULES THESE STRINGS FOLLOW ────────────────────────────────────────
//
// · Say what happened in the first line, in plain words. Not a status name —
//   "requires_admin" means nothing to somebody standing by a door.
// · Never leave them without a next step. "We are sorry" alone is worse than
//   silence because it closes the conversation without opening a door.
// · Never blame the driver by name to the customer. They cannot act on it and
//   it invites a fight we are not there to referee.
// · Never include the PIN. These go to an inbox and a lock screen, and the PIN
//   is what proves the goods reached the right person.
// · Money in MINOR UNITS at the boundary — this platform has shipped a
//   rupees-for-cents bug twice.

import { centsToDecimalString } from "@/lib/money";

/** Why a booked job stopped. The customer-facing split is coarser than the
 *  owner's: they do not need our internal reason codes, only whether their
 *  goods are involved and whether anybody is still looking. */
export type CustomerProblemKind =
  /** Nobody ever collected it. Nothing of theirs has moved. */
  | "not_collected"
  /** A driver has their goods and stopped. This is the frightening one. */
  | "package_with_driver"
  /** Nobody took the job at all. */
  | "no_driver";

export type CustomerCopy = { title: string; lines: string[] };

/** A booked delivery has stopped moving and a human has to restart it. */
export function deliveryStalledCopy(f: {
  what: string | null;
  dropoff: string | null;
  kind: CustomerProblemKind;
}): CustomerCopy {
  const item = f.what?.trim() || "your delivery";
  const where = f.dropoff?.trim();

  if (f.kind === "package_with_driver") {
    return {
      title: `We have stopped the clock on ${item}`,
      lines: [
        "The driver collected it but has not completed the drop-off, so we have paused the job and a person here is now on it.",
        where ? `It was going to ${where}.` : null,
        "Nothing more is owed until it is delivered or returned. We will tell you which, today.",
      ].filter((l): l is string => Boolean(l)),
    };
  }

  if (f.kind === "not_collected") {
    return {
      title: `Nobody has collected ${item} yet`,
      lines: [
        "A driver accepted your job and has not picked it up. Nothing of yours has moved.",
        "We are finding somebody else. You do not need to do anything, and you have not been charged.",
      ],
    };
  }

  return {
    title: `We have not found a driver for ${item}`,
    lines: [
      "Nobody has taken the job yet, so nothing has been collected and you have not been charged.",
      "We are still asking drivers. If you would rather not wait, you can cancel from your request page.",
    ],
  };
}

/** The job is over without being delivered. */
export function deliveryClosedCopy(f: {
  what: string | null;
  reason: string | null;
}): CustomerCopy {
  const item = f.what?.trim() || "your delivery";
  return {
    title: `${item} has been closed`,
    lines: [
      f.reason?.trim() ||
        "We could not complete this one, so we have closed it rather than leave you waiting.",
      "You have not been charged. If you still need it done, post it again and we will put it back in front of the drivers.",
    ],
  };
}

/**
 * Their request ran out of time with a price sitting on it.
 *
 * The one case where the customer did everything except the last step. Said
 * plainly, because the honest reading is usually that they never saw it.
 */
export function requestExpiredCopy(f: {
  what: string | null;
  bestFeeCents: number | null;
}): CustomerCopy {
  const item = f.what?.trim() || "your delivery";
  const price =
    f.bestFeeCents === null || f.bestFeeCents === undefined
      ? null
      : `Rs ${centsToDecimalString(f.bestFeeCents)}`;
  return {
    title: `${item} closed before you chose a driver`,
    lines: [
      price
        ? `You had a price of ${price} waiting, and the request ran out of time before it was accepted.`
        : "You had a price waiting, and the request ran out of time before it was accepted.",
      "Nothing was collected and you have not been charged.",
      "If you still need it, posting it again takes a moment and the same drivers will see it.",
    ],
  };
}
