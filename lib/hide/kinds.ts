// ── WHAT A CUSTOMER CAN CLEAR FROM THEIR OWN LIST (M234) ────────────────────
//
// The five kinds of record /orders lists that live in the database with a
// customer behind them. Delivery requests are cleared separately, by M227's
// own marker table, because a guest can hold one without an account.
//
// Client-safe and pure: the button, the API route and the activity feed all
// read this one list, and lib/hide/kinds.test.ts pins it to the CHECK
// constraint in the M234 migration, so the two cannot drift.
//
// Clearing hides a FINISHED record from the customer's list and nowhere else.
// The record is never written to, the admin sees all of it, and Undo removes
// the marker. The database refuses anything still live.

export const HIDE_KINDS = ["order", "booking", "place_booking", "ride", "service_booking"] as const;
export type HideKind = (typeof HIDE_KINDS)[number];

export function isHideKind(x: unknown): x is HideKind {
  return typeof x === "string" && (HIDE_KINDS as readonly string[]).includes(x);
}

/** Why the database said no, as the set_my_item_hidden RPC reports it. */
export type HideRefusal = "signed_out" | "not_found" | "still_live";

/** What the customer reads when a clear is refused. EN and FR, like the rest
 *  of the account pages; Kreol follows the site's French fallback. */
export const HIDE_REFUSAL_COPY: Record<HideRefusal, { en: string; fr: string }> = {
  signed_out: {
    en: "Sign in to clear your history.",
    fr: "Connectez-vous pour effacer votre historique.",
  },
  not_found: {
    en: "That item could not be found on your account.",
    fr: "Cet élément est introuvable sur votre compte.",
  },
  still_live: {
    en: "This is still in progress, so it stays on your list until it is finished.",
    fr: "C’est toujours en cours : cela reste dans votre liste jusqu’à la fin.",
  },
};

/** The key a list uses to drop a cleared item: `${kind}:${id}`. */
export const hideKey = (kind: HideKind, id: string): string => `${kind}:${id}`;

/**
 * Which hide kind an activity row is, or null when it is cleared elsewhere.
 * A delivery request is cleared on /deliver by M227's own marker (a guest can
 * hold one without an account), so this list never offers it.
 */
export function hideKindForActivity(kind: string): HideKind | null {
  switch (kind) {
    case "vehicle": return "booking";
    case "place": return "place_booking";
    case "ride": return "ride";
    case "service": return "service_booking";
    case "order": return "order";
    default: return null;
  }
}

/** Order statuses that are over — the same list set_my_item_hidden accepts. */
export const FINISHED_ORDER_STATUSES = ["collected", "cancelled", "refunded"] as const;
