// ── THE HOMEPAGE'S RATING IS THE ONE THE PAGE PRINTS (architecture review
// 2026-09-30, item 5 fix-up) ─────────────────────────────────────────────────
//
// A first draft of item 5 moved the #business aggregateRating off `reviews`
// (getFleetView's marquee query, the twelve newest) onto every approved review,
// so the count would not stop at twelve. But the page still prints the rating of that same
// list: components/ReviewsContact.tsx averages `initialReviews` for its pill
// and heads its "all reviews" list with that average and `reviews.length`.
// From the thirteenth review on, the markup would have said "4.6 from 15"
// beside a page that says 5.0 and lists twelve — a rating no visitor can find,
// which Google's rich-result rules forbid (and so does hard rule 6 of the
// review).
//
// So the markup is computed from the list the page renders, with the same
// arithmetic as the pill. Counting every approved review is still the right
// end state, but it has to start in ReviewsContact — printing the full count
// and letting a visitor open every review it counts — and the markup follows.

export type ShownRating = { ratingValue: number; reviewCount: number };

/**
 * ReviewsContact's `avg` — `(sum / length).toFixed(1)`, the same rounding, so
 * a 4.35 cannot print as 4.3 and publish as 4.4 — and the number of reviews it
 * lists. Null when it lists none: no pill, so no rating either.
 */
export function shownRating(reviews: readonly { rating: number }[]): ShownRating | null {
  if (reviews.length === 0) return null;
  const avg = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);
  return { ratingValue: Number(avg), reviewCount: reviews.length };
}
