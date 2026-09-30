import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import UsefulNumbers from "@/components/UsefulNumbers";
import AppPageHeader from "@/components/AppPageHeader";
import TourismOffice from "@/components/TourismOffice";

export const revalidate = 3600;

// No coastguard: site_content.usefulContacts has no coastguard number, and the
// description and subtitle both promised one (SEO audit 2026-09-29 C7/T3). Put
// it back the day the owner adds the number.
export const metadata: Metadata = {
  title: "Emergency Numbers — Rodrigues | Roule Rodrigues",
  description:
    "Emergency and useful phone numbers for Rodrigues Island — police, hospital, fire and local contacts, kept handy for your trip.",
  alternates: { canonical: `${SITE_URL}/emergency` },
};

export default async function EmergencyPage() {
  const content = await getContent();
  return (
    <main className="min-h-screen bg-dark pb-24">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Emergency numbers", url: `${SITE_URL}/emergency` },
          ]),
        ]}
      />
      {/* Was a 15px arrow and the words "Roule Rodrigues", inside the scroll.
          Same control every other redesigned page now carries: it stays on
          screen, and its tap target is 52px. */}
      <AppPageHeader showBack backHref="/" />

      {/* This page had NO heading above the individual contact cards — the
          document's first heading was "Rodrigues Tourism Office", a section
          well down the page. So the one page somebody opens in an emergency
          never stated, in its structure, what it was. UsefulNumbers renders no
          heading of its own, so it belongs here. */}
      <div className="mx-auto max-w-3xl px-5 pt-6">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">RODRIGUES</p>
        <h1 className="mt-1 font-syne text-3xl font-extrabold uppercase leading-[0.95] text-offwhite">
          Emergency &amp; useful numbers
        </h1>
        <p className="mt-2 font-dm text-sm text-muted">
          Police, hospital, fire and the tourism office — every number tap-to-call.
        </p>
      </div>

      {/* Open, not an accordion: on this page the numbers ARE the page, and a
          collapsed list shipped none of them in the HTML (audit C7/T3). */}
      <UsefulNumbers contacts={content.usefulContacts} alwaysOpen />

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
