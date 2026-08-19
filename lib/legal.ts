// ── WHO IS LEGALLY PUBLISHING THIS SITE ─────────────────────────────────────
//
// A professional site operating from Mauritius has to say, in a place anyone
// can find, WHO is behind it: the legal name of the business, its Business
// Registration Number, a real address, a real contact, and who hosts it.
// Roulé Rodrigues took bookings and money for months without any of that
// published anywhere.
//
// ── WHY PLACEHOLDERS INSTEAD OF VALUES ──────────────────────────────────────
// A BRN is a fact about a company registry. Inventing one — or "reasonably
// guessing" the registered address — would publish a false statement of
// identity on a site that handles payments, which is worse than publishing
// nothing. So every fact the owner has not given me is OWNER_REQUIRED, it
// renders visibly as outstanding, and a test fails the moment the page claims
// to be complete while a placeholder is still in it.
//
// Fill these in and the notice page, the footer and the metadata all update
// together — there is one copy of each fact.

/** Marker for a fact only the owner can supply. Rendered, never hidden. */
export const OWNER_REQUIRED = "OWNER_REQUIRED" as const;

export type LegalFact = string | typeof OWNER_REQUIRED;

export const LEGAL = {
  /** Exact registered name as it appears on the certificate of incorporation. */
  legalName: OWNER_REQUIRED as LegalFact,
  /** The public-facing name. This one we do know. */
  tradingName: "Roulé Rodrigues",
  /** Business Registration Number issued by the Registrar of Companies. */
  brn: OWNER_REQUIRED as LegalFact,
  /** Registered office as filed — may differ from where customers meet you. */
  registeredAddress: OWNER_REQUIRED as LegalFact,
  /** Where customers actually find you. Confirmed by the owner. */
  tradingAddress: "Baie aux Huîtres, Rodrigues Island, Republic of Mauritius",
  /** Person responsible for what is published. */
  publicationDirector: OWNER_REQUIRED as LegalFact,
  /** Who physically serves the site. */
  host: {
    name: "Vercel Inc.",
    address: "440 N Barranca Ave #4133, Covina, CA 91723, United States",
    note: "Application hosting and content delivery.",
  },
  /** Where the database and uploaded files live. */
  dataHost: {
    name: "Supabase, Inc.",
    address: "970 Toa Payoh North #07-04, Singapore 318992",
    note: "Database, authentication and file storage.",
  },
} as const;

/** True when a fact is still outstanding and must not be presented as final. */
export function isMissing(value: LegalFact): boolean {
  return value === OWNER_REQUIRED;
}

/** Every fact the owner still has to supply, for the audit checklist. */
export function missingFacts(): string[] {
  const out: string[] = [];
  if (isMissing(LEGAL.legalName)) out.push("legalName");
  if (isMissing(LEGAL.brn)) out.push("brn");
  if (isMissing(LEGAL.registeredAddress)) out.push("registeredAddress");
  if (isMissing(LEGAL.publicationDirector)) out.push("publicationDirector");
  return out;
}

/** Is the published legal identity complete enough to stop warning about it? */
export function legalIdentityComplete(): boolean {
  return missingFacts().length === 0;
}
