import type { SiteContent, MapLocation, RecommendedPlace, RideRoute, FleetItem, FaqItem, UsefulContact } from "@/lib/defaults";
import { SERVICE_TYPES } from "@/lib/defaults";
import { loc } from "@/lib/localize";
import { placeHref } from "@/lib/place-href";
import { vehicleHref, vehicleName } from "@/lib/vehicle-slug";
import { isSellableFleetItem, vehiclePriceNumber } from "@/lib/site-data";
import { EXPERIENCES } from "@/lib/experiences";
import { centsToShortString } from "@/lib/money";
import { STATIC_PAGES } from "./pages";
import { TRAVEL_SYNONYMS } from "./aliases";
import { normalize } from "./normalize";
import { SEARCH_INDEX_VERSION, type SearchDoc, type SearchIndex, type SearchKind, type SearchLang } from "./types";

// ── Building the search index ────────────────────────────────────────────────
//
// PURE: content in, index out. The IO — reading site_content, events, dishes
// and the synonym table — is the route's job (app/api/search-index), so this
// can be tested against a fixture and cannot drift from what the pages show.
//
// Every url comes from the SAME helper the site's own cards use (placeHref,
// vehicleHref, the guide anchors), so a search result lands exactly where a
// tap on that thing's card would. getContent() has already removed anything
// the owner hid, so hidden things cannot be found either.

/** Extra rows read from the database, next to site_content. */
export type SearchExtras = {
  events: { slug: string; name: string; tagline: string | null; venueName: string | null; startsAt: string }[];
  dishes: { slug: string; name: string; descriptor: string | null; descriptorFr: string | null; descriptorCr: string | null; kitchenName: string; price: number }[];
  /** search_synonyms rows (term ↔ alias). */
  synonyms: { term: string; alias: string }[];
};

/** Shorten to about n characters on a word boundary. */
export function clip(text: string | undefined | null, n = 110): string | undefined {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const at = cut.lastIndexOf(" ");
  return `${(at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/** The title in the index language first, then the other languages' names. */
function titles(lang: SearchLang, en?: string, fr?: string, cr?: string): string[] {
  const first = loc(lang, en, fr, cr).trim();
  const out = [first];
  for (const x of [en, fr, cr]) {
    const v = (x ?? "").trim();
    if (v && !out.some((o) => normalize(o) === normalize(v))) out.push(v);
  }
  return out.filter(Boolean);
}

const LOCATION_WORDS: Record<MapLocation["category"], string> = {
  beach: "beach plage laplaz swim",
  viewpoint: "viewpoint point de vue vi panorama",
  landmark: "landmark site monument visit",
  activity: "activity activite aktivite",
  restaurant: "restaurant food eat manger manze",
  gas: "fuel petrol essence delwil",
  shop: "shop craft artisanat boutique",
};

function locationKind(l: MapLocation): SearchKind {
  if (l.category === "beach") return "beach";
  if (l.category === "viewpoint") return "viewpoint";
  if (l.category === "restaurant") return "eat";
  if (l.category === "shop") return "shop";
  return "place";
}

/** Where a map place is read about: its guide section, else the map opened on it. */
export function locationUrl(l: MapLocation): string {
  if (l.category === "beach") return `/guide/beaches#${l.id}`;
  if (l.category === "viewpoint") return `/guide/viewpoints#${l.id}`;
  return `/map?loc=${encodeURIComponent(l.id)}`;
}

function placeKind(p: RecommendedPlace): SearchKind {
  if (p.category === "hotel") return "stay";
  if (p.category === "restaurant") return "eat";
  return "experience";
}

const PLACE_WORDS: Record<RecommendedPlace["category"], string> = {
  hotel: "stay hotel hebergement guest house lakaz room",
  restaurant: "restaurant food eat manger manze",
  activity: "activity tour excursion activite",
};

