import type { Metadata } from "next";

// Different for every visitor and empty for a crawler — the definition of a
// page not worth indexing. The metadata lives in a layout because the page
// itself is a client component and cannot export it.
export const metadata: Metadata = {
  title: "Saved products | Roulé Rodrigues Marketplace",
  robots: { index: false, follow: true },
};

export default function SavedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
