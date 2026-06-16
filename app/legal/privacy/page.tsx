import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy | Roule Rodrigues",
  description: "How Roule Rodrigues collects, uses and protects your personal data.",
  alternates: { canonical: "/legal/privacy" },
};

export default async function PrivacyPage() {
  const content = await getContent();
  const email = content.contact.email || "hello@roulerodrigues.mu";

  return (
    <LegalDoc
      title="Privacy Policy"
      updated="June 2026"
      intro="We only collect the information we need to arrange your scooter rental and to keep our service safe. This page explains what we collect and how we use it."
    >
      <Section heading="1. What we collect">
        <UL>
          <li><strong>Booking details</strong> — your name, email, phone, chosen scooter and rental dates.</li>
          <li><strong>Identity</strong> — at handover the scooter owner may verify your driving licence and ID (handled by the owner, not stored by us unless you upload it).</li>
          <li><strong>Payment data</strong> — processed by our payment provider; we do not store your full card details.</li>
          <li><strong>Usage data</strong> — anonymous analytics (pages viewed, buttons clicked) to improve the site.</li>
        </UL>
      </Section>

      <Section heading="2. How we use it">
        <UL>
          <li>To process and confirm your booking and connect you with the scooter owner.</li>
          <li>To send booking confirmations and reminders.</li>
          <li>To handle refunds, disputes, and customer support.</li>
          <li>To improve the website and prevent fraud or abuse.</li>
        </UL>
      </Section>

      <Section heading="3. Who we share it with">
        <P>
          We share the minimum needed with: the <strong>scooter owner</strong> fulfilling your booking, our{" "}
          <strong>payment processor</strong>, and our <strong>hosting/analytics providers</strong>. We never sell
          your data.
        </P>
      </Section>

      <Section heading="4. Location data">
        <P>
          We do not track your live location. If you use the &ldquo;find me&rdquo; feature on the island map, that
          happens in your browser and is not stored.
        </P>
      </Section>

      <Section heading="5. Your rights">
        <P>
          You can ask us to access, correct, or delete your personal data at any time by emailing{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">{email}</a>.
        </P>
      </Section>

      <Section heading="6. Data retention & security">
        <P>
          We keep booking records only as long as needed for our records and legal obligations, and we protect
          them with access controls and encryption in transit.
        </P>
      </Section>
    </LegalDoc>
  );
}
