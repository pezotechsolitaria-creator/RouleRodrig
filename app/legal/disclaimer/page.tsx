import type { Metadata } from "next";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Disclaimer | Roule Rodrigues",
  description: "Roule Rodrigues is a scooter-rental marketplace, not a taxi service, transport operator or travel agency.",
  alternates: { canonical: "/legal/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <LegalDoc
      title="Disclaimer"
      updated="June 2026"
      intro="This page makes the boundaries of our service explicit, so there is no confusion about what Roule Rodrigues is — and isn't."
    >
      <Section heading="1. We are a scooter-rental marketplace only">
        <P>
          Roule Rodrigues facilitates scooter rentals between riders and scooter owners. That is our only
          business. We are <strong>not</strong> a taxi company, a public-transport operator, a tour operator, or a
          travel agency, and we do not hold ourselves out as any of these.
        </P>
      </Section>

      <Section heading="2. Third-party information is provided for convenience only">
        <P>The following sections of the site are purely informational and are not services we provide or control:</P>
        <UL>
          <li><strong>Taxi &amp; Transport</strong> — a directory of independent local drivers. We do not employ, dispatch, insure or vet them beyond listing, and we are not responsible for their service, pricing, safety or availability.</li>
          <li><strong>Stay · Eat · Do</strong> — recommended hotels, restaurants and activities run by independent businesses. Listings are suggestions, not endorsements or guarantees.</li>
          <li><strong>Island guide, routes, events &amp; useful numbers</strong> — general travel information that may change. Always verify critical details (e.g. emergency numbers) independently.</li>
        </UL>
        <P>
          Any arrangement you make with a third party is strictly between you and that party. Roule Rodrigues
          accepts no liability for it.
        </P>
      </Section>

      <Section heading="3. No guarantee of accuracy">
        <P>
          We work to keep information current but cannot guarantee it is always accurate, complete or up to date.
          Use it at your own discretion.
        </P>
      </Section>

      <Section heading="4. Ride safely">
        <P>
          Riding a scooter carries inherent risk. Wear your helmet, follow the rules of the road, ride within your
          ability, and never ride under the influence. Your safety is your responsibility.
        </P>
      </Section>
    </LegalDoc>
  );
}
