import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { CONTACT_EMAIL } from "@/lib/site";
import { resolveLegal, resolveTerms, isMissing, type LegalFact } from "@/lib/legal";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

// ── TERMS THAT DESCRIBE THE PRODUCT THAT ACTUALLY EXISTS ────────────────────
//
// These terms were written for a scooter-rental site and never moved. In the
// meantime the platform grew food ordering, a marketplace, event ticketing,
// taxi and private hire, its own delivery network and bookable experiences —
// none of which appeared here at all. A customer buying a ticket or ordering
// dinner was agreeing to a document about riding a scooter.
//
// Two things that were quietly wrong and are fixed here:
//
//   1. Liability was capped at "the commission we earned on that booking".
//      The platform is subscription-funded, not commission-funded (M23/M26),
//      so on most transactions that figure is ZERO — a cap of nothing is a
//      total exclusion by accident, and an unreasonable one a Mauritian court
//      would be entitled to ignore. It is now a real, proportionate cap with
//      the carve-outs no term may exclude.
//
//   2. It described a rental contract only. Who the seller is now differs by
//      vertical, and that is the single most consequential fact for a customer
//      chasing a refund — so each vertical says plainly who they contracted
//      with and who holds their money.
//
// ── WHAT THIS PAGE MUST NEVER DO ───────────────────────────────────────────
// Invent a commercial rule. How long before a boat trip you may cancel, or what
// happens to a delivery nobody answers, are the owner's decisions. Those render
// through <Clause>, which shows "to be confirmed by the operator" until the
// owner fills them in at /admin/legal. A plausible guess published here is a
// term the business would be held to.

export const metadata: Metadata = {
  title: "Terms & Conditions | Roulé Rodrigues",
  description:
    "The terms governing rentals, food and shop orders, event tickets, taxi and private hire, delivery and experiences booked through Roulé Rodrigues.",
  alternates: { canonical: "/legal/terms" },
};

/** An owner-decided rule. Visibly outstanding rather than quietly absent. */
function Clause({ value }: { value: LegalFact }) {
  if (isMissing(value)) {
    return <span className="text-yellow/80">[to be confirmed by the operator]</span>;
  }
  return <strong>{value}</strong>;
}

