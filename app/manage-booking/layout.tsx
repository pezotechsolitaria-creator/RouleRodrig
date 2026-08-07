import type { Metadata } from "next";

// These pages are Client Components, so they cannot export metadata themselves
// — this layout carries it. They were INDEXABLE with no robots directive and,
// until the canonical fix, also claimed to be duplicates of the homepage. A
// cart, a sign-in screen and a personal booking lookup have no business in
// search results: they are per-visitor, thin, and (for manage-booking) a page
// whose whole purpose is to display someone's private reservation.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ManageBookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