export function buildDocs(content: SiteContent, extras: SearchExtras, lang: SearchLang): SearchDoc[] {
  const docs: SearchDoc[] = [];

  for (const pg of STATIC_PAGES) {
    docs.push({ id: pg.id, k: pg.k, t: titles(lang, pg.t.en, pg.t.fr, pg.t.cr), d: pg.d[lang], w: pg.w, u: pg.u, b: pg.b });
  }

  for (const v of (content.fleet ?? []) as FleetItem[]) {
    if (!isSellableFleetItem(v)) continue;
    const n = vehiclePriceNumber(v as { price: string; category?: string });
    const cat = (v as { category?: string }).category ?? "scooter";
    docs.push({
      id: `veh:${v.id}`,
      k: "vehicle",
      t: [vehicleName(v)],
      d: clip(loc(lang, v.tagline, v.taglineFr, v.taglineCr) || loc(lang, v.description, v.descriptionFr, v.descriptionCr)),
      w: `${cat} ${cat === "car" ? "voiture loto" : "moto scooter"} rent location ${v.badge ?? ""}`,
      u: vehicleHref({ ...v, category: cat }),
      p: n ? `Rs ${n.toLocaleString("en-US")}${v.unit ? ` ${v.unit.replace(/\s+/g, " ").trim()}` : ""}` : undefined,
      b: v.available === false ? 0 : 0.3,
    });
  }

  for (const p of (content.recommended?.items ?? []) as RecommendedPlace[]) {
    if (!p.name?.trim()) continue;
    docs.push({
      id: `place:${p.id}`,
      k: placeKind(p),
      t: [p.name.trim()],
      d: clip(loc(lang, p.description, p.descriptionFr, p.descriptionCr)),
      w: `${PLACE_WORDS[p.category] ?? ""} ${p.isTour ? "tour guided guide" : ""} ${p.serviceType ?? ""}`.trim(),
      u: placeHref(p),
      p: p.priceNote?.trim() || undefined,
      b: p.featured ? 0.6 : 0,
    });
  }

  for (const t of SERVICE_TYPES) {
    const e = EXPERIENCES[t];
    if (!e) continue;
    docs.push({
      id: `exp:${t}`,
      k: "experience",
      t: titles(lang, e.title, e.titleFr),
      d: clip(lang === "fr" ? e.subtitleFr : e.subtitle),
      w: `${t} ${(e.filters ?? []).map((f) => `${f.label} ${f.labelFr}`).join(" ")}`,
      u: `/experiences/${t}`,
    });
  }

  for (const l of (content.mapLocations ?? []) as MapLocation[]) {
    if (!l.name?.trim()) continue;
    docs.push({
      id: `loc:${l.id}`,
      k: locationKind(l),
      t: titles(lang, l.name, l.nameFr, l.nameCr),
      d: clip(loc(lang, l.description, l.descriptionFr, l.descriptionCr)),
      w: LOCATION_WORDS[l.category],
      u: locationUrl(l),
      b: (l as { popular?: boolean }).popular ? 0.5 : 0,
    });
  }

  for (const r of (content.rideRoutes ?? []) as RideRoute[]) {
    if (!r.name?.trim()) continue;
    const hike = (r as { kind?: string }).kind === "hike";
    docs.push({
      id: `route:${r.id}`,
      k: "route",
      t: titles(lang, r.name, r.nameFr, r.nameCr),
      d: clip(loc(lang, r.description, r.descriptionFr, r.descriptionCr)),
      w: `${hike ? "hike hiking trail randonnee rando" : "ride route balade scooter"} ${(r.stops ?? "").replace(/\n/g, " ")}`,
      u: hike ? `/guide/hiking#${r.id}` : `/guide/routes#${r.id}`,
      p: [r.distance, r.duration].filter(Boolean).join(" · ") || undefined,
    });
  }

  const now = Date.now();
  for (const e of extras.events) {
    if (new Date(e.startsAt).getTime() < now - 12 * 3600_000) continue; // over
    const when = new Date(e.startsAt).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "short",
      timeZone: "Indian/Mauritius",
    });
    docs.push({
      id: `event:${e.slug}`,
      k: "event",
      t: [e.name],
      d: clip([e.tagline, e.venueName].filter(Boolean).join(" · ")),
      w: "event evenement festival",
      u: `/events/${e.slug}`,
      p: when,
    });
  }

  for (const f of extras.dishes) {
    docs.push({
      id: `dish:${f.slug}`,
      k: "eat",
      t: [f.name],
      d: clip([loc(lang, f.descriptor ?? undefined, f.descriptorFr ?? undefined, f.descriptorCr ?? undefined), f.kitchenName].filter(Boolean).join(" · ")),
      w: `food dish plat manze ${f.kitchenName}`,
      u: `/food/${f.slug}`,
      // Dish prices are CENTS; formatted exactly as the food card does.
      p: f.price > 0 ? `Rs ${centsToShortString(f.price)}` : undefined,
    });
  }

  for (const q of (content.faq?.items ?? []) as FaqItem[]) {
    const question = loc(lang, q.question, (q as { questionFr?: string }).questionFr, (q as { questionCr?: string }).questionCr);
    if (!question.trim()) continue;
    docs.push({
      id: `faq:${q.id}`,
      k: "help",
      t: titles(lang, q.question, (q as { questionFr?: string }).questionFr, (q as { questionCr?: string }).questionCr),
      d: clip(loc(lang, q.answer, (q as { answerFr?: string }).answerFr, (q as { answerCr?: string }).answerCr)),
      w: "faq question help aide",
      u: `/faq#faq-q-${q.id}`,
    });
  }

  for (const c of (content.usefulContacts ?? []) as UsefulContact[]) {
    if (!c.label?.trim()) continue;
    docs.push({
      id: `contact:${c.id}`,
      k: "help",
      t: [c.label.trim()],
      d: clip(c.note),
      w: `${c.category} ${c.category === "emergency" ? "urgence ijans police hospital" : c.category === "taxi" ? "taxi cab" : ""} phone numero`,
      u: `/emergency#contact-${c.id}`,
      p: c.number?.trim() || undefined,
    });
  }

  // One entry per id AND per destination, first wins: two fleet rows named
  // "AVENIS 125cc" share one page, and must not show as two results.
  const seen = new Set<string>();
  return docs.filter((d) => {
    const keys = [`id:${d.id}`, `u:${d.u}`];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

/** Join synonym pairs and groups into disjoint groups (union–find). */
export function synonymGroups(pairs: { term: string; alias: string }[], groups: string[][] = TRAVEL_SYNONYMS): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const union = (a: string, b: string) => {
    add(a);
    add(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const g of groups) {
    const ws = g.map(normalize).filter(Boolean);
    ws.forEach((w) => add(w));
    for (let i = 1; i < ws.length; i++) union(ws[0], ws[i]);
  }
  for (const p of pairs) {
    const a = normalize(p.term);
    const b = normalize(p.alias);
    if (a && b && a !== b) union(a, b);
  }
  const byRoot = new Map<string, string[]>();
  for (const w of parent.keys()) {
    const r = find(w);
    byRoot.set(r, [...(byRoot.get(r) ?? []), w]);
  }
  return [...byRoot.values()].filter((g) => g.length > 1);
}

export function buildIndex(content: SiteContent, extras: SearchExtras, lang: SearchLang, at = new Date()): SearchIndex {
  return {
    v: SEARCH_INDEX_VERSION,
    lang,
    at: at.toISOString(),
    docs: buildDocs(content, extras, lang),
    syn: synonymGroups(extras.synonyms),
  };
}
