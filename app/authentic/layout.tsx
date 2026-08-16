import type { ReactNode } from "react";
import WorldFonts from "@/components/world-page/WorldFonts";

// Same wrapper as /curated: the editorial serif and the no-JS fallback live in
// one component so the two world pages, and the admin's preview of either,
// cannot diverge typographically.
export default function AuthenticLayout({ children }: { children: ReactNode }) {
  return <WorldFonts>{children}</WorldFonts>;
}
