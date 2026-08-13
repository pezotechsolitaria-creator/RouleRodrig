import type { Metadata } from "next";
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
        <DriverHome token={token} />
      </div>
    </main>
  );
}
