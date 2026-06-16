import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Scooter Owner Agreement | Roule Rodrigues",
  description: "The agreement between Roule Rodrigues and scooter owners/partners who list their vehicles.",
  alternates: { canonical: "/legal/owner-agreement" },
};

export default async function OwnerAgreementPage() {
  const content = await getContent();
  const email = content.contact.email || "hello@roulerodrigues.mu";

  return (
    <LegalDoc
      title="Scooter Owner Agreement"
      updated="June 2026"
      intro="This agreement applies to scooter owners and partners who list their vehicles on Roule Rodrigues. It explains how the partnership works and who is responsible for what."
    >
      <Section heading="1. Listing your scooter">
        <P>
          By listing a scooter you confirm that you are its legal owner (or are authorised to rent it out), and
          that the details, photos and pricing you provide are accurate and kept up to date.
        </P>
      </Section>

      <Section heading="2. Your responsibilities as the owner">
        <UL>
          <li>Keep each scooter roadworthy, serviced, and legally registered and insured as required by Mauritian law.</li>
          <li>Provide a compliant helmet for each rider and disclose any known faults before handover.</li>
          <li>Be available to hand over and collect the scooter at the agreed times.</li>
          <li>Verify the renter&rsquo;s licence and ID at handover and complete your own rental/handover checklist.</li>
          <li>Set and honour the availability you publish to avoid double-bookings.</li>
        </UL>
      </Section>

      <Section heading="3. The Platform's role">
        <P>
          Roule Rodrigues provides the booking system, presents your scooters to riders, facilitates communication,
          and processes rental payments. We are an intermediary — we do not own, operate, maintain or insure your
          scooter, and we are not a party to the rental contract between you and the renter.
        </P>
      </Section>

      <Section heading="4. Commission & payouts">
        <UL>
          <li>The Platform retains an agreed commission on each completed booking; the rest is paid out to you.</li>
          <li>Payouts are made after the rental has started/handover is complete, by the method agreed with you.</li>
          <li>You are responsible for your own taxes and any business permits required for renting vehicles.</li>
        </UL>
      </Section>

      <Section heading="5. Cancellations, deposits & damage">
        <P>
          Bookings follow the Platform&rsquo;s published{" "}
          <a href="/legal/refunds" className="text-yellow hover:underline">Refund &amp; Cancellation Policy</a>. You
          may collect a refundable security deposit at handover and document any damage with photos. Disputes over
          damage are between you and the renter; the Platform may help mediate.
        </P>
      </Section>

      <Section heading="6. Liability">
        <P>
          You are responsible for the condition and safety of your scooter and for meeting your legal and insurance
          obligations. The Platform is not liable for accidents, injuries, vehicle defects, or any loss arising from
          the use of your scooter.
        </P>
      </Section>

      <Section heading="7. Standards & removal">
        <P>
          We may remove a listing or end this agreement if a scooter is unsafe, repeatedly unavailable, mis-described,
          or receives serious complaints. You may remove your listings at any time, subject to honouring confirmed
          bookings.
        </P>
      </Section>

      <Section heading="8. Contact">
        <P>
          Questions about partnering? Email{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">{email}</a>. This agreement is governed
          by the laws of Mauritius.
        </P>
      </Section>
    </LegalDoc>
  );
}
