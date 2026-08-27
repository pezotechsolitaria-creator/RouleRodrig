// ── WHICH PARTS OF THE SITE ARE WORKING, AND WHICH ARE NOT ──────────────────
//
// PostHog has been recording $pageview since it was installed. Nothing has ever
// read it back: lib/posthog-health.ts asks only "did ANY event arrive", which
// answers "is the pipe blocked" and nothing about the business.
//
// ── WHY THIS IS NOT JUST A LIST OF POPULAR URLS ─────────────────────────────
//
// Two things make a raw pageview table useless to somebody running a
// marketplace:
//
//  1. IDs. /deliver/8f3c-…, /shop/product/…, /events/…/scan — every request,
//     product and ticket is its own row, so the busiest PAGE is buried under a
//     thousand rows of one view each. Paths are normalised to their shape.
//
//  2. Views are not the point. A page can be the most visited on the site and
//     earn nothing. The owner's actual question is "where is attention going,
//     and does it turn into anything" — so views are paired with the enquiries
//     recorded in lead_events, and a section that gets looked at and never
//     acted on is the finding, not a footnote.
//
// Pure, and separate from the fetching, because the ranking IS the product here
// and a wrong answer looks exactly like a right one.

export type RawPageRow = {
  path: string;
  views: number;
  visitors: number;
};

export type SectionRow = {
  /** The part of the business, not the URL. */
  section: string;
  views: number;
  visitors: number;
  /** Enquiries recorded against this section, when the section produces any. */
  leads: number;
  /** Enquiries per hundred views. Null when the section cannot produce a lead. */
  leadsPerHundred: number | null;
  paths: string[];
};

// ── Every id-shaped segment, collapsed so a page is a page ─────────────────
//
// Deliberately NOT case-insensitive, and the reference branch demands a digit.
// The first version was `/…|[A-Z0-9]{6,10}/i` and it ate the site: "deliver",
// "scooter", "browse" and "events" are all six-to-ten letters, so /deliver
// normalised to /:id and every section collapsed into one. A rule for
// recognising machine identifiers has to be unable to recognise a word.
// A literal, not new RegExp(): built from strings, "\d" is a plain `d` to the
// JS parser long before the regex engine sees it, and /events/12345 quietly
// stopped matching.
//   uuid | 12345 | long lowercase hex | RR4F2A91 (uppercase AND has a digit)
const ID_LIKE =
  /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\d+|[0-9a-f]{16,}|(?=[A-Z0-9]*\d)[A-Z0-9]{6,10})$/;

/**
 * Prefixes whose children are CONTENT, so a long hyphenated child there is one
 * article among many rather than a page in its own right.
 *
 * A whitelist rather than a rule about hyphens, because
 * /fr/location-scooter-rodrigues is a hand-written landing page and one of the
 * only crawlable French URLs on the site. Collapsing it to /fr/:slug would hide
 * the single most important fact about French traffic behind a placeholder.
 */
const CONTENT_PARENTS = new Set([
  "blog",
  "post",
  "posts",
  "product",
  "products",
]);

/**
 * A URL reduced to the page it is.
 *
 * `/shop/product/abc-123` and `/shop/product/def-456` are one page with two
 * products in it, and reporting them separately is how a real answer gets
 * split into noise.
 */
export function normalisePath(raw: string): string {
  let p = (raw || "/").split("?")[0].split("#")[0].trim();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (!p.startsWith("/")) p = "/" + p;
  const parts = p
    .split("/")
    .filter(Boolean)
    .map((seg, i, all) => {
      if (ID_LIKE.test(seg)) return ":id";
      // A long hyphenated name is content only when its PARENT says so.
      if (i > 0 && CONTENT_PARENTS.has(all[i - 1]) && seg.includes("-")) {
        return ":slug";
      }
      return seg;
    });
  return parts.length ? "/" + parts.join("/") : "/";
}

/**
 * Which part of the business a path belongs to.
 *
 * Ordered, and the order matters: /taxi/book is booking a ride, not browsing
 * the directory, and the owner needs those apart.
 */
