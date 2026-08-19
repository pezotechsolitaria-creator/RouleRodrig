import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { resolveRefunds } from "@/lib/legal";
import LegalDoc, { Section, P, UL } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | Roule Rodrigues",
  description:
    "How cancellations and refunds work for vehicle rentals, shop and food orders, and event tickets on Roule Rodrigues.",
  alternates: { canonical: "/legal/refunds" },
};

// ── Written to match what the software actually does ───────────────────────
//
// This page used to cover vehicle rentals ONLY, and told everybody that
// "approved refunds are returned to your original payment method". For a
// marketplace, food or ticket order that is simply false: the customer
// transfers into the SHOP'S OWN bank account and Roulé Rodrigues never holds a
// cent of it (M89/M90). We cannot return money we never had, and a policy that
// says otherwise is a promise the platform is not able to keep.
//
// So it now covers all four things sold here and, where the platform is only
// the introducer, says so plainly. Section 6 is the one that matters most: it
// describes the real M90 mechanism — the shop sends it back, we record it,
// chase it, and the customer confirms it arrived.
// ── THE COMMERCIAL NUMBERS ARE THE OWNER'S, AND NOW EDITABLE ───────────────
//
// Sections 3, 6, 7 and 8 are business decisions, not descriptions of what the
// software does, and they were only changeable by a deploy. They now come from
// the `refunds` block on site_content via /admin/legal.
//
// They fall back to the wording published here before, NOT to a blank: these
// tiers have been in force for months, so an empty admin field must keep
// publishing them rather than replace a live consumer policy with "to be
// confirmed". That is the opposite of how the Terms clauses resolve, and the
// reason is that those had no published rule to lose.
//
// Everything else on this page stays hardcoded on purpose. Who holds the money,
// how a refund is opened and chased, and what happens with a taxi are
// descriptions of the M89/M90 mechanism — they are facts about the software,
// and an owner must not be able to edit the page into disagreeing with it.
export default async function RefundsPage() {
  const content = await getContent();
  const R = resolveRefunds(content.refunds);

  return (
    <LegalDoc
      title="Refund & Cancellation Policy"
      updated="August 2026"
      intro="Roulé Rodrigues sells four different things, and money is handled differently for each. This explains who holds your money, who returns it, and how long that takes."
    >
      <Section heading="1. Who holds your money">
        <P>
          This matters more than anything else on this page. For <strong>shop orders, food orders and
          event tickets</strong>, you pay the seller <strong>directly</strong>, by bank transfer into
          their own account. Roulé Rodrigues never receives or holds that money. We introduce you,
          record the order, and hold both sides to it — but a refund is sent by the seller, not by us.
        </P>
        <P>
          For <strong>vehicle rentals</strong>, a deposit is taken to confirm the booking. Where that
          deposit was paid by card or PayPal it is returned by the same route.
        </P>
      </Section>

      <Section heading="2. Booking confirmation (vehicle rentals)">
        <P>
          A booking is a <strong>request</strong> until the vehicle owner confirms availability. You are only
          charged once the booking is confirmed.
        </P>
      </Section>

      <Section heading="3. Cancellation tiers (vehicle rentals)">
        <UL>
          {R.vehicleCancellationTiers.map((t) => (
            <li key={t.window}>
              <strong>{t.window}</strong> — {t.outcome}.
            </li>
          ))}
        </UL>
        {/* Not editable, and deliberately so: "we cancelled, so you are made
            whole" is not a commercial dial the owner should be able to turn
            down. */}
        <P>If we or the owner cancel for any reason, you receive a 100% refund.</P>
      </Section>

      <Section heading="4. Shop and food orders">
        <P>
          You can cancel free of charge at any time <strong>before the shop confirms your payment</strong>.
          Nothing has been prepared and no money has moved, so there is nothing to return.
        </P>
        <UL>
          <li>
            <strong>Before the shop starts preparing</strong> — full refund. Contact the shop or us and
            it is cancelled.
          </li>
          <li>
            <strong>Once food is being cooked or an order has been packed</strong> — the shop may keep
            all or part of the amount, because the cost has already been spent on your behalf. Fresh
            food in particular cannot be resold.
          </li>
          <li>
            <strong>If the shop cancels, runs out, or never delivers</strong> — you get 100% back, always.
            This is not at the shop&rsquo;s discretion.
          </li>
        </UL>
        <P>
          If what arrives is wrong, missing or not fit to eat, tell us within 24 hours and we will take it
          up with the shop on your behalf.
        </P>
      </Section>

      <Section heading="5. Event tickets">
        <P>
          Tickets are sold by the organiser, not by Roulé Rodrigues. Unless the event page says otherwise,
          tickets are <strong>non-refundable once issued</strong> — an organiser has committed to costs on the
          strength of them.
        </P>
        <P>
          If the <strong>event is cancelled, postponed or materially changed</strong>, you are entitled to a
          full refund from the organiser, and we will chase it for you.
        </P>
      </Section>

      <Section heading="6. Security deposit (vehicle rentals)">
        <P>{R.securityDeposit}</P>
      </Section>

      <Section heading="7. Late returns (vehicle rentals)">
        <P>{R.lateReturnCharge}</P>
      </Section>

      <Section heading="8. Damage (vehicle rentals)">
        <P>{R.damageRule}</P>
      </Section>

      <Section heading="9. How a refund actually reaches you">
        <P>
          <strong>Deposits paid by card or PayPal</strong> go back the way they came, typically within 5–10
          business days depending on your bank.
        </P>
        <P>
          <strong>Everything paid by bank transfer</strong> — which is every shop order, food order and
          ticket — is returned by the seller, into an account you give us. It works like this:
        </P>
        <UL>
          <li>
            The refund is opened <strong>automatically</strong> the moment a paid order is cancelled. You do
            not have to ask, and nobody has to remember.
          </li>
          <li>
            You tell us <strong>where to send it</strong> on your order page. We need this before the seller
            can pay you — it is the one step only you can do.
          </li>
          <li>
            The seller transfers the money and marks it sent. You are notified, and you confirm when it
            reaches your account.
          </li>
          <li>
            If the seller does not send it, <strong>we chase them every other day</strong>, and after the
            second reminder it is escalated to Roulé Rodrigues directly.
          </li>
        </UL>
        <P>
          Bank transfers within Rodrigues and Mauritius usually arrive the same or the next working day.
          If yours has not arrived within 5 working days of being marked sent, tell us and we will pursue it.
        </P>
      </Section>

      <Section heading="10. Taxi bookings">
        <P>
          Taxi fares are paid in cash directly to the driver, so there is nothing for us to refund. You can
          cancel a booking at any time at no charge — but please do cancel rather than simply not appear.
          A driver who travels to meet you has spent fuel and turned down other work, and repeated no-shows
          mean we will ask you to confirm by phone before we send anyone again.
        </P>
      </Section>
    </LegalDoc>
  );
}
