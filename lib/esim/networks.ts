// ── Which Mauritian networks actually reach Rodrigues ───────────────────────
//
// THE RULE THE WHOLE eSIM STORE STANDS ON. Mauritius has three mobile
// operators and only two of them are on Rodrigues:
//
//   my.t    (Mauritius Telecom, formerly Orange / Cellplus)  MCC-MNC 617-01  ✓
//   Emtel                                                     MCC-MNC 617-10  ✓
//   Chili   (MTML — Mahanagar Telephone Mauritius)            MCC-MNC 617-03  ✗
//
// A roaming eSIM does not bring its own network: it borrows whichever local
// operators its wholesaler has a deal with. A plan that roams ONLY onto MTML
// works in Port Louis and shows zero bars from the moment the plane lands at
// Plaine Corail. Selling one to a Rodrigues visitor would be selling nothing.
//
// So a plan is shown to shoppers only if its operator list names my.t or
// Emtel. The check is deliberately generous about SPELLING — wholesalers write
// "my.t", "MyT", "Mauritius Telecom", "Orange MU", "Cellplus" or just the PLMN
// "61701" — and deliberately strict about the ANSWER: an unknown operator name
// is not coverage. A plan we cannot prove reaches the island stays hidden, and
// the admin screen says why.

export type EsimNetwork = {
  /** Operator name exactly as the wholesaler reported it. */
  name: string;
  /** Radio generation the wholesaler advertises for this operator, e.g. "4G". */
  type?: string | null;
};

const RODRIGUES_OPERATORS: { label: string; patterns: RegExp[] }[] = [
  {
    label: "my.t",
    patterns: [
      /\bmy\s*\.?\s*t\b/i,
      /mauritius\s*telecom/i,
      /\bcellplus\b/i,
      // Orange owned a stake in Mauritius Telecom and the network carried the
      // Orange brand until 2016; some wholesale lists still say so. Only with
      // a Mauritius qualifier — "Orange" alone is a dozen other countries.
      /\borange\b.*\b(mu|mauritius|maurice)\b/i,
      /\b(mu|mauritius|maurice)\b.*\borange\b/i,
      /\b617[\s-]?0?1\b/,
    ],
  },
  {
    label: "Emtel",
    patterns: [/\bemtel\b/i, /\b617[\s-]?10\b/],
  },
];

const OFF_ISLAND = [/\bchili\b/i, /\bmtml\b/i, /mahanagar/i, /\b617[\s-]?0?3\b/];

/** The Rodrigues-capable operator a name refers to, or null. */
export function rodriguesOperator(name: string): "my.t" | "Emtel" | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  for (const op of RODRIGUES_OPERATORS) {
    if (op.patterns.some((p) => p.test(n))) return op.label as "my.t" | "Emtel";
  }
  return null;
}

/** True for the Mauritian operator that has NO signal on Rodrigues. */
export function isOffIslandOperator(name: string): boolean {
  return OFF_ISLAND.some((p) => p.test(name ?? ""));
}

/** A plan covers Rodrigues iff at least one of its operators is my.t or Emtel. */
export function coversRodrigues(networks: readonly EsimNetwork[] | null | undefined): boolean {
  return (networks ?? []).some((n) => rodriguesOperator(n.name) !== null);
}

/**
 * The operators a shopper should read on a plan card, Rodrigues-capable first,
 * de-duplicated and normalised ("MyT 4G" and "Mauritius Telecom" are one
 * network, not two). MTML is dropped from the card: listing it beside the
 * others invites the one question we cannot answer well — "will I get Chili?"
 * — and it changes nothing about what works on the island.
 */
export function displayNetworks(networks: readonly EsimNetwork[] | null | undefined): string[] {
  const out: string[] = [];
  for (const n of networks ?? []) {
    const op = rodriguesOperator(n.name);
    if (!op) continue;
    const gen = bestGeneration([n.type ?? "", n.name]);
    const label = gen ? `${op} ${gen}` : op;
    const existing = out.findIndex((l) => l.startsWith(op));
    if (existing === -1) out.push(label);
    else if (gen && !out[existing].includes(" ")) out[existing] = label;
  }
  // my.t first: it has the wider rural footprint on Rodrigues.
  return out.sort((a, b) => (a.startsWith("my.t") ? -1 : b.startsWith("my.t") ? 1 : 0));
}

function bestGeneration(texts: string[]): string | null {
  const joined = texts.join(" ").toUpperCase();
  if (/\b5G\b/.test(joined)) return "5G";
  if (/\b(4G|LTE)\b/.test(joined)) return "4G";
  if (/\b3G\b/.test(joined)) return "3G";
  return null;
}
