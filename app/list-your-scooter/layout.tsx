import type { Metadata } from "next";
import { ogImages } from "@/lib/share-image";

// The URL stays /list-your-scooter — it's indexed and linked, so changing it
// would break inbound links for no gain. The metadata now reflects the full
// partner directory: the five open categories, the marketplace shop, and the
// three approval-only roles added in M47 (taxi driver, event organiser,
// delivery partner). "Become a taxi driver Rodrigues" is a search someone
// actually makes, and until now this page could not answer it.
const TITLE = "List Your Business on Rodrigues | Roule Rodrigues";
const DESCRIPTION =
  "List your scooter, car, guesthouse or restaurant on Rodrigues and reach tourists planning their trip. No commission upfront. Taxi drivers can apply too.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/list-your-scooter" },
  openGraph: {
    title: TITLE,
    description: "Get your Rodrigues business in front of tourists actively planning their trip.",
    url: "/list-your-scooter",
    type: "website",
    images: ogImages(),
  },
};

export default function ListPartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
