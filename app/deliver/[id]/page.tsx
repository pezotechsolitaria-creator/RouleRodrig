import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContent } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import AppPageHeader from "@/components/AppPageHeader";
import RequestTracker from "./RequestTracker";

export const dynamic = "force-dynamic";

// noindex, and not only for tidiness: this URL is half of a guest's credential.
// A request id sitting in a search index is somebody's delivery, their village
// and their phone number waiting for the other half to be guessed.
export const metadata: Metadata = {
  title: "Your delivery request | Roulé Rodrigues",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DeliveryRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = await getContent();

  // Whether there is a session, and nothing more. The id is deliberately NOT
  // validated here: a server component that could tell a real request from an
  // invented one, before any rate limiting, is a free oracle for probing them.
  // Everything goes through /api/delivery-requests/[id], which is limited.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <AppPageHeader logo={content.branding.logo} />
      <main className="min-h-screen bg-dark">
        <div className="mx-auto max-w-2xl px-5 py-8">
          <Link
            href="/deliver"
            className="mb-6 inline-flex items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-offwhite"
          >
            <ArrowLeft size={15} /> Deliver anything
          </Link>
          <RequestTracker id={id} signedIn={Boolean(user)} />
        </div>
      </main>
    </>
  );
}
