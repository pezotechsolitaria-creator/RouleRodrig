// ── The three shapes a Deliver Anything request can take ────────────────────
//
// This module exists because of how the third one nearly shipped broken.
//
// For a long time there were two: collect something that already exists
// (`package`), and buy something first, then bring it (`shop_and_deliver`).
// Two things invite a ternary, and every consumer wrote one:
//
//     kind === "shop_and_deliver" ? "Buy & deliver" : "Collect & deliver"
//
// That is correct for two kinds and SILENTLY WRONG for three. Adding `errand`
// would not have crashed anything, produced a type error, or failed a test —
// it would have quietly labelled every "Do it for me" job as "Collect &
// deliver" on the driver board, the admin desk, the customer's tracker and the
// push notification. A driver would have been sent to collect a parcel that
// does not exist.
//
// So the labels live in `Record<RequestKind, …>` maps instead. A record with a
// missing key is a COMPILE ERROR, which means the next person to add a fourth
// kind is told by tsc exactly which screens they have not thought about. The
// type is doing the work a test would have had to remember to do.

/** Every kind, in the order a customer meets them. */
export const REQUEST_KINDS = ["package", "shop_and_deliver", "errand"] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

export function isRequestKind(v: unknown): v is RequestKind {
  return typeof v === "string" && (REQUEST_KINDS as readonly string[]).includes(v);
}

/**
 * Anything arriving from the database, widened to a kind we can render.
 *
 * The column is `text`, so a row written by a future migration — or by hand at
 * the SQL prompt — can hold something this build has never heard of. Falling
 * back to `package` is deliberate: it is the least-promising of the three, so
 * an unknown kind degrades into "somebody moves a thing", never into "somebody
 * spends your money".
 */
export function toRequestKind(v: unknown): RequestKind {
  return isRequestKind(v) ? v : "package";
}

/**
 * The operator-facing name. English only, and on purpose — the driver board
 * and the admin desk are worked by people who chose this platform's back
 * office, while the three-language copy lives in copy.i18n.ts for the surfaces
 * a customer sees.
 */
export const KIND_LABEL: Record<RequestKind, string> = {
  package: "Collect & deliver",
  shop_and_deliver: "Buy & deliver",
  errand: "Do it for me",
};

/** One line of what the job actually asks of the person doing it. */
export const KIND_BLURB: Record<RequestKind, string> = {
  package: "Collect it from one place and take it to another.",
  shop_and_deliver: "Buy it first, then bring it.",
  errand: "Go and get something done, then report back.",
};

// ── The money rule, mirrored from the database ──────────────────────────────
//
// `delivery_requests_budget_shape` is the authority. This is the same rule in
// a form the UI can ask questions about, and the reason it is not a boolean:
// an errand is the one kind where a spending limit is genuinely OPTIONAL.
// Paying a CEB bill needs a ceiling; queuing at the bank does not. A boolean
// would have forced one of those two to be a lie.
export type BudgetRule = "forbidden" | "required" | "optional";

export const BUDGET_RULE: Record<RequestKind, BudgetRule> = {
  package: "forbidden",
  shop_and_deliver: "required",
  errand: "optional",
};

/**
 * Whether the person doing this job may end up spending their OWN money and
 * being repaid at the door.
 *
 * This is the fact that changes what a driver is owed, so it is asked as a
 * question about the job rather than re-derived from the kind at each of the
 * six places that need it.
 */
/**
 * What the two ends of the job are called on a driver's board.
 *
 * "Collect / Deliver" is right for a parcel and actively misleading for an
 * errand, where the first leg is a place to GO and the second is where to
 * bring whatever comes back — a receipt, a refilled bottle, or just the news.
 */
export const LEG_LABEL: Record<RequestKind, { pickup: string; dropoff: string }> = {
  package: { pickup: "Collect", dropoff: "Deliver" },
  shop_and_deliver: { pickup: "Buy at", dropoff: "Deliver" },
  errand: { pickup: "Go to", dropoff: "Bring back to" },
};

// ── What an errand actually is ─────────────────────────────────────────────
//
// The owner, on the first cut: "do it for me should not have things like
// parcel, hot food, fragile, heavy, bigger than cars — because it is not
// delivering something, it should have its own stuffs."
//
// Right, and the reason is structural rather than cosmetic. `cargo_kind` and
// `size_class` answer "what is being CARRIED", which is the only thing that
// decides which vehicles may take a job. An errand frequently carries nothing:
// paying a bill brings back a receipt in a pocket. Asking whether that is hot
// food, fragile, or bigger than a car is asking about an object that does not
// exist, and every answer is a lie the fleet filter then acts on.
//
// So an errand answers its own question, and it is stored in its own column.
export const ERRAND_KINDS = ["pay_bill", "queue", "collect", "gas", "other"] as const;

export type ErrandKind = (typeof ERRAND_KINDS)[number];

export function isErrandKind(v: unknown): v is ErrandKind {
  return typeof v === "string" && (ERRAND_KINDS as readonly string[]).includes(v);
}

/** Operator-facing English, for the driver board and the owner's desk. */
export const ERRAND_LABEL: Record<ErrandKind, string> = {
  pay_bill: "Pay a bill",
  queue: "Queue or wait",
  collect: "Collect something ready",
  gas: "Gas bottle refill",
  other: "Something else",
};

/**
 * The errand's answer, translated into the two columns the fleet filter reads.
 *
 * Almost every errand is `standard` / `general` — nothing is carried, so no
 * vehicle is excluded and the widest possible set of people can quote. The one
 * real exception is a gas bottle, which this platform already classifies as
 * `heavy` for ordinary deliveries (see the "Heavy — gas bottle, cement, tools"
 * choice on the parcel side). Classing it any other way here would mean the
 * same object had two different fleet rules depending on which card somebody
 * tapped first.
 *
 * `large` is deliberately unreachable: an errand does not move furniture. That
 * is what Collect & deliver is for, and offering it here would produce jobs no
 * errand runner could actually do.
 */
export function errandToColumns(errand: ErrandKind): {
  sizeClass: "standard";
  cargoKind: "general" | "heavy";
} {
  return {
    sizeClass: "standard",
    cargoKind: errand === "gas" ? "heavy" : "general",
  };
}

export function mayLayOutMoney(
  kind: RequestKind,
  spendCap?: number | null,
): spendCap is number {
  return BUDGET_RULE[kind] !== "forbidden" && (spendCap ?? 0) > 0;
}
