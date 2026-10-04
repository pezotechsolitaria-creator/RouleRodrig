import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

// ── A PASSWORD SCREEN IS NOT A SEARCH RESULT (architecture review 2026-09-30,
// item 7) ────────────────────────────────────────────────────────────────────
// The page is a Client Component, so it cannot export metadata itself, and it
// had none: it inherited the HOMEPAGE's title and description and carried no
// robots directive — the only public route left with neither (SEO audit of
// 2026-09-29). It is reached from a one-time email link, holds a recovery
// token in its fragment and is useless to anyone else, so it asks not to be
// indexed or followed, the rule app/login/layout.tsx applies to sign-in.
//
// Its own title is the heading the page shows ("Choose a new password"), so a
// browser tab and a history entry say what the screen is. The canonical names
// the bare path, never the token-bearing URL a visitor actually lands on.
export const metadata: Metadata = {
  title: "Choose a new password | Roule Rodrigues",
  description: "Set a new password for your Roule Rodrigues account.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/auth/reset-password` },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
