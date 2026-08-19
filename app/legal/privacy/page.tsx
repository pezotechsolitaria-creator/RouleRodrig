import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { CONTACT_EMAIL } from "@/lib/site";
import { LEGAL, isMissing } from "@/lib/legal";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

// ── WHAT WE ACTUALLY DO WITH PEOPLE'S DATA ──────────────────────────────────
//
// The previous version described a scooter-rental website, and by August 2026
// that had stopped being true in ways that matter:
//
//   · it said "we do not track your live location" while driver_locations and
//     /api/tracking/ping were recording driver positions every 20 seconds
//   · it called the analytics "anonymous" while PWARegister.tsx calls
//     posthog.identify(user.id) for a signed-in user, which is the opposite
//   · it never mentioned food orders, the marketplace, taxi and private hire,
//     event tickets, delivery, the Ti Roulé assistant, web push, or the bank
//     transfer receipts customers upload — which are financial documents
//
// A privacy policy that understates collection is worse than a missing one: it
// is a published statement that is false. Everything below is written from what
// the code actually does, and nothing is listed that the product does not do.

export const metadata: Metadata = {
  title: "Privacy Policy | Roulé Rodrigues",
  description: "What Roulé Rodrigues collects, why, who sees it, and how to have it deleted.",
  alternates: { canonical: "/legal/privacy" },
};

