import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "List Your Scooter — Earn with Roule Rodrigues",
  description:
    "Own a scooter on Rodrigues? List it with Roule Rodrigues and earn money. We handle bookings, payments and customers — you keep your scooter busy.",
  alternates: { canonical: "/list-your-scooter" },
  openGraph: {
    title: "List Your Scooter — Earn with Roule Rodrigues",
    description: "Turn your scooter into income. We handle the bookings; you earn.",
    url: "/list-your-scooter",
    type: "website",
  },
};

export default function ListScooterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
