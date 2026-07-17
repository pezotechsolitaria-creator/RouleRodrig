import type { Metadata } from "next";

// The URL stays /list-your-scooter — it's indexed and linked, so changing it
// would break inbound links for no gain. The metadata now reflects the broader
// partner directory (vehicle / restaurant / stay / activity / experience).
const TITLE = "List Your Business on Rodrigues | Roule Rodrigues";
const DESCRIPTION =
  "Run a scooter, car, restaurant, guesthouse or activity on Rodrigues? List it with Roule Rodrigues and reach tourists planning their trip. We handle enquiries; you stay in control.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/list-your-scooter" },
  openGraph: {
    title: TITLE,
    description: "Get your Rodrigues business in front of tourists actively planning their trip.",
    url: "/list-your-scooter",
    type: "website",
  },
};

export default function ListPartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