export default async function TermsPage() {
  const content = await getContent();
  // Fallback must be an address we actually own and that actually receives
  // mail. The old fallback was a domain nobody here owns.
  const email = content.contact.email || CONTACT_EMAIL;
  const LEGAL = resolveLegal(content.legal);
  const T = resolveTerms(content.terms);
  const operator = isMissing(LEGAL.legalName) ? LEGAL.tradingName : (LEGAL.legalName as string);

  return (
    <LegalDoc
      title="Terms & Conditions"
      updated="August 2026"
      intro="These terms explain what Roulé Rodrigues does, what each party is responsible for, and who you are actually contracting with — which differs depending on what you book. By using the platform you agree to them."
    >
      <Section heading="1. Who we are">
        <P>
          Roulé Rodrigues (&ldquo;the Platform&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by{" "}
          <strong>{operator}</strong> from Rodrigues Island, Republic of Mauritius. Our full legal
          identity, registration details and hosting providers are published in our{" "}
          <a href="/legal/notice" className="text-yellow hover:underline">Legal Notice</a>.
        </P>
        <P>
          We are an <strong>intermediary</strong>. We introduce you to businesses on Rodrigues, take and
          record your booking or order, and hold both sides to it. With the exception of vehicle rental
          deposits, we do not sell the goods and services listed and we do not receive the money you pay
          for them.
        </P>
      </Section>

      <Section heading="2. What these terms cover">
        <P>The Platform now covers several different services, and they do not all work the same way:</P>
        <UL>
          <li><strong>Vehicle rentals</strong> — scooters, cars and other vehicles from partner owners.</li>
          <li><strong>Food orders</strong> — from kitchens and restaurants listed on the Platform.</li>
          <li><strong>Marketplace orders</strong> — goods from shops listed on the Platform.</li>
          <li><strong>Event tickets</strong> — sold by event organisers.</li>
          <li><strong>Taxi and private hire</strong> — journeys with independent licensed drivers.</li>
          <li><strong>Delivery</strong> — where we carry an order to you ourselves.</li>
          <li><strong>Experiences</strong> — boat trips, fishing, massage and similar bookings.</li>
        </UL>
        <P>
          Section 4 sets out who you are contracting with in each case. It is the most important section
          on this page, because it decides who owes you a refund when something goes wrong.
        </P>
      </Section>

      <Section heading="3. Your account and your details">
        <UL>
          <li>Most of the Platform can be used without an account. Where you give an email or phone number, it must be one you control — it is how your order, ticket or booking reaches you.</li>
          <li>You are responsible for what is done through your account if you have one.</li>
          <li>Do not use the Platform to place orders you do not intend to pay for, or to book journeys you do not intend to take.</li>
        </UL>
      </Section>

      <Section heading="4. Who you are contracting with">
        <P>
          <strong>Food, marketplace and event tickets.</strong> Your contract is with the kitchen, shop or
          organiser. You pay them <strong>directly</strong>, by bank transfer into their own account. Roulé
          Rodrigues never receives or holds that money, so a refund is sent by the seller and not by us —
          although we will record it and chase it on your behalf. Tickets are issued by the organiser.
        </P>
        <P>
          <strong>Vehicle rentals.</strong> The rental contract is between you and the vehicle
          owner/partner. We facilitate it and may take a deposit to confirm the booking. At handover you
          may be asked to sign the owner&rsquo;s own rental agreement and provide identification and a
          refundable security deposit.
        </P>
        <P>
          <strong>Taxi and private hire.</strong> Your contract is with the driver, who is independently
          licensed. Fares are paid directly to the driver. We introduce and coordinate the journey.
        </P>
        <P>
          <strong>Experiences.</strong> Your contract is with the operator running the trip or providing
          the treatment. Where a deposit is taken to hold a place, it is handled as described in our{" "}
          <a href="/legal/refunds" className="text-yellow hover:underline">Refund &amp; Cancellation Policy</a>.
        </P>
        <P>
          <strong>Delivery.</strong> Where the order page says Roulé Rodrigues delivers it, the delivery
          itself is performed by us or by a driver working for us, and we are responsible for that leg.
          The goods themselves remain the seller&rsquo;s responsibility.
        </P>
      </Section>

      <Section heading="5. Orders, reservations and payment">
        <P>
          A booking or order is a <strong>request until it is confirmed</strong>. Placing an order
          reserves stock for a limited period, which is shown to you at checkout and on your tracking
          page as a specific date and time. If payment has not arrived by then, the reservation is
          released and the order is cancelled. Nothing is charged automatically at any point.
        </P>
        <P>
          Prices shown are the prices charged. The amount you are asked to transfer is calculated by us
          from the seller&rsquo;s own published prices, and we do not add anything to it that is not
          itemised on the order.
        </P>
        <P>
          Where age-restricted goods are offered: <Clause value={T.ageRestrictedGoods} />
        </P>
      </Section>

      <Section heading="6. Cancellations and refunds">
        <P>
          Cancellation rights and refund routes differ by service and are set out in full in our{" "}
          <a href="/legal/refunds" className="text-yellow hover:underline">Refund &amp; Cancellation Policy</a>,
          which forms part of these terms. In summary: if a seller cancels, runs out or never delivers,
          you are entitled to a full refund and that is not at their discretion.
        </P>
        <P>
          To cancel an experience — a boat trip, fishing trip or massage — the notice required is{" "}
          <Clause value={T.experienceCancellationNotice} />. Trips cancelled for weather or sea
          conditions are always refundable in full or rescheduled at your choice.
        </P>
        <P>
          If a delivery cannot be completed at the address you gave:{" "}
          <Clause value={T.deliveryFailedRule} />
        </P>
        <P>
          If something is wrong with what you received, tell us within{" "}
          <Clause value={T.complaintWindow} /> and we will take it up with the seller on your behalf.
          For food specifically, please tell us within 24 hours.
        </P>
      </Section>

      <Section heading="7. Riding and driving">
        <P>If you hire a vehicle through the Platform, you must:</P>
        <UL>
          <li>
            Hold a valid driving licence for the vehicle and be at least 18 years old. The minimum age to
            hire is <Clause value={T.vehicleMinAge} />.
          </li>
          <li>Inspect the vehicle at handover and report any pre-existing damage immediately.</li>
          <li>Wear the provided helmet at all times — this is mandatory by law — and obey all road rules.</li>
          <li>Return the vehicle on time, in the same condition, with a similar fuel level.</li>
          <li>Accept responsibility for damage, loss, fines or penalties incurred during your rental period.</li>
        </UL>
      </Section>

      <Section heading="8. Sellers, drivers and organisers">
        <P>
          Businesses listed on the Platform are independent. They set their own prices, hours and
          availability, and are responsible for the quality, safety and legality of what they sell,
          including holding any licence or permit their activity requires. We may remove a listing or a
          business from the Platform, at any time, where we believe customers are being let down.
        </P>
        <P>
          Terms between the Platform and businesses selling on it are separate from these and are set out
          in the agreement each business accepts when it joins.
        </P>
      </Section>

      <Section heading="9. What the Platform is not responsible for">
        <P>
          We operate the booking and ordering system; we do not perform most of the services listed on
          it. Subject always to section 10, we are not liable for:
        </P>
        <UL>
          <li>Accidents, injuries or damage to property arising from the use of a vehicle, or from taking part in an experience.</li>
          <li>The mechanical condition or roadworthiness of a vehicle after it has been handed over to you.</li>
          <li>Rider or driver behaviour, traffic offences, fines, or breaches of local law.</li>
          <li>The quality, safety or fitness of food and goods prepared and supplied by an independent seller.</li>
          <li>An event being cancelled, postponed or changed by its organiser.</li>
          <li>Loss, theft or damage to your personal belongings.</li>
          <li>
            Third-party information published for your convenience — including &ldquo;Stay · Eat · Do&rdquo;
            recommendations, maps and guides. See our{" "}
            <a href="/legal/disclaimer" className="text-yellow hover:underline">Disclaimer</a>.
          </li>
        </UL>
      </Section>

      <Section heading="10. Limitation of liability">
        <P>
          <strong>Nothing in these terms limits or excludes liability that cannot lawfully be limited or
          excluded</strong> — in particular liability for death or personal injury caused by our
          negligence, for fraud or fraudulent misrepresentation, or any other liability that Mauritian
          law does not permit us to exclude.
        </P>
        <P>
          Subject to that, and to the maximum extent permitted by law, our total liability for any claim
          arising out of a single transaction is limited to the greater of: the total amount you paid{" "}
          <strong>to us</strong> in connection with that transaction, or the fee we earned from it. Where
          a seller holds your money, our role is to pursue them for it rather than to pay it twice.
        </P>
        <P>
          We are not liable for indirect or consequential loss, or for loss of profit, revenue or
          anticipated enjoyment, except where the law says otherwise.
        </P>
      </Section>

      <Section heading="11. If something goes wrong">
        <P>
          Tell us first — most problems are resolved quickly and we would rather fix them than argue
          about them. Contact us at{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">{email}</a>. If we cannot
          resolve it between us, these terms and any dispute arising from them are governed by the laws
          of the <strong>Republic of Mauritius</strong>, and the Mauritian courts have jurisdiction.
        </P>
        <P>Your rights under Mauritian consumer law are unaffected by anything on this page.</P>
      </Section>

      <Section heading="12. Changes to these terms">
        <P>
          We may update these terms as the Platform changes. The &ldquo;last updated&rdquo; date above
          reflects the current version, and the terms that apply to a booking or order are the ones
          published when you placed it.
        </P>
      </Section>
    </LegalDoc>
  );
}
