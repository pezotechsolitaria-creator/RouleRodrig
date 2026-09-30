import { isSellable } from "./pricing";
import { HOME_CODE } from "./destinations";

// ── Stocking a destination's shelf automatically ─────────────────────────────
//
// The wholesaler offers dozens of packages per country (single-country, day
// passes, regional, global). A shopper wants three or four clear choices. This
// picks them, per destination, by TRIP SHAPE rather than by package type:
//
//   ≥ 1 GB  and ≥ 7 days   — the cheapest way to be connected
//   ≥ 3 GB  and ≥ 7 days   — a normal holiday
//   ≥ 5 GB  and ≥ 15 days  — a longer stay
//   ≥ 10 GB and ≥ 30 days  — heavy use / remote work
//
// Each slot takes the CHEAPEST sellable candidate (a global plan wins only when
// it is also the cheapest — "works in 119 countries" is a bonus, not a reason
// to pay more). Then any pick another pick beats on every axis (more data, as
// many days, no dearer) is dropped: a shelf must never show a plan that is
// simply worse than the one beside it.
//
// Mauritius is NEVER auto-curated: it is the home shelf, chosen by hand, and
// bound by the Rodrigues network rule the curator knows nothing about.

export type Candidate = {
  id: string;
  data_mb: number;
  per_day: boolean;
  validity_days: number;
  country_codes: string[];
  retail_eur_cents: number;
  wholesale_usd_micros: number;
  available: boolean;
};

export type Pick = { planId: string; badge: "short_trip" | "popular" | "best_value" | "long_stay" | null; sort: number };

// The four trip shapes, smallest first. They decide WHICH plans go on the
// shelf; the badges are worked out afterwards, from the plans themselves.
const SLOTS: { minMb: number; minDays: number }[] = [
  { minMb: 1000, minDays: 7 },
  { minMb: 3000, minDays: 7 },
  { minMb: 5000, minDays: 15 },
  { minMb: 10000, minDays: 30 },
];

/** Total data over the plan's life: a day pass gives its allowance every day. */
export function totalMb(c: { data_mb: number; per_day: boolean; validity_days: number }): number {
  return c.per_day ? c.data_mb * c.validity_days : c.data_mb;
}

function scope(c: Candidate): number {
  const n = c.country_codes.length;
  return n <= 1 ? 0 : n <= 45 ? 1 : 2;
}

export function curateDestination(code: string, candidates: Candidate[], eurPerUsd: number): Pick[] {
  if (code.toUpperCase() === HOME_CODE) return [];
  const pool = candidates
    .filter((c) => c.available && c.country_codes.includes(code.toUpperCase()))
    .filter((c) => isSellable(c.retail_eur_cents, c.wholesale_usd_micros, eurPerUsd))
    .sort((a, b) => a.retail_eur_cents - b.retail_eur_cents || scope(a) - scope(b) || totalMb(b) - totalMb(a));

  const picked: (Pick & { c: Candidate })[] = [];
  for (const slot of SLOTS) {
    const best = pool.find(
      (c) => totalMb(c) >= slot.minMb && c.validity_days >= slot.minDays && !picked.some((p) => p.planId === c.id),
    );
    if (best) picked.push({ planId: best.id, badge: null, sort: 0, c: best });
  }

  // b dominates a when it is at least as good on every axis AND either
  // strictly better on one or simply earlier. Without the tie-break, two
  // identical packages (the wholesaler lists "JP_3_30" and "JP_3_30_IIJ" at
  // the same price) knock each other out and the shelf loses both.
  const dominates = (b: (typeof picked)[number], a: (typeof picked)[number], bi: number, ai: number) => {
    if (b === a) return false;
    const geq = totalMb(b.c) >= totalMb(a.c) && b.c.validity_days >= a.c.validity_days && b.c.retail_eur_cents <= a.c.retail_eur_cents;
    if (!geq) return false;
    const strictly = totalMb(b.c) > totalMb(a.c) || b.c.validity_days > a.c.validity_days || b.c.retail_eur_cents < a.c.retail_eur_cents;
    return strictly || bi < ai;
  };
  const kept = picked.filter((p, ai) => !picked.some((q, bi) => dominates(q, p, bi, ai)));

  // BADGES ARE FACTS, computed from the plans on the shelf — never a claim
  // about shoppers ("Most chosen" on a shelf nothing has been sold from yet
  // would be invented social proof):
  //   best_value  the lowest price per GB on the shelf
  //   long_stay   ≥ 10 GB and ≥ 30 days
  //   short_trip  ≤ 10 days
  const perGb = (c: Candidate) => c.retail_eur_cents / Math.max(1, totalMb(c) / 1024);
  const cheapestPerGb = kept.length > 1 ? kept.reduce((m, p) => (perGb(p.c) < perGb(m.c) ? p : m)) : null;
  const badgeFor = (p: (typeof kept)[number]): Pick["badge"] | null => {
    if (p === cheapestPerGb) return "best_value";
    if (totalMb(p.c) >= 10000 && p.c.validity_days >= 30) return "long_stay";
    if (p.c.validity_days <= 10) return "short_trip";
    return null;
  };

  return kept
    .sort((a, b) => a.c.retail_eur_cents - b.c.retail_eur_cents)
    .map((p, i) => ({ planId: p.planId, badge: badgeFor(p), sort: (i + 1) * 10 }));
}
