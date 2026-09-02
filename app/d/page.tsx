import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import DriverSignIn from "./DriverSignIn";

// ── /d — the way back into a driver's page (M100) ──────────────────────────
//
// /d/<token> is the driver's job board and that token IS the credential, so a
// driver who closed the tab and lost the WhatsApp message was locked out until
// the owner resent it. This is the parent of that route for a reason: a driver
// who half-remembers the address types "/d", and now that lands somewhere
// useful instead of a 404.
//
// noindex: nothing here should be discoverable by search, and there is nothing
// on it worth ranking.
export const metadata: Metadata = {
  title: "Driver sign in · Roulé Rodrigues",
  robots: { index: false, follow: false },
};

export default function DriverEntryPage() {
  return (
    <main className="min-h-screen bg-dark font-dm text-offwhite">
      <div className="mx-auto max-w-sm px-5 py-10">
        {/* Fallback "/account": this page is the standalone twin of the driver code box on Account, which is the one place in the app that does the same job — see the sentence below. */}
        <BackLink
          fallback="/account"
          iconSize={15}
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-yellow"
        >
          {" "}Back
        </BackLink>

        <p className="mt-7 font-bebas text-[11px] tracking-[0.3em] text-yellow">DRIVERS</p>
        <h1 className="mt-1.5 font-syne text-3xl font-extrabold leading-tight">Open my driver page</h1>
        <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
          Lost the link? Type the code Roulé Rodrigues gave you. You can also do this from Account on the main site.
        </p>

        <DriverSignIn />
      </div>
    </main>
  );
}
