// ── "NEEDS 24 H NOTICE · UP TO 2 DAYS AHEAD" (M216) ─────────────────────────
//
// The booking rule of one kitchen, in one line, for its card on /admin/food.
// Before M216 the only way to learn why Chez Banane would not take an order for
// today was to open SQL. Kept out of KitchensPanel.tsx so the words are tested
// without a browser.

/** "Needs 24 h notice · up to 2 days ahead", "Bookable up to 1 day ahead", … */
export function bookingRule(noticeHours: number, days: number): string {
  const ahead = days === 0 ? "today only" : `up to ${days} day${days === 1 ? "" : "s"} ahead`;
  return noticeHours > 0 ? `Needs ${noticeHours} h notice · ${ahead}` : `Bookable ${ahead}`;
}
