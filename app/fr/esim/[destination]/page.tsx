import type { Metadata } from "next";
import PageLanguage from "@/components/PageLanguage";
import DestinationPage, { destinationMetadata } from "@/app/esim/DestinationPage";

// /fr/esim/france, /fr/esim/reunion, … — the French twin of /esim/[destination],
// rendered French on the server. See app/esim/DestinationPage.tsx.
export const revalidate = 600;

// Rendered on first visit, then cached and revalidated like /esim — not per
// request. An empty list, because the shelves live in the database and change
// with every sync; unknown slugs still 404 (DestinationPage calls notFound()).
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ destination: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return destinationMetadata((await params).destination, "fr");
}

export default async function Page({ params }: Props) {
  return (
    <>
      {/* This page is written in French; `lang` describes its CONTENT. */}
      <PageLanguage lang="fr" />
      <DestinationPage slug={(await params).destination} lang="fr" />
    </>
  );
}
