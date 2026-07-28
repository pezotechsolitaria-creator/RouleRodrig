import type { Metadata } from "next";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import AppHome from "@/components/AppHome";
import WhatsAppButton from "@/components/WhatsAppButton";
import TiRouleGuide from "@/components/TiRouleGuide";
import ScrollToTop from "@/components/ScrollToTop";

export const revalidate = 60;

// PREVIEW of the app-style "Roulé Rodrigues 2.0" homepage. Kept out of the index
// so it never competes with the live homepage — when it's approved we swap this
// layout onto `/` and drop the noindex.
export const metadata: Metadata = {
  title: "Roulé Rodrigues 2.0 — app homepage preview",
  description: "Preview of the new app-style Roulé Rodrigues homepage.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/v2` },
};

export default async function V2Page() {
  const { content, fleet, recentBookings } = await getFleetView();
  const browseCats = buildBrowseCategories(content, fleet, recentBookings);

  const scooterPrices = fleet
    .filter((f) => (f.category ?? "scooter") === "scooter")
    .map((f) => priceNumber(f.price))
    .filter((n): n is number => n != null && n > 0);
  const scooterDailyMur = scooterPrices.length ? Math.min(...scooterPrices) : undefined;

  return (
    <>
      <AppHome cats={browseCats} />

      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
      <TiRouleGuide
        image={content.branding.mascotImage}
        poses={content.branding.mascotPoses}
        whatsapp={content.contact.whatsappNumbers?.[0]?.number || content.social.whatsapp || content.contact.phone}
        scooterDailyMur={scooterDailyMur}
        data={{
          beaches: content.mapLocations
            .filter((l) => l.category === "beach")
            .slice(0, 3)
            .map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
          viewpoints: content.mapLocations
            .filter((l) => l.category === "viewpoint")
            .slice(0, 3)
            .map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
        }}
      />
    </>
  );
}
