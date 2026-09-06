import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicEvent } from "@/lib/events/queries";
import EventCheckout from "@/components/events/EventCheckout";
import {
  EventCheckoutClosed,
  EventCheckoutHeader,
} from "@/components/events/EventCheckoutChrome";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Buying a ticket is not buying a jar of honey.
//
// Until now selecting a package pushed the buyer to /checkout — the marketplace
// form — which asks how they would like the order delivered, offers to send a
// driver to their GPS location, and talks about collecting from the shop during
// opening hours. For a concert every one of those is wrong, and the wrongness is
// not cosmetic: a buyer who is asked to choose a delivery zone for a ticket
// reasonably concludes the site is broken.
//
// So this is a separate page with the same server guarantees and none of the
// shop vocabulary. It still posts to /api/checkout, because create_order() is
// where every price is derived, every stock row is locked and every refusal code
// lives — a second order-creation path would be a second thing to get wrong.
// Fulfillment is fixed at 'pickup' as the internal value, and never spoken:
// nothing is delivered, and a ticket is not collected from a counter.
export default async function EventCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const [event, { data: { user } }] = await Promise.all([
    getPublicEvent(supabase, slug),
    supabase.auth.getUser(),
  ]);

  // A draft, test or unknown event is indistinguishable from outside — the same
  // rule the event page itself follows.
  if (!event) notFound();

  // Selling has to be closed for a cancelled or finished event, and the checkout
  // is the last place that can say so before money moves.
  const closed =
    event.phase === "cancelled" || event.phase === "ended" || !!event.cancelledAt;

  return (
    <main className="min-h-screen bg-dark px-4 pb-32 pt-10 text-offwhite md:pb-16">
      <div className="mx-auto max-w-lg">
        <EventCheckoutHeader slug={event.slug} name={event.name} closed={closed} />

        {closed ? (
          <EventCheckoutClosed cancelled={!!event.cancelledAt} />
        ) : (
          <div className="mt-6">
            <EventCheckout
              event={{
                storeId: event.storeId,
                slug: event.slug,
                name: event.name,
                startsAt: event.startsAt,
                doorsOpenAt: event.doorsOpenAt,
                timezone: event.timezone,
                venueName: event.venueName,
                venueAddress: event.venueAddress,
                supportPhone: event.supportPhone,
                terms: event.terms,
              }}
              signedInEmail={user?.email ?? null}
              defaultName={(user?.user_metadata?.full_name as string) ?? ""}
            />
          </div>
        )}
      </div>
    </main>
  );
}
