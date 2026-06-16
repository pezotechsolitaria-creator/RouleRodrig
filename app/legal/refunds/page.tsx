import type { Metadata } from "next";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | Roule Rodrigues",
  description: "Cancellation tiers, deposits, refunds and late-return rules for scooter rentals.",
  alternates: { canonical: "/legal/refunds" },
};

export default function RefundsPage() {
  return (
    <LegalDoc
      title="Refund & Cancellation Policy"
      updated="June 2026"
      intro="Clear, fair rules so both riders and scooter owners know where they stand. These are sensible defaults you can adjust to your final pricing."
    >
      <Section heading="1. Booking confirmation">
        <P>
          A booking is a <strong>request</strong> until the scooter owner confirms availability. You are only
          charged once the booking is confirmed.
        </P>
      </Section>

      <Section heading="2. Cancellation tiers">
        <UL>
          <li><strong>More than 48 hours before pickup</strong> — full refund.</li>
          <li><strong>24–48 hours before pickup</strong> — 50% refund.</li>
          <li><strong>Less than 24 hours / no-show</strong> — non-refundable.</li>
        </UL>
        <P>If we or the owner cancel for any reason, you receive a 100% refund.</P>
      </Section>

      <Section heading="3. Security deposit">
        <P>
          A refundable security deposit may be collected at pickup (cash or card hold). It is returned in full at
          drop-off, less any agreed charge for damage, missing fuel, or late return.
        </P>
      </Section>

      <Section heading="4. Late returns">
        <P>
          Please return on time so the next rider isn&rsquo;t affected. Late returns may be charged a pro-rata
          hourly rate or a full extra day if significantly late.
        </P>
      </Section>

      <Section heading="5. Damage">
        <P>
          You are responsible for damage caused during your rental. Minor wear is expected; the cost of repairs
          for new damage may be deducted from the deposit, with photos shared for transparency.
        </P>
      </Section>

      <Section heading="6. How refunds are issued">
        <P>
          Approved refunds are returned to your original payment method, typically within 5–10 business days
          depending on your bank.
        </P>
      </Section>
    </LegalDoc>
  );
}
