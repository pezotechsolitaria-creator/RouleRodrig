// ── REMOVING A KITCHEN: THE TWO HONEST OPTIONS ──────────────────────────────
//
// The owner asked to delete permanently rather than archive, and to have that
// choice even for a real customer's kitchen. So the screen stops deciding for
// them and starts telling them the truth about each option:
//
//   HIDE   — the kitchen vanishes from every customer surface. Reversible.
//            Orders, receipts and the money record all survive.
//   DELETE — the kitchen, its dishes, its orders and its payments are gone.
//            Not reversible. A summary of the money is kept in the audit log.
//
// This module is pure on purpose: it takes the numbers the database reports and
// turns them into the sentences the operator reads. No fetching, no database, so
// the wording — the part that actually decides whether somebody presses the red
// button by mistake — can be tested.

export type KitchenDeletePreview = {
  id: string;
  name: string;
  status: string;
  hidden: boolean;
  dishes: number;
  orders: number;
  orders_in_flight: number;
  orders_finished: number;
  active_deliveries: number;
  reviews: number;
  money_minor: number;
  currency: string;
  files: string[];
  can_delete: boolean;
  blockers: string[];
};

export type RemovalChoice = "hide" | "delete";

/** Money arrives in minor units. Rs 14400 is Rs 144.00, and saying so matters
 *  when the number is the reason somebody hesitates. */
export function formatMoney(minor: number, currency = "MUR"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  const symbol = currency === "MUR" ? "Rs" : currency;
  return `${sign}${symbol} ${Math.floor(abs / 100).toLocaleString("en-GB")}.${String(abs % 100).padStart(2, "0")}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What "delete permanently" actually destroys, in the order it would hurt. */
export function deleteConsequences(p: KitchenDeletePreview): string[] {
  const out: string[] = [];
  if (p.orders > 0) {
    out.push(
      `${plural(p.orders, "past order")} worth ${formatMoney(p.money_minor, p.currency)} — including what was ordered and how it was paid`,
    );
  }
  if (p.dishes > 0) out.push(`${plural(p.dishes, "dish", "dishes")} on its menu`);
  if (p.reviews > 0) out.push(`${plural(p.reviews, "customer review")}`);
  // "photo or receipt" pluralises on the first noun, not the last, so the
  // plural is spelled out rather than derived.
  if (p.files.length > 0) {
    out.push(plural(p.files.length, "uploaded photo or receipt", "uploaded photos or receipts"));
  }
  out.push("the kitchen itself, and its cookers' access");
  return out;
}

/** What "hide" actually does — stated as plainly, so the safe option is not the
 *  vague one. An operator who cannot tell the two apart will pick the loud one. */
export function hideConsequences(p: KitchenDeletePreview): string[] {
  return [
    "customers stop seeing this kitchen anywhere on the site",
    p.dishes > 0 ? `its ${plural(p.dishes, "dish", "dishes")} stop being orderable` : "nothing is orderable from it",
    p.orders > 0
      ? `its ${plural(p.orders, "past order")} and receipts stay exactly as they are`
      : "nothing is lost",
    "you can bring it back at any time",
  ];
}

/** Hide is the recommendation whenever there is a real record to lose. It is a
 *  recommendation, not a rule — the owner may still delete. */
export function recommendedChoice(p: KitchenDeletePreview): RemovalChoice {
  return p.orders > 0 || p.reviews > 0 ? "hide" : "delete";
}

/** The same comparison the database enforces, so the button and the server agree
 *  about what counts as a match. Trimmed and case-insensitive: the operator is
 *  proving intent, not spelling. */
export function confirmMatches(typed: string, name: string): boolean {
  return typed.trim().toLowerCase() === name.trim().toLowerCase() && name.trim() !== "";
}

/** One sentence for the button, so it never says "Delete" without saying what. */
export function deleteButtonLabel(p: KitchenDeletePreview): string {
  if (p.orders === 0) return `Delete ${p.name} permanently`;
  return `Delete ${p.name} and its ${plural(p.orders, "order")} permanently`;
}

/** Why the red button is disabled, phrased as something the operator can go and
 *  fix rather than a wall. Empty array means it is available. */
export function whyBlocked(p: KitchenDeletePreview): string[] {
  return p.can_delete ? [] : p.blockers;
}
