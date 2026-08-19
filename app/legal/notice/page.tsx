import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { CONTACT_EMAIL } from "@/lib/site";
import { resolveLegal, isMissing, type LegalFact } from "@/lib/legal";
import LegalDoc, { Section, P } from "@/components/LegalDoc";

// ── Mentions légales / Legal notice ─────────────────────────────────────────
//
// The page a customer, a bank, a supplier or a regulator looks for to find out
// who they are actually dealing with. It did not exist.
//
// Facts the owner has not supplied render as a visible "to be confirmed" row
// rather than being quietly omitted: an incomplete notice that SHOWS it is
// incomplete is honest, while one that silently skips its BRN looks finished
// and never gets fixed.

export const metadata: Metadata = {
  title: "Legal Notice | Roulé Rodrigues",
  description:
    "Legal identity of the operator of roulerodrig.com: company details, contact and hosting.",
  alternates: { canonical: "/legal/notice" },
};

function Row({ label, value }: { label: string; value: LegalFact }) {
  const missing = isMissing(value);
  return (
    <div className="flex flex-col gap-1 border-b border-dark-border py-3 sm:flex-row sm:gap-4">
      <span className="shrink-0 font-dm text-xs uppercase tracking-wider text-muted/60 sm:w-56">
        {label}
      </span>
      {missing ? (
        <span className="font-dm text-sm text-yellow/80">
          To be confirmed by the operator
        </span>
      ) : (
        <span className="font-dm text-sm text-offwhite">{value}</span>
      )}
    </div>
  );
}

export default async function LegalNoticePage() {
  const content = await getContent();
  // Resolved through the site_content block so anything the owner fills in at
  // /admin/legal is published immediately. Editing lib/legal.ts alone would
  // change nothing here — the database row wins.
  const LEGAL = resolveLegal(content.legal);
  const email = content.contact.email || CONTACT_EMAIL;
  const phone = content.contact.phone || "";

  return (
    <LegalDoc
      title="Legal Notice"
      updated="August 2026"
      intro="Mentions légales — the identity of the business operating roulerodrig.com, as required of a professional website operating from the Republic of Mauritius."
    >
      <Section heading="1. Operator of the site">
        <div className="-mt-1">
          <Row label="Trading name" value={LEGAL.tradingName} />
          <Row label="Registered legal name" value={LEGAL.legalName} />
          <Row label="Business Registration No. (BRN)" value={LEGAL.brn} />
          <Row label="Registered office" value={LEGAL.registeredAddress} />
          <Row label="Trading address" value={LEGAL.tradingAddress} />
          <Row label="Publication director" value={LEGAL.publicationDirector} />
        </div>
      </Section>

      <Section heading="2. Contact">
        <P>
          Email:{" "}
          <a href={`mailto:${email}`} className="text-yellow hover:underline">
            {email}
          </a>
          {phone ? (
            <>
              {" "}· Telephone:{" "}
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-yellow hover:underline">
                {phone}
              </a>
            </>
          ) : null}
        </P>
        <P>
          For questions about your personal data, see our{" "}
          <a href="/legal/privacy" className="text-yellow hover:underline">
            Privacy Policy
          </a>
          .
        </P>
      </Section>

      <Section heading="3. Hosting">
        <P>
          <strong>{LEGAL.host.name}</strong> — {LEGAL.host.address}. {LEGAL.host.note}
        </P>
        <P>
          <strong>{LEGAL.dataHost.name}</strong> — {LEGAL.dataHost.address}. {LEGAL.dataHost.note}
        </P>
        <P>
          Both providers operate infrastructure outside Mauritius, which means personal data
          processed through this site is stored and processed abroad. This is described in the{" "}
          <a href="/legal/privacy" className="text-yellow hover:underline">
            Privacy Policy
          </a>
          .
        </P>
      </Section>

      <Section heading="4. Intellectual property">
        <P>
          Photographs, text, the Roulé Rodrigues name and the design of this site belong to the
          operator or are used with permission. Listings, photographs and descriptions supplied by
          partner businesses remain the property of those businesses.
        </P>
      </Section>

      <Section heading="5. Applicable law">
        <P>
          This site is operated from the Republic of Mauritius and is governed by Mauritian law. The
          terms applying to bookings are set out in our{" "}
          <a href="/legal/terms" className="text-yellow hover:underline">
            Terms of Service
          </a>
          .
        </P>
      </Section>
    </LegalDoc>
  );
}
