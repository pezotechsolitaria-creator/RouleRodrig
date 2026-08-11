import type { Metadata } from "next";

// Same reasoning as app/cart/layout.tsx, and the same mechanism: the tracking
// page is a Client Component (it reads ?ref= via useSearchParams), so it cannot
// export metadata itself.
//
// This one matters more than a cart. Its entire purpose is to display a named
// stranger's order — items, total, phone number, pickup code — behind an order
// number and an email. There is nothing here a search engine should hold a
// copy of, and the confirmation email links straight to it with ?ref= already
// filled in, so a crawler following that link from anywhere would be indexing
// a page built to show one person their own purchase.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function TrackOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
