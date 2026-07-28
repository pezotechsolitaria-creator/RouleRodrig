import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import UsefulNumbers from "@/components/UsefulNumbers";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Emergency & useful numbers — Rodrigues Island | Roule Rodrigues",
  description: "Emergency and useful phone numbers for Rodrigues Island — police, hospital, coastguard and local contacts, kept handy for your trip.",
  alternates: { canonical: `${SITE_URL}/emergency` },
};

export default async function EmergencyPage() {
  const content = await getContent();
  return (
    <main className="min-h-screen bg-dark pb-24">
      <div className="mx-auto max-w-3xl px-5 pt-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-yellow">
          <ArrowLeft size={15} /> Roule Rodrigues
        </Link>
      </div>
      <UsefulNumbers contacts={content.usefulContacts} />
    </main>
  );
}
