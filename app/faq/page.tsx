import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";

// The FAQ moved off the homepage (now a lean action dashboard) to its own page,
// reachable from the nav/hamburger. Static-ish: refresh hourly.
export const revalidate = 3600;

const DESCRIPTION =
  "Answers to common questions about renting a scooter or car on Rodrigues Island with Roule Rodrigues — booking, deposits, delivery, licences, payment and pickup.";

export const metadata: Metadata = {
  title: "FAQ — scooter & car rental in Rodrigues | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/faq` },
  openGraph: {
    title: "FAQ | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/faq`,
  },
};

export default async function FaqPage() {
  const content = await getContent();
  const items = (content.faq.items ?? []).filter((i) => i.question && i.answer);

  // FAQPage markup is legitimate here because every Q&A is rendered on this page.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Roule Rodrigues", url: SITE_URL },
        { name: "FAQ", url: `${SITE_URL}/faq` },
      ]),
      ...(content.faq.enabled && items.length
        ? [
            {
              "@type": "FAQPage",
              "@id": `${SITE_URL}/faq#faq`,
              mainEntity: items.map((f) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="bg-dark min-h-screen">
        <div className="mx-auto max-w-3xl px-6 pt-28 md:pt-32">
          <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors">
            <ArrowLeft size={15} /> Roule Rodrigues
          </Link>
        </div>
        {content.faq.enabled && items.length ? (
          <Faq content={content.faq} />
        ) : (
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h1 className="font-syne font-extrabold text-offwhite text-3xl mb-3">FAQ</h1>
            <p className="text-muted font-dm text-sm">
              No questions yet — reach us on WhatsApp and we&apos;ll help right away.
            </p>
          </div>
        )}
      </main>
      <Footer social={content.social} branding={content.branding} />
    </>
  );
}
