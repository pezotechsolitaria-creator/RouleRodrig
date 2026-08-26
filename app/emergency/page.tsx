import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import UsefulNumbers from "@/components/UsefulNumbers";
import AppPageHeader from "@/components/AppPageHeader";
import TourismOffice from "@/components/TourismOffice";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Emergency & useful numbers — Rodrigues Island | Roule Rodrigues",
  description:
    "Emergency and useful phone numbers for Rodrigues Island — police, hospital, coastguard and local contacts, kept handy for your trip.",
  alternates: { canonical: `${SITE_URL}/emergency` },
};

export default async function EmergencyPage() {
  const content = await getContent();
  return (
    <main className="min-h-screen bg-dark pb-24">
      {/* Was a 15px arrow and the words "Roule Rodrigues", inside the scroll.
          Same control every other redesigned page now carries: it stays on
          screen, and its tap target is 52px. */}
      <AppPageHeader showBack backHref="/" />
      <UsefulNumbers contacts={content.usefulContacts} />

      {/* The strongest placement on the site for this. Somebody on the
          emergency page is already looking for a number and for somebody
          official — the tourism office hotline belongs beside the police and
          the hospital, not buried in a footer. */}
      <div className="mx-auto mt-8 max-w-3xl px-5">
        <TourismOffice variant="full" />
      </div>
    </main>
  );
}
