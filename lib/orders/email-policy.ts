// Which order statuses are worth an email, and which are push-only.
//
// Extracted from the two status routes rather than left duplicated inline: the
// rule was already stated twice, and a rule stated twice is a rule that drifts.
//
// THE CONSTRAINT IS REAL, NOT STYLISTIC. Brevo (300/day) + Resend (100/day) is
// roughly 400 free messages a day, and Supabase's own auth mail spends the
// Brevo half invisibly. Emailing every status change exhausts that ceiling and
// the first casualty is password resets — a customer locked out of their
// account because a shop marked an order "preparing" forty times.
//
// An email has to leave something behind that the customer needs LATER:
//   ready_for_pickup — carries the pickup code they present at a counter,
//                      often with no signal in the shop.
//   collected        — closes the order; the receipt they keep.
//   cancelled        — money and expectations changed; a record matters.
//
// Everything else (paid, preparing, and every delivery step) is push plus the
// in-app feed: instant, free, unlimited, and nobody needs to find it in six
// months.
export const STATUSES_THAT_EARN_AN_EMAIL: readonly string[] = [
  "ready_for_pickup",
  "collected",
  "cancelled",
] as const;

export type CustomerChannel = "email" | "web-push";

/** The channels a customer status-change notification may use. */
export function channelsForStatus(status: string): CustomerChannel[] {
  return STATUSES_THAT_EARN_AN_EMAIL.includes(status)
    ? ["email", "web-push"]
    : ["web-push"];
}

/** True when this status change should spend an email. */
export function earnsEmail(status: string): boolean {
  return STATUSES_THAT_EARN_AN_EMAIL.includes(status);
}
