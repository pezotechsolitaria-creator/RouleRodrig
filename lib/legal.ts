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

// ── THE READ PATH (P1 #2) ───────────────────────────────────────────────────
//
// LEGAL above is the fallback, not the source of truth for a running site.
// Editing it changes nothing the public can see, because the site_content row
// in Supabase overrides the checked-in defaults — the trap this codebase has
// hit before. So every surface that publishes a legal fact must resolve it
// THROUGH here, passing whatever the database returned.
//
// Pure on purpose: Footer is a client component and the two /legal pages are
// server components, and all three have to agree. A resolver that reached for
// a database client could not be shared by them.

import type { LegalContent, TermsContent } from "./defaults";

export type ResolvedLegal = {
  legalName: LegalFact;
  tradingName: string;
  brn: LegalFact;
  registeredAddress: LegalFact;
  tradingAddress: string;
  publicationDirector: LegalFact;
  host: typeof LEGAL.host;
  dataHost: typeof LEGAL.dataHost;
};

/** Blank, whitespace and the literal marker all mean "still outstanding". */
function fact(value: string | undefined, fallback: LegalFact): LegalFact {
  const v = (value ?? "").trim();
  if (!v || v === OWNER_REQUIRED) return fallback;
  return v;
}

/**
 * The legal identity as it should actually be published.
 *
 * Admin value wins; the code default fills the gap; OWNER_REQUIRED survives
 * both so an unfilled fact still renders as visibly outstanding rather than
 * silently vanishing from the notice page.
 */
export function resolveLegal(legal?: LegalContent | null): ResolvedLegal {
  return {
    legalName: fact(legal?.legalName, LEGAL.legalName),
    tradingName: LEGAL.tradingName,
    brn: fact(legal?.brn, LEGAL.brn),
    registeredAddress: fact(legal?.registeredAddress, LEGAL.registeredAddress),
    // tradingAddress has a real, owner-confirmed default, so an empty admin
    // field falls back to it rather than becoming outstanding.
    tradingAddress: (fact(legal?.tradingAddress, LEGAL.tradingAddress) as string),
    publicationDirector: fact(legal?.publicationDirector, LEGAL.publicationDirector),
    host: LEGAL.host,
    dataHost: LEGAL.dataHost,
  };
}

/** Which facts are still outstanding AFTER the admin block is applied. */
export function missingFactsFor(legal?: LegalContent | null): string[] {
  const r = resolveLegal(legal);
  const out: string[] = [];
  if (isMissing(r.legalName)) out.push("legalName");
  if (isMissing(r.brn)) out.push("brn");
  if (isMissing(r.registeredAddress)) out.push("registeredAddress");
  if (isMissing(r.publicationDirector)) out.push("publicationDirector");
  return out;
}

// ── OWNER-DECIDED COMMERCIAL RULES ──────────────────────────────────────────
//
// Same contract as the legal identity above, for the same reason: the Terms of
// Service may describe how the platform works, but it must not invent the
// owner's commercial policy. A blank clause stays visibly outstanding rather
// than being filled with something plausible, because a guessed term published
// on a page a customer agrees to is a term the business would be held to.

export const TERMS_CLAUSES = [
  "vehicleMinAge",
  "experienceCancellationNotice",
  "deliveryFailedRule",
  "complaintWindow",
  "ageRestrictedGoods",
] as const;

export type TermsClause = (typeof TERMS_CLAUSES)[number];

export type ResolvedTerms = Record<TermsClause, LegalFact>;

/** Owner value where supplied, OWNER_REQUIRED everywhere else. Never invents. */
export function resolveTerms(terms?: TermsContent | null): ResolvedTerms {
  const out = {} as ResolvedTerms;
  for (const key of TERMS_CLAUSES) {
    const v = (terms?.[key] ?? "").trim();
    out[key] = !v || v === OWNER_REQUIRED ? OWNER_REQUIRED : v;
  }
  return out;
}

/** Which commercial rules the owner still has to decide. */
export function missingClauses(terms?: TermsContent | null): TermsClause[] {
  const r = resolveTerms(terms);
  return TERMS_CLAUSES.filter((k) => isMissing(r[k]));
}
