import type { ReactNode } from "react";
import WorldFonts from "@/components/world-page/WorldFonts";

// The editorial serif and the no-JS fallback live in one component so the
// public page and the admin's live preview cannot diverge. See WorldFonts for
// why a fourth typeface is allowed here at all.
export default function CuratedLayout({ children }: { children: ReactNode }) {
  return <WorldFonts>{children}</WorldFonts>;
}
