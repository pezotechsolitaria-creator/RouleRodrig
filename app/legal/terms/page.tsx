import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { CONTACT_EMAIL } from "@/lib/site";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Terms & Conditions | Roule Rodrigues",
  description: "The terms governing scooter rentals booked through Roule Rodrigues.",
  alternates: { canonical: "/legal/terms" },
};

export default async function TermsPage() {
  const content = await getContent();
  // Fallback must be an address we actually own and that actually receives
  // mail — a privacy policy legally needs a working contact. The old fallback
  // was hello@roulerodrigues.mu, a domain nobody here owns.
  const email = content.contact.email || CONTACT_EMAIL;

  return (
    <LegalDoc
      title="Terms & Conditions"
      updated="June 2026"
      intro="These terms explain what Roule Rodrigues does, what we are responsible for, and what we are not. By booking a scooter through our platform you agree to them."
    >
      <Section heading="1. Who we are">
        <P>
          Roule Rodrigues (&ldquo;the Platform&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a scooter-rental
          marketplace based on Rodrigues Island, Mauritius. We connect riders (&ldquo;you&rdquo;) with scooter
          owners/partners, handle booking requests, and facilitate payments for scooter rentals.
        </P>
      </Section>

      <Section heading="2. What the Platform is responsible for">
        <UL>
          <li>Operating the booking system and presenting available scooters.</li>
          <li>Facilitating communication between you and the scooter owner.</li>
          <li>Processing rental payments and applying our published cancellation and refund rules.</li>
        </UL>
      </Section>

      <Section heading="3. What the Platform is NOT responsible for">
        <P>The Platform is an intermediary. We do not own, operate, maintain or insure every scooter, and we are not liable for:</P>
        <UL>
          <li>Accidents, injuries, death, or damage to property arising from the use of a scooter.</li>
          <li>The mechanical condition or roadworthiness of a scooter after it has been handed over to you.</li>
          <li>Rider behaviour, traffic offences, fines, or breaches of local law.</li>
          <li>Loss, theft, or damage to your personal belongings.</li>
          <li>
            Any third-party services listed for your convenience — including taxi/transport drivers, tours,
            and &ldquo;Stay · Eat · Do&rdquo; recommendations. These are informational only (see our Disclaimer).
          </li>
        </UL>
      </Section>

      <Section heading="4. Your responsibilities as a rider">
        <UL>
          <li>Hold a valid driving licence and be at least 18 years old.</li>
          <li>Inspect the scooter at handover and report any pre-existing damage immediately.</li>
          <li>Wear the provided helmet at all times (mandatory by law) and obey all road rules.</li>
          <li>Return the scooter on time, in the same condition, with a similar fuel level.</li>
          <li>Be responsible for damage, loss, fines or penalties incurred during your rental period.</li>
        </UL>
      </Section>

      <Section heading="5. The rental relationship">
        <P>
          The rental contract is between <strong>you and the scooter owner/partner</strong>. The Platform
          facilitates that contract but is not a party to it. At handover you may be asked to sign the owner&rsquo;s
          rental agreement and provide ID and a refundable deposit.
        </P>
      </Section>

      <Section heading="6. Bookings, payments & cancellations">
        <P>
          A booking is a request until confirmed. Payments, deposits, cancellation tiers and late-return charges
          are governed by our <a href="/legal/refunds" className="text-yellow hover:underline">Refund &amp; Cancellation Policy</a>.
        </P>
      </Section>

      <Section heading="7. Limitation of liability">
        <P>
          To the maximum extent permitted by law, the Platform&rsquo;s total liability for any claim relating to a
          booking is limited to the commission we earned on that booking. We are not liable for indirect or
          consequential loss.
        </P>
      </Section>

      <Section heading="8. Disputes">
        <P>
          Tell us first — most issues are resolved quickly. Contact us at{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">{email}</a>. Disputes are governed by
          the laws of Mauritius.
        </P>
      </Section>

      <Section heading="9. Changes">
        <P>We may update these terms; the &ldquo;last updated&rdquo; date above reflects the current version.</P>
      </Section>
    </LegalDoc>
  );
}
