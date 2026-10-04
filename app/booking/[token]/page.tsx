import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { placeHref } from "@/lib/place-href";
import AppPageHeader from "@/components/AppPageHeader";
import ReservationHub from "@/components/reservations/ReservationHub";
import { viewByToken } from "@/lib/reservations/server";

// ── /booking/[token] — the guest's reservation ──────────────────────────────
//
// Replaces the "Request sent!" modal: one page the guest keeps, that tells
// them where the request is, what happens next and — only once Roulé has
// confirmed — how to pay. The token in the URL is the credential (only its
// hash is stored), so the page is never indexed, sends no Referer anywhere,
// and is rendered per request.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The unaccented brand in a TITLE (lib/one-brand-name.test.ts); the page
  // itself says Roulé, as the rest of the site does.
  title: "Your reservation | Roule Rodrigues",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [view, content] = await Promise.all([viewByToken(token).catch(() => undefined), getContent()]);
  const whatsapp = content.contact.whatsappNumbers?.[0]?.number ?? content.contact.phone ?? null;
  // "Request another day" goes back to the listing itself, when it still exists.
  const listing = view ? (content.recommended?.items ?? []).find((p) => p.id === view.productId && !p.hidden) : undefined;
  const againHref = listing ? placeHref(listing) : "/experiences";

  return (
    <>
      <AppPageHeader showBack backHref="/" />
      <main className="min-h-[calc(100vh-4rem)] bg-dark pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <ReservationHub token={token} initial={view ?? null} unavailable={view === undefined} whatsapp={whatsapp} againHref={againHref} />
      </main>
    </>
  );
}