export default async function PrivacyPage() {
  const content = await getContent();
  // Must be an address we own and that actually receives mail — a privacy
  // policy legally needs a working contact.
  const email = content.contact.email || CONTACT_EMAIL;
  const controller = isMissing(LEGAL.legalName) ? LEGAL.tradingName : (LEGAL.legalName as string);

  return (
    <LegalDoc
      title="Privacy Policy"
      updated="August 2026"
      intro="We collect what we need to arrange what you booked, get it to you, take payment, and keep the service safe — and nothing beyond that. This page says exactly what that means in practice."
    >
      <Section heading="1. Who is responsible for your data">
        <P>
          {controller}, trading as Roulé Rodrigues, operating from {LEGAL.tradingAddress}, is the
          controller of the personal data described here. Our full legal identity, including our
          Business Registration Number, is on our{" "}
          <a href="/legal/notice" className="text-yellow hover:underline">Legal Notice</a>. You can
          reach us about anything on this page at{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">{email}</a>.
        </P>
      </Section>

      <Section heading="2. What we collect, and why">
        <UL>
          <li>
            <strong>Booking and order details</strong> — your name, phone, email, what you booked or
            ordered, dates, times, and a delivery or pick-up address where one applies. We need this
            to perform the booking you asked for.
          </li>
          <li>
            <strong>Proof of payment</strong> — if you pay by bank transfer, the photo or PDF of the
            transfer slip you upload. It is stored privately and is opened only by us to confirm your
            payment, or by the business fulfilling your order.
          </li>
          <li>
            <strong>Payment status</strong> — whether an order is paid, and its reference. Card
            payments are handled by our payment provider; we never see or store your card number.
          </li>
          <li>
            <strong>Account data</strong> — if you create an account, your email and sign-in
            credentials, held by our authentication provider. We never see your password.
          </li>
          <li>
            <strong>Identity at handover</strong> — for a vehicle rental the operator may check your
            driving licence and ID in person. We do not store a copy unless you upload one.
          </li>
          <li>
            <strong>Driver location</strong> — <strong>if you are a driver working with us</strong>,
            your device reports its position roughly every 20 seconds while you are on an active job,
            so the customer and dispatch can see the delivery approaching. It is not collected when
            you are off duty. Customers&rsquo; own positions are not tracked: the &ldquo;find
            me&rdquo; button on the map runs in your browser and is not sent to us.
          </li>
          <li>
            <strong>Messages you send us</strong> — what you type to the Ti Roulé assistant, and
            anything you send us on WhatsApp or by email, so that we can answer you.
          </li>
          <li>
            <strong>Notifications</strong> — if you turn on alerts, the push subscription your
            browser issues, so we can tell you when an order is confirmed or on its way.
          </li>
          <li>
            <strong>Technical and usage data</strong> — pages viewed and actions taken, plus error
            reports when something breaks. If you are signed in, this activity is linked to your
            account identifier, so it is <strong>not anonymous</strong>. We use it to see what is
            broken and what people cannot find.
          </li>
        </UL>
      </Section>

      <Section heading="3. On what basis">
        <P>In plain terms, rather than legal labels:</P>
        <UL>
          <li>
            <strong>Because you asked us to</strong> — everything needed to take, confirm, deliver
            and get paid for your booking. Without it there is no booking.
          </li>
          <li>
            <strong>Because you switched it on</strong> — push notifications, and any marketing
            message. You can turn these off at any time without losing the service.
          </li>
          <li>
            <strong>Because we have to run a safe service</strong> — fraud prevention, error
            reporting, and keeping enough of a record to resolve a dispute about an order.
          </li>
          <li><strong>Because the law requires it</strong> — accounting and tax records.</li>
        </UL>
      </Section>

      <Section heading="4. Who else sees it">
        <P>
          We do not sell your data and we do not share it for anyone else&rsquo;s advertising. It
          reaches only:
        </P>
        <UL>
          <li>
            <strong>The business fulfilling your order</strong> — the vehicle operator, kitchen,
            shop, captain, therapist, guide or driver — and only what they need to serve you: your
            name, phone, what you ordered, and the address if they are delivering.
          </li>
          <li><strong>Our payment provider</strong>, to take and confirm payment.</li>
          <li>
            <strong>Our hosting, database and email providers</strong>, who store and transmit the
            data on our behalf.
          </li>
          <li>
            <strong>Our analytics and error-reporting providers</strong>, for the technical data in
            section 2. Payment details, passwords and uploaded documents are deliberately kept out of
            those systems.
          </li>
          <li>
            <strong>WhatsApp</strong>, where you choose to contact us or a driver that way — those
            messages sit on Meta&rsquo;s service under their terms, not ours.
          </li>
          <li><strong>Authorities</strong>, where the law obliges us.</li>
        </UL>
      </Section>

      <Section heading="5. Where your data is held">
        <P>
          Our site, database and uploaded files are hosted by {LEGAL.host.name} and{" "}
          {LEGAL.dataHost.name} on infrastructure <strong>outside Mauritius</strong>. Using this site
          therefore involves your data being stored and processed abroad, by providers who commit to
          protecting it under their own data-protection terms. Both are named on our{" "}
          <a href="/legal/notice" className="text-yellow hover:underline">Legal Notice</a>.
        </P>
      </Section>

      <Section heading="6. How long we keep it">
        <UL>
          <li><strong>Bookings, orders and payment records</strong> — kept while the booking is live, then retained for accounting and tax purposes.</li>
          <li><strong>Uploaded transfer receipts</strong> — kept with the order they prove, for the same accounting period.</li>
          <li><strong>Driver position history</strong> — kept only as long as it is useful to the job and to resolving a dispute about it, then removed.</li>
          <li><strong>Assistant and support messages</strong> — kept while they are useful for supporting you.</li>
          <li><strong>Technical and error data</strong> — kept for a short period by our providers under their own retention settings.</li>
          <li><strong>Account data</strong> — kept until you ask us to close your account.</li>
        </UL>
        <P>
          Exact retention periods are set by the operator in line with Mauritian accounting and tax
          obligations. Ask us at{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">{email}</a> if you need
          the current figure for a specific record.
        </P>
      </Section>

      <Section heading="7. Your rights">
        <P>
          You can ask us to show you the personal data we hold about you, correct it if it is wrong,
          delete it, or stop using it for something. Write to{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">{email}</a> and say
          what you want — no particular wording is needed. We will answer, and we may ask you to
          confirm your identity first so that we do not hand your data to someone else.
        </P>
        <P>
          Some data we cannot delete on request: once an order has been paid for, the record of that
          transaction has to be kept for accounting and tax. We will tell you when that applies
          rather than quietly keeping it.
        </P>
        <P>
          If you are not satisfied with how we handle your request, you may complain to the{" "}
          <strong>Data Protection Office of Mauritius</strong>.
        </P>
      </Section>

      <Section heading="8. If you are visiting from the EU or the UK">
        <P>
          The rights in section 7 — access, correction, erasure, objection, restriction, and getting
          a copy of the data you gave us in a portable form — are available to you at the same
          address, and we will deal with your request within one month. Where we rely on your
          consent you can withdraw it at any time, and where we rely on our own legitimate interest
          you can object and we will re-examine it. Your data is processed outside the EU and UK, as
          described in section 5.
        </P>
      </Section>

      <Section heading="9. Cookies and similar storage">
        <P>
          We use browser storage to keep you signed in, to remember your language, and to hold your
          basket between pages — the site cannot work without these. We also load an analytics tool
          and an error-reporting tool, described in section 2, which set their own identifiers. We do
          not run advertising or ad-targeting trackers.
        </P>
      </Section>

      <Section heading="10. Children">
        <P>
          This service is intended for adults. We do not knowingly collect data from children. If a
          child has given us data, write to us and we will remove it.
        </P>
      </Section>

      <Section heading="11. Changes to this policy">
        <P>
          When the service changes, this page changes with it, and the date at the top is updated. It
          is worth re-reading if you have not booked with us for a while.
        </P>
      </Section>
    </LegalDoc>
  );
}
