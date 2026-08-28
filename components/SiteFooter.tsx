"use client";

import { usePathname } from "next/navigation";
import type {
  SocialLinks,
  BrandingContent,
  LegalContent,
} from "@/lib/defaults";
import { showsSiteFooter } from "@/lib/nav-scope";
import Footer from "@/components/Footer";

// ── THE FOOTER, ON EVERY PAGE THAT SHOULD HAVE ONE ──────────────────────────
//
// It used to exist on exactly one route. app/page.tsx passed <Footer> into the
// homepage as a prop, and nothing else mounted it — so the company line, the
// legal links and the Rodrigues Tourism Office were reachable from the home
// page and nowhere else. components/TourismOffice.tsx had even written down
// the assumption that was never true: "one quiet line for the footer, on every
// page".
//
// This is the mount, next to <BottomNav /> in the root layout, for the same
// reason that one is there: one place where it can be true, instead of a
// judgement call repeated on seventy pages. The rule itself lives in
// lib/nav-scope.ts beside the tab bar's, where it is documented and tested —
// and it is deliberately NOT the same rule. See showsSiteFooter.
//
// A client component only because the decision needs the current path. The
// content comes down as props from the layout, which already had it.

export default function SiteFooter({
  social,
  branding,
  legal,
}: {
  social?: SocialLinks;
  branding?: BrandingContent;
  legal?: LegalContent;
}) {
  const pathname = usePathname() || "/";
  if (!showsSiteFooter(pathname)) return null;

  return <Footer social={social} branding={branding} legal={legal} />;
}
