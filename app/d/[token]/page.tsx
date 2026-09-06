import type { Metadata } from "next";
import ConsoleBackLink from "@/components/ConsoleBackLink";
import DriverHome from "./DriverHome";

// ── THE DRIVER'S PERMANENT LINK ─────────────────────────────────────────────
//
// /d/<token>, bookmarked once. No account, no password, no install — the same
// decision as the offer link, for the same reason: asking a taxi driver on this
// island to maintain a login is how you end up with three drivers.
//
// Short route so it survives being pasted into WhatsApp and read out over a
// phone. noindex because a token in a search index is somebody else's identity.
export const metadata: Metadata = {
  title: "My rides | Roulé Rodrigues",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DriverHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Never validated here: a server component that could tell a good token from a
  // bad one before any rate limiting would be a free oracle for guessing them.
  // Everything goes through /api/driver-home, which is limited.
  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite">
      <div className="mx-auto max-w-md">
        {/* A taxi driver has no account, so there is no dashboard hub to send
            them to — the website itself is the only "back" that means anything
            here, and this page is very often a home-screen shortcut with no
            address bar above it. */}
        {/* The one console reached without an account: this driver holds a token,
            not a login, so /account would be a sign-in wall. */}
        <ConsoleBackLink className="mb-3" href="/" label="Roulé Rodrigues" />
        <DriverHome token={token} />
      </div>
    </main>
  );
}
