import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Taxi & Transport on Rodrigues Island | Roule Rodrigues",
  description:
    "Trusted local taxi and transport drivers on Rodrigues Island — airport transfers, island tours and point-to-point rides. Contact drivers directly by WhatsApp or phone.",
  alternates: { canonical: "/taxi" },
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