const SECTIONS: { test: RegExp; section: string }[] = [
  { test: /^\/$/, section: "Home" },
  { test: /^\/deliver/, section: "Ti Roulé delivery" },
  { test: /^\/taxi\/book|^\/transfers/, section: "Taxi & transfer booking" },
  { test: /^\/taxi\/track/, section: "Ride tracking" },
  { test: /^\/taxi/, section: "Taxi directory" },
  { test: /^\/food/, section: "Food" },
  { test: /^\/shop|^\/cart|^\/checkout/, section: "Shop" },
  { test: /^\/browse\/scooter|^\/scooter/, section: "Scooters" },
  { test: /^\/browse\/car|^\/car/, section: "Cars" },
  { test: /^\/browse\/stays?|^\/stays?/, section: "Stays" },
  { test: /^\/experiences?/, section: "Experiences" },
  { test: /^\/events|^\/tickets/, section: "Events & tickets" },
  { test: /^\/guide|^\/map|^\/planner/, section: "Guides & planning" },
  { test: /^\/order/, section: "Order hub" },
  { test: /^\/blog/, section: "Blog" },
  { test: /^\/fr\//, section: "French landing pages" },
  {
    test: /^\/more|^\/account|^\/legal|^\/emergency/,
    section: "Help & account",
  },
];

export function sectionOf(path: string): string {
  const p = normalisePath(path);
  for (const s of SECTIONS) if (s.test.test(p)) return s.section;
  return "Other";
}

/** Which lead kinds belong to which section, so a rate can be honest. */
const SECTION_LEAD_KINDS: Record<string, string[]> = {
  "Taxi directory": ["taxi"],
  "Taxi & transfer booking": ["transfer"],
  Food: ["food_concierge"],
  "Guides & planning": ["stay_eat_do"],
  Home: ["tiroule_miss"],
};

/**
 * Roll raw paths up into sections, attach enquiries, and rank.
 *
 * `leadsByKind` comes from lead_events. A section with no lead kind gets null
 * rather than zero — "we do not measure this" and "nobody enquired" are
 * different facts and showing 0% for the first is a lie that costs decisions.
 */
export function rollUp(
  rows: RawPageRow[],
  leadsByKind: Record<string, number> = {},
): SectionRow[] {
  const byS = new Map<string, SectionRow>();
  for (const r of rows) {
    const section = sectionOf(r.path);
    const cur = byS.get(section) ?? {
      section,
      views: 0,
      visitors: 0,
      leads: 0,
      leadsPerHundred: null,
      paths: [],
    };
    cur.views += Math.max(0, r.views || 0);
    // Visitors do not truly add across paths — the same person visits several.
    // Summing would overcount, so this is the largest single path's visitors:
    // a floor, never an inflated number.
    cur.visitors = Math.max(cur.visitors, Math.max(0, r.visitors || 0));
    const norm = normalisePath(r.path);
    if (!cur.paths.includes(norm)) cur.paths.push(norm);
    byS.set(section, cur);
  }

  for (const row of byS.values()) {
    const kinds = SECTION_LEAD_KINDS[row.section];
    if (!kinds) continue;
    row.leads = kinds.reduce((a, k) => a + (leadsByKind[k] ?? 0), 0);
    row.leadsPerHundred =
      row.views > 0 ? Math.round((row.leads / row.views) * 1000) / 10 : 0;
  }

  return [...byS.values()].sort((a, b) => b.views - a.views);
}

export type PageReport = {
  windowDays: number;
  totalViews: number;
  sections: SectionRow[];
  busiest: SectionRow[];
  quietest: SectionRow[];
  /** Looked at a lot, acted on rarely. The reason to open this screen. */
  attentionWithoutAction: SectionRow[];
};

/**
 * The report the owner reads.
 *
 * `quietest` deliberately EXCLUDES sections with no views at all: a page nobody
 * has reached is usually a page nobody can reach — a navigation problem, not a
 * content one — and mixing the two hides both.
 */
export function buildReport(
  rows: RawPageRow[],
  leadsByKind: Record<string, number>,
  windowDays: number,
): PageReport {
  const sections = rollUp(rows, leadsByKind);
  const totalViews = sections.reduce((a, s) => a + s.views, 0);
  const seen = sections.filter((s) => s.views > 0);

  return {
    windowDays,
    totalViews,
    sections,
    busiest: seen.slice(0, 5),
    quietest: [...seen].reverse().slice(0, 5),
    attentionWithoutAction: seen
      .filter(
        (s) =>
          s.leadsPerHundred !== null &&
          s.leads === 0 &&
          s.views >= Math.max(20, totalViews * 0.02),
      )
      .sort((a, b) => b.views - a.views),
  };
}

/**
 * The HogQL that fetches it.
 *
 * Grouped and counted in PostHog rather than pulled row by row: this must stay
 * cheap enough to run on an admin page load, and no customer data crosses the
 * wire in either direction — only paths and counts.
 */
export function buildPageviewQuery(windowDays: number, limit = 200): string {
  const days = Math.max(1, Math.min(365, Math.round(windowDays)));
  const cap = Math.max(1, Math.min(1000, Math.round(limit)));
  return [
    "SELECT properties.$pathname AS path,",
    "       count() AS views,",
    "       count(DISTINCT person_id) AS visitors",
    "FROM events",
    "WHERE event = '$pageview'",
    `  AND timestamp >= now() - INTERVAL ${days} DAY`,
    "  AND properties.$pathname IS NOT NULL",
    "GROUP BY path",
    "ORDER BY views DESC",
    `LIMIT ${cap}`,
  ].join("\n");
}

/** PostHog answers with positional arrays. Turn them into rows, defensively. */
export function parseResults(results: unknown): RawPageRow[] {
  if (!Array.isArray(results)) return [];
  const out: RawPageRow[] = [];
  for (const r of results) {
    if (!Array.isArray(r) || r.length < 3) continue;
    const path = typeof r[0] === "string" ? r[0] : "";
    if (!path) continue;
    out.push({
      path,
      views: Number(r[1]) || 0,
      visitors: Number(r[2]) || 0,
    });
  }
  return out;
}
