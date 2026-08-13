import type { Metadata } from "next";
import AppPageHeader from "@/components/AppPageHeader";
import TrackRide from "./TrackRide";

// noindex: this page is only ever useful to somebody holding a reference, and a
// search result for it would be a page that can do nothing for the visitor.
export const metadata: Metadata = {
  title: "Follow your ride | Roulé Rodrigues",
  robots: { index: false, follow: false },
};

export default async function TrackRidePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; phone?: string }>;
}) {
  const { ref, phone } = await searchParams;
  // Both arrive in the URL when the customer comes straight from booking, so the
  // ride is on screen before they have to type anything. Typed in by hand
  // otherwise — the reference alone is never enough.
  return (
    <>
      <AppPageHeader title="My ride" backHref="/taxi" />
      <main className="min-h-screen bg-dark px-4 pb-32 pt-4 text-offwhite">
        <div className="mx-auto max-w-lg">
          <TrackRide initialRef={(ref ?? "").toUpperCase()} initialPhone={phone ?? ""} />
        </div>
      </main>
    </>
  );
}
