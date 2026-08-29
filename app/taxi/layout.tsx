import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Taxi & Transport on Rodrigues Island | Roule Rodrigues",
  description:
    "Trusted local taxi and transport drivers on Rodrigues Island — airport transfers, island tours and point-to-point rides. Contact drivers directly by WhatsApp or phone.",
  alternates: {
    canonical: "/taxi",
    // Mirrors the `languages` block on app/fr/taxi-rodrigues. hreflang only
    // works when BOTH pages annotate each other; a one-way declaration is
    // silently ignored, which is the worst kind of broken because nothing
    // reports it.
    languages: {
      en: "https://roulerodrig.com/taxi",
      fr: "https://roulerodrig.com/fr/taxi-rodrigues",
      "x-default": "https://roulerodrig.com/taxi",
    },
  },
  openGraph: {
    title: "Taxi & Transport on Rodrigues Island",
    description:
      "Trusted local drivers for airport transfers, island tours and point-to-point rides on Rodrigues.",
    url: "/taxi",
    type: "website",
  },
};

export default function TaxiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
