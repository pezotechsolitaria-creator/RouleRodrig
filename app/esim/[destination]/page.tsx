import type { Metadata } from "next";
import DestinationPage, { destinationMetadata } from "../DestinationPage";

// /esim/france, /esim/reunion, … — see ../DestinationPage.tsx.
export const revalidate = 600;

// Rendered on first visit, then cached and revalidated like /esim — not per
// request. An empty list, because the shelves live in the database and change
// with every sync; unknown slugs still 404 (DestinationPage calls notFound()).
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ destination: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return destinationMetadata((await params).destination, "en");
}

export default async function Page({ params }: Props) {
  return <DestinationPage slug={(await params).destination} lang="en" />;
}
