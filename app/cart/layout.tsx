import type { Metadata } from "next";

// These pages are Client Components, so they cannot export metadata themselves
// — this layout carries it. They were INDEXABLE with no robots directive and,
// until the canonical fix, also claimed to be duplicates of the homepage. A
// cart, a sign-in screen and a personal booking lookup have no business in
// search results: they are per-visitor, thin, and (for manage-booking) a page
// whose whole purpose is to display someone's private reservation.
// The TITLE is here for a different reason: with none of its own, the bag
// inherited the root layout's "Roule Rodrigues | Scooter & Car Rental", so
// someone holding three things from two shops had a browser tab that talked
// about renting a scooter. Tabs are how people find their way back to a
// half-finished purchase.
export const metadata: Metadata = {
  title: "Your bag | Roulé Rodrigues",
  robots: { index: false, follow: false },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
