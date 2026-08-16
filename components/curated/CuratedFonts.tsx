import { Cormorant_Garamond } from "next/font/google";
import type { ReactNode } from "react";

// ── A FOURTH TYPEFACE, SCOPED TO ONE WORLD ──────────────────────────────────
//
// DESIGN.md's Three-Voice Rule is Syne / DM Sans / Bebas, and it is a good rule:
// it is what stops the site drifting into a different look on every new page.
// This is a deliberate, argued exception, not an oversight.
//
// The Curated world is a different REGISTER, not a different brand. Everywhere
// else the site sells — a scooter, a table, a ticket — and Syne's geometry suits
// that. Here it recommends, and a high-contrast old-style serif is what tells a
// reader within one glance that they are reading an editor rather than a
// catalogue. Every other voice on the page is unchanged: navigation, metadata,
// labels and buttons are still DM Sans, and Cormorant appears ONLY at display
// sizes (see .rr-cur-display in globals.css), where its thin strokes are an
// asset rather than a legibility problem.
//
// It is loaded here rather than in the root layout so it is downloaded by people
// who open a curated surface and by nobody else. Both the public page and the
// admin's live preview wrap themselves in this, which is also what keeps the
// preview typographically identical to the thing it is previewing.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant-var",
  display: "swap",
});

export default function CuratedFonts({ children }: { children: ReactNode }) {
  return (
    <div className={cormorant.variable}>
      {/* The scroll reveals start at opacity:0 and are un-hidden by JavaScript.
          With JS off that would be a blank page — so with JS off, the CSS that
          hides them is cancelled. The page then renders complete and static,
          which is the correct no-JS experience for an editorial page anyway. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            "<style>.rr-cur-reveal{opacity:1!important;transform:none!important}.rr-cur-rise{opacity:1!important;animation:none!important}</style>",
        }}
      />
      {children}
    </div>
  );
}
