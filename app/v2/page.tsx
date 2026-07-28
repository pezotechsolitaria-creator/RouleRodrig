import type { Metadata } from "next";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import AppHome from "@/components/AppHome";
import Hero from "@/components/Hero";
import ReviewsContact from "@/components/ReviewsContact";
import Footer from "@/components/Footer";
import TiRouleGuide from "@/components/TiRouleGuide";

export const revalidate = 60;

// PREVIEW of the app-style "Roulé Rodrigues 2.0" homepage. noindex so it never
// competes with the live homepage — swap this layout onto `/` once approved.
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

  // ── Real content for the app rails (no invented ratings/prices) ──
  const experiences = content.recommended.items
    .filter((p) => p.category === "activity" && (p.image || ""))
    .map((p) => ({ id: p.id, name: p.name, image: p.image, price: p.priceNote ?? null, href: p.isTour ? "/browse/tours" : "/browse/activities" }));

  const stays = content.recommended.items
    .filter((p) => p.category === "hotel" && (p.image || ""))
    .map((p) => ({ id: p.id, name: p.name, image: p.image, price: p.priceNote ?? null, href: "/browse/stays" }));

  const discover = content.mapLocations
    .filter((l) => (l.image || l.images?.[0]) && l.story && ["beach", "viewpoint", "landmark"].includes(l.category))
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      name: l.name,
      image: l.image ?? l.images?.[0],
      href: l.category === "beach" ? `/guide/beaches#${l.id}` : l.category === "viewpoint" ? `/guide/viewpoints#${l.id}` : "/map",
      tag: l.category,
    }));

  return (
    <>
      <AppHome
        hero={<Hero hero={content.hero} />}
        reviews={<ReviewsContact contact={content.contact} fleet={fleet} />}
        footer={<Footer social={content.social} branding={content.branding} />}
        cats={browseCats}
        experiences={experiences}
        stays={stays}
        discover={discover}
        mascot={content.branding.mascotImage}
        logo={content.branding.logo}
      />

      {/* Ti Roulé lives in the app nav here, so hide its floating orb.
          WhatsApp + scroll-to-top floats are intentionally dropped on /v2. */}
      <TiRouleGuide
        hideFab
        image={content.branding.mascotImage}
        poses={content.branding.mascotPoses}
        whatsapp={content.contact.whatsappNumbers?.[0]?.number || content.social.whatsapp || content.contact.phone}
        scooterDailyMur={scooterDailyMur}
        data={{
          beaches: content.mapLocations.filter((l) => l.category === "beach").slice(0, 3).map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
          viewpoints: content.mapLocations.filter((l) => l.category === "viewpoint").slice(0, 3).map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
        }}
      />
    </>
  );
}
