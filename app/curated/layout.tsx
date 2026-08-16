import type { ReactNode } from "react";
import CuratedFonts from "@/components/curated/CuratedFonts";

// The editorial serif and the no-JS fallback live in one component so the
// public page and the admin's live preview cannot diverge. See CuratedFonts for
// why a fourth typeface is allowed here at all.
export default function CuratedLayout({ children }: { children: ReactNode }) {
  return <CuratedFonts>{children}</CuratedFonts>;
}
