// ── The words the owner reads when a delivery stops moving ──────────────────
//
// ── WHY THIS IS A SEPARATE, PURE FILE ──────────────────────────────────────
// One array in sweep_delivery_escalations carried two opposite situations —
// "nobody took it and it is on the shop counter" and "a driver has it in his
// bag and has gone quiet" — so both came out of one sentence:
//
//     "No driver found. The customer is waiting. Assign someone or call them."
//
// For a package already in a driver's bag that is an instruction to do the one
// thing that cannot work, and admin_reassign_delivery raises RR091 to refuse
// it. The words ARE the product here, so they get a pure function and a test:
// give it facts, it gives you a message. No clock, no database, no network.
//
// The delivery board imports it too, so the WhatsApp alert and the page that
// alert links to cannot tell the owner opposite stories — which they did:
// the board rendered "A driver still has the package and has stopped
// responding" four lines above "No driver yet", and both fire when driverName
// is null.
//
// See M117.

export type DeliveryStallKind =
  /** Offers ran out. Nobody ever accepted. Nothing left the shop. */
  | "no_driver"
  /** A driver accepted and never collected. Still at the shop. */
  | "not_collected"
  /** A driver collected it and went quiet. It is in his bag. */
  | "package_with_driver";

export type DeliveryStallFacts = {
  kind: DeliveryStallKind;
  deliveryId: string;
  /** deliveries.reassignment_count — the only thing separating two alerts of
   *  the same kind about the same delivery. See dedupeKeyFor. */
  reassignments: number;
  orderNumber?: string | null;
  shop?: string | null;
  shopPhone?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  /** Whole minutes past when it should have been collected, or delivered. */
  minutesOverdue?: number | null;
  /** Whole minutes since the delivery was created. */
  minutesWaiting?: number | null;
};

export type DeliveryStallAlert = {
  /** notification_jobs.type — free text, so a new one needs no migration. It
   *  must still be new, or the admin notifications list shows two different
   *  events under one name. */
  type: string;
  dedupeKey: string;
  title: string;
  lines: string[];
};

const BOARD = "https://roulerodrig.com/admin/deliveries";

const PREFIX: Record<DeliveryStallKind, string> = {
  no_driver: "delivery:no-driver",
  not_collected: "delivery:not-collected",
  package_with_driver: "delivery:has-package",
};

const TYPE: Record<DeliveryStallKind, string> = {
  no_driver: "delivery_no_driver",
  not_collected: "delivery_not_collected",
  package_with_driver: "delivery_package_with_driver",
};

/** "1 hour 5 minutes" reads faster on a lock screen than "65 minutes". */
export function plainDuration(mins: number): string {
  const m = Math.max(1, Math.round(mins));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return rest === 0 ? hours : `${hours} ${rest} minute${rest === 1 ? "" : "s"}`;
}

/**
 * The key that decides whether a message is sent or silently thrown away.
 *
 * notification_jobs_dedupe_key is a UNIQUE index with NO time window and NO
 * status predicate, and enqueue_notification() swallows the collision with
 * `exception when unique_violation then null` — no error, no log line. A key is
 * therefore claimed for ever.
 *
 * Two facts have to be in it: WHICH situation (or the second kind about one
 * delivery is muted — which is exactly what used to happen to the alert saying
 * a driver had disappeared with the goods), and HOW MANY TIMES the delivery has
 * been handed on (or a genuine second occurrence is muted).
 */
export function dedupeKeyFor(
  kind: DeliveryStallKind,
  deliveryId: string,
  reassignments: number,
): string {
  const n = Math.max(0, Math.trunc(reassignments) || 0);
  return `${PREFIX[kind]}:${deliveryId}:${n}`;
}

/**
 * Every message leads with WHERE THE PACKAGE IS, because that single fact
 * decides what the owner does next. Internal vocabulary is banned outright —
 * the reader runs a scooter business, not a database.
 */
export function deliveryStallAlert(f: DeliveryStallFacts): DeliveryStallAlert {
  const ref = f.orderNumber ? `Order ${f.orderNumber}` : "A delivery";
  const shop = f.shop ?? "the shop";
  const driver = f.driverName ?? "The driver";
  const dedupeKey = dedupeKeyFor(f.kind, f.deliveryId, f.reassignments);

  if (f.kind === "package_with_driver") {
    return {
      type: TYPE.package_with_driver,
      dedupeKey,
      title: f.driverName ? `${f.driverName} has the package` : "The driver has the package",
      lines: [
        `${driver} collected ${ref} from ${shop} and has stopped answering.`,
        f.minutesOverdue
          ? `It is ${plainDuration(f.minutesOverdue)} past the time it should have arrived.`
          : null,
        "The package is with him, not at the shop.",
        f.driverPhone
          ? `Call him now: ${f.driverPhone}`
          : "Call him now — his number is on the deliveries page.",
        // The one sentence that stops the wrong move. Without it the owner
        // sends a second rider to a counter with nothing on it.
        "Do not send another driver to the shop. There is nothing there to collect.",
        BOARD,
      ].filter((l): l is string => Boolean(l)),
    };
  }

  if (f.kind === "not_collected") {
    return {
      type: TYPE.not_collected,
      dedupeKey,
      title: "Still at the shop — the driver never came",
      lines: [
        `${driver} took ${ref} but never collected it from ${shop}.`,
        f.minutesOverdue
          ? `That is ${plainDuration(f.minutesOverdue)} past the time it should have been collected.`
          : null,
        "Nothing was picked up — it is still on the shop counter.",
        f.driverPhone
          ? `Call him on ${f.driverPhone} to check, then give it to someone else.`
          : "Call him to check, then give it to someone else.",
        BOARD,
      ].filter((l): l is string => Boolean(l)),
    };
  }

  return {
    type: TYPE.no_driver,
    dedupeKey,
    title: "Still at the shop — nobody took it",
    lines: [
      `${ref} is waiting at ${shop}. No driver accepted it.`,
      f.minutesWaiting ? `It has been waiting ${plainDuration(f.minutesWaiting)}.` : null,
      "Nothing was collected — it is still on the shop counter.",
      "Send it out to drivers again from the deliveries page, or find someone yourself.",
      f.shopPhone ? `Shop: ${f.shopPhone}` : null,
      BOARD,
    ].filter((l): l is string => Boolean(l)),
  };
}

/**
 * The one line the delivery board shows for a row that needs attention.
 *
 * Same facts and the same rule as the alert above, deliberately: the alert's
 * last line links here, and before this the page said the opposite. Branching
 * on `status === "requires_admin"` alone rendered "A driver still has the
 * package and has stopped responding" for a package no driver ever touched —
 * four lines above "No driver yet", and `?? "A driver"` fires exactly when
 * that other line prints. driverId is what actually separates the two.
 */
export function stallBoardLine(row: {
  status: string;
  driverId: string | null;
  driverName: string | null;
  storeName: string;
  lateBy: number;
  unclaimedFor: number;
  offersOut: number;
}): string {
  if (row.status === "requires_admin" && row.driverId) {
    return `${row.driverName ?? "The driver"} has the package and has stopped answering. Don't send anyone to the shop.`;
  }
  if (row.status === "requires_admin") {
    return `Nobody took it. It is still at ${row.storeName}.`;
  }
  if (row.status === "driver_unresponsive") {
    return `${row.driverName ?? "The driver"} took it but never collected it. It is still at ${row.storeName}.`;
  }
  if (row.lateBy > 0) return `${row.lateBy} minutes past due.`;
  return `No driver has taken it for ${row.unclaimedFor} minutes (${row.offersOut} offers out).`;
}
