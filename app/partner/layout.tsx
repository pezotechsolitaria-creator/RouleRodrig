import type { Metadata } from "next";

// Private partner portal — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Partner Portal | Roule Rodrigues",
  description: "Referral earnings dashboard for Roule Rodrigues hotel & guesthouse partners.",
  robots: { index: false, follow: false },
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
