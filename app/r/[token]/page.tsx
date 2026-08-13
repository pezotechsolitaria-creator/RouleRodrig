import type { Metadata } from "next";
import RideOfferScreen from "./RideOfferScreen";

// ── THE DRIVER'S SCREEN ─────────────────────────────────────────────────────
//
// One job, two buttons, no login. This is the whole driver app, because taxi
// drivers have no accounts by the owner's decision — a WhatsApp link opens this,
// and a thumb decides.
//
// Short route on purpose: /r/<token> has to survive being pasted into WhatsApp,
// wrapped by a phone keyboard and read out loud down a phone line.
//
// noindex, nofollow: a live token in a search index would be a job anybody could
// take.
export const metadata: Metadata = {
  title: "Ride offer | Roulé Rodrigues",
  robots: { index: false, follow: false, nocache: true },
};

export default async function RideOfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // The token is never validated here — a server component that could tell a
  // valid token from an invalid one before any rate limiting would be a free
  // oracle. Everything goes through /api/ride-offer, which is limited.
  return <RideOfferScreen token={token} />;
}
