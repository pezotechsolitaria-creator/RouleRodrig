import 'server-only';
import { cache } from 'react';
import { unstable_cache, revalidateTag, revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_CONTENT, DEFAULT_QUICK_ACCESS, DEFAULT_HOME_CARDS, type SiteContent } from './defaults';
import { migrateQuickAccess, migrateHomeCards } from './quick-access';
import { CONTENT_CONFLICT_MESSAGE } from './admin/content-version';

// Cookie-free public read client. site_content ('main') is public-readable, so
// reading it without cookies lets every page that calls getContent be cached
// (ISR) instead of being forced dynamic by the cookie-based SSR client.
function publicReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export { DEFAULT_CONTENT };
export type { SiteContent };
export type { HeroContent, StatItem, FleetItem, PricingRow, ContactContent, GalleryImage, TestimonialItem, SocialLinks, BrandingContent, AnnouncementContent, AnnouncementItem, MapLocation, WhatsAppNumber, PlannerActivity, RideRoute, VehicleCategory, VehicleType, UsefulContact, EventItem, Sponsor, TransportOption, GettingAroundContent, FaqItem, FaqContent, RecommendedPlace, RecommendedContent, FoodConciergeContent, FoodConciergeStep, ExperienceContent, PromoSlide } from './defaults';

function mergeWithDefaults(parsed: Partial<SiteContent>): SiteContent {
  // Ensure existing fleet items have the new `available` field
  const fleet = (parsed.fleet ?? DEFAULT_CONTENT.fleet).map((s) => ({
    ...s,
    available: s.available ?? true,
    units: s.units ?? 1,
    category: s.category ?? "scooter",
    images: s.images ?? [],
  }));
  return {
    hero: { ...DEFAULT_CONTENT.hero, ...(parsed.hero ?? {}) },
    stats: parsed.stats ?? DEFAULT_CONTENT.stats,
    promoSlides: parsed.promoSlides ?? DEFAULT_CONTENT.promoSlides,
    fleet,
    pricing: parsed.pricing ?? DEFAULT_CONTENT.pricing,
    contact: {
      ...DEFAULT_CONTENT.contact,
      ...(parsed.contact ?? {}),
      // new multi-number field — default to [] for older saved content
      whatsappNumbers: parsed.contact?.whatsappNumbers ?? DEFAULT_CONTENT.contact.whatsappNumbers ?? [],
    },
    gallery: parsed.gallery ?? [],
    galleryEnabled: parsed.galleryEnabled ?? DEFAULT_CONTENT.galleryEnabled ?? true,
    testimonials: parsed.testimonials ?? DEFAULT_CONTENT.testimonials,
    social: { ...DEFAULT_CONTENT.social, ...(parsed.social ?? {}) },
    branding: { ...DEFAULT_CONTENT.branding, ...(parsed.branding ?? {}) },
    // MUST be listed here. This merge is a whitelist, not a spread of `parsed`,
    // so a key that is missing from it is silently dropped on every read — the
    // legal block would be saved and then never seen again.
    legal: { ...(DEFAULT_CONTENT.legal ?? {}), ...(parsed.legal ?? {}) },
    terms: { ...(DEFAULT_CONTENT.terms ?? {}), ...(parsed.terms ?? {}) },
    refunds: { ...(DEFAULT_CONTENT.refunds ?? {}), ...(parsed.refunds ?? {}) },
    announcement: { ...DEFAULT_CONTENT.announcement, ...(parsed.announcement ?? {}) },
    mapLocations: parsed.mapLocations ?? DEFAULT_CONTENT.mapLocations,
    plannerActivities:
      parsed.plannerActivities && parsed.plannerActivities.length > 0
        ? parsed.plannerActivities
        : DEFAULT_CONTENT.plannerActivities,
    rideRoutes: parsed.rideRoutes ?? DEFAULT_CONTENT.rideRoutes,
    vehicleCategories: parsed.vehicleCategories ?? DEFAULT_CONTENT.vehicleCategories,
    usefulContacts: parsed.usefulContacts ?? DEFAULT_CONTENT.usefulContacts,
    events: parsed.events ?? DEFAULT_CONTENT.events,
    sponsorsEnabled: parsed.sponsorsEnabled ?? DEFAULT_CONTENT.sponsorsEnabled,
    sponsors: parsed.sponsors ?? DEFAULT_CONTENT.sponsors,
    gettingAround: {
      ...DEFAULT_CONTENT.gettingAround,
      ...(parsed.gettingAround ?? {}),
      options: parsed.gettingAround?.options ?? DEFAULT_CONTENT.gettingAround.options,
    },
    faq: {
      ...DEFAULT_CONTENT.faq,
      ...(parsed.faq ?? {}),
      items: parsed.faq?.items ?? DEFAULT_CONTENT.faq.items,
    },
    recommended: {
      ...DEFAULT_CONTENT.recommended,
      ...(parsed.recommended ?? {}),
      items: parsed.recommended?.items ?? DEFAULT_CONTENT.recommended.items,
    },
    foodConcierge: {
      ...DEFAULT_CONTENT.foodConcierge,
      ...(parsed.foodConcierge ?? {}),
      steps:
        parsed.foodConcierge?.steps && parsed.foodConcierge.steps.length > 0
          ? parsed.foodConcierge.steps
          : DEFAULT_CONTENT.foodConcierge.steps,
    },
    experience: { ...DEFAULT_CONTENT.experience, ...(parsed.experience ?? {}) },
    quickAccess: migrateQuickAccess(parsed.quickAccess) ?? DEFAULT_QUICK_ACCESS,
    homeCards: migrateHomeCards(parsed.homeCards) ?? DEFAULT_HOME_CARDS,
  };
}

// ── Storage: Supabase `site_content` table (single row, id = 'main') ──
// Replaces Vercel KV / content.json so the admin "Save Changes" works
// reliably on the deployed site, consistent with every other table.

/** Cache key for the public read; saveContent() invalidates it. */
const CONTENT_TAG = 'site-content';

/**
 * The public read, cached ACROSS requests — the single largest egress saving
 * available to this project.
 *
 * The row is 148,807 bytes and the logs showed `?select=data&id=eq.main` served
 * 7,825 times in the 24 hours to 6 Sep 2026: 1.16 GB a day, ~35 GB a month,
 * against a 5 GB free-plan allowance. It is also barely written — 23 saves in
 * three months — so serving a fresh copy to every visitor bought nothing.
 *
 * THROWS rather than returns on a failed read, because unstable_cache stores
 * whatever it is handed: caching a DB blip would pin the seed defaults over the
 * live site for the whole revalidate window. A throw is not cached, so the very
 * next request retries.
 */
function readPublicContentAt(version: string): Promise<SiteContent> {
  return unstable_cache(
    async (): Promise<SiteContent> => {
      const { content, loaded } = await readContentUncached();
      if (!loaded) throw new Error('site_content could not be read');
      return content;
    },
    // ── THE VERSION IS PART OF THE KEY ───────────────────────────────────
    // That is the whole guard. A write changes updated_at, updated_at changes
    // this key, a new key has no cached entry, and the next read fetches the
    // real blob. Nobody has to remember to invalidate anything.
    ['site-content-main', version],
    { tags: [CONTENT_TAG], revalidate: 3600 },
  )();
}

/**
 * ── THE CACHE GUARD ────────────────────────────────────────────────────────
 *
 * saveContent() calls revalidateTag() and the site updates instantly. That
 * works perfectly and protects nothing: it only fires for writes that came
 * through the admin route.
 *
 * A write that arrives any other way — a psql session, a migration, an
 * assistant with database access marking seven places popular — leaves the
 * public site serving the old blob for up to an hour, with NO SIGNAL. The data
 * is right, every page is wrong, and nothing anywhere says so. That is not a
 * hypothetical: it is exactly what happened on 7 Sep 2026, and the write was
 * mine.
 *
 * ── WHY NOT A CRON ─────────────────────────────────────────────────────────
 * The obvious fix, and the wrong one here. vercel.json is at THREE crons and a
 * fourth makes every deployment fail before it builds (see
 * m-vercel-cron-cap). All three run daily, so folding a check into one would
 * have given a WORSE guarantee than the hourly expiry it was meant to fix — a
 * guard that guards nothing.
 *
 * ── WHAT THIS COSTS ────────────────────────────────────────────────────────
 * One extra query per window, selecting a single timestamp: about thirty bytes
 * against the 148 kB blob beside it. The blob itself is still cached for an
 * hour, so the egress saving this file exists for — 35 GB/month down to almost
 * nothing — is untouched.
 *
 * The real cost is that content-backed pages now regenerate on this window
 * rather than hourly. Fifteen minutes is the trade: four times the ISR
 * regenerations for a quarter-hour worst case instead of sixty minutes, on a
 * site whose pages are cheap to render and whose blob no longer moves when
 * they do.
 */
const CONTENT_VERSION_WINDOW_SECONDS = 900;

const readContentVersion = unstable_cache(
  async (): Promise<string> => {
    const supabase = publicReadClient();
    const { data, error } = await supabase
      .from('site_content')
      .select('updated_at')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw error;
    // No row is a real answer — a first run — and a stable one, so it caches.
    return String(data?.updated_at ?? 'empty');
  },
  ['site-content-version'],
  { tags: [CONTENT_TAG], revalidate: CONTENT_VERSION_WINDOW_SECONDS },
);

/**
 * Strip everything the owner has hidden.
 *
 * ── WHY THIS IS ONE FUNCTION AND NOT SIXTY-ONE FILTERS ──────────────────────
 * `content.recommended.items` is read at 61 places outside /admin — browse
 * pages, the experiences hub, /explore, the sitemap, schema builders, place
 * detail pages. Adding `.filter(p => !p.hidden)` to each is a list nobody can
 * keep complete, and the failure mode is silent: one missed call site and a
 * listing the owner believes is down is still on the site, still bookable,
 * still in the sitemap.
 *
 * So it happens once, at the door. getContent() is what the public site reads
 * through; getContentWithStatus() is what /admin reads through and is
 * deliberately NOT filtered, because an editor has to see a hidden row to
 * un-hide it. lib/content-cache.test.ts already pins that split.
 */
/**
 * Every top-level array whose items can be individually hidden.
 *
 * Listed rather than inferred: a key added here is a promise that the public
 * site filters it, and a silent "we filter anything with a .hidden" rule would
 * quietly start filtering a list nobody intended.
 */
const HIDEABLE_LISTS = [
  "fleet",
  "gallery",
  "testimonials",
  "mapLocations",
  "plannerActivities",
  "rideRoutes",
  "usefulContacts",
] as const;

export function withoutHidden(content: SiteContent): SiteContent {
  const out: Record<string, unknown> = { ...content };
  let changed = false;

  for (const key of HIDEABLE_LISTS) {
    const list = (content as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((it) => !(it as { hidden?: boolean })?.hidden);
    if (kept.length !== list.length) {
      out[key] = kept;
      changed = true;
    }
  }

  // recommended.items is nested, and it carries BOTH the Accommodations &
  // Activities listings and the Experiences ones — the same array, two editors.
  const items = content.recommended?.items;
  if (Array.isArray(items)) {
    const kept = items.filter((p) => !p.hidden);
    if (kept.length !== items.length) {
      out.recommended = { ...content.recommended, items: kept };
      changed = true;
    }
  }

  // The FAQ lives under faq.items on its own section object.
  const faq = (content as unknown as { faq?: { items?: { hidden?: boolean }[] } }).faq;
  if (Array.isArray(faq?.items)) {
    const kept = faq.items.filter((q) => !q.hidden);
    if (kept.length !== faq.items.length) {
      out.faq = { ...faq, items: kept };
      changed = true;
    }
  }

  // Nothing hidden: hand back the very same object. This runs on every public
  // request and the common case must not allocate a dozen arrays to change
  // nothing.
  return changed ? (out as unknown as SiteContent) : content;
}


/**
 * ── CODE MIGRATIONS RUN AFTER THE CACHE, NOT ONLY INSIDE IT ────────────────
 *
 * migrateQuickAccess() / migrateHomeCards() are CODE: they ship with a deploy.
 * The cached blob above is keyed on the ROW's updated_at, and Vercel's data
 * cache survives deploys — so a migration applied only inside parse() reached
 * the live site up to an hour late. Seen on 30 Sep 2026: the eSIM tile was
 * deployed, and the homepage went on showing Fishing from a blob cached by
 * the previous build.
 *
 * Both are pure, cheap and idempotent (lib/quick-access.test.ts runs them
 * twice), so re-applying them here costs nothing and makes a deploy the
 * moment a tile change goes live.
 */
function withCodeMigrations(content: SiteContent): SiteContent {
  return {
    ...content,
    quickAccess: migrateQuickAccess(content.quickAccess) ?? DEFAULT_QUICK_ACCESS,
    homeCards: migrateHomeCards(content.homeCards) ?? DEFAULT_HOME_CARDS,
  };
}

export async function getContent(): Promise<SiteContent> {
  // A FAILED VERSION READ MUST NOT COST A BLOB READ. Falling through to the
  // uncached path here would answer a database blip by fetching 148 kB on
  // every request until it recovered — the precise failure this file's egress
  // note was written about. A fixed key keeps the cached copy instead, which
  // is the same behaviour as before this guard existed.
  let version = 'unversioned';
  try {
    version = await readContentVersion();
  } catch {
    /* keep the fixed key */
  }

  try {
    return withCodeMigrations(withoutHidden(await readPublicContentAt(version)));
  } catch {
    // Uncached fallback, which has its own defaults-on-failure behaviour.
    // Filtered too — a database blip must not un-hide the owner's listings.
    return withoutHidden((await getContentWithStatus()).content);
  }
}

/**
 * Same read, but says whether the stored row was actually reached.
 *
 * WHY THIS EXISTS: getContent() swallows every failure and returns
 * DEFAULT_CONTENT, which is right for the public site (a DB blip shows the
 * seed copy instead of a broken page) and CATASTROPHIC for /admin — the editor
 * would render the defaults as if they were the owner's real content, and the
 * next "Save Changes" would write those defaults over the live site, silently
 * destroying every customisation. /admin must therefore refuse to save when
 * `loaded` is false.
 */
/**
 * `updatedAt` is the row's own timestamp, exactly as PostgREST printed it, or
 * null when there is no row yet.
 *
 * ── WHY THE EDITOR NEEDS IT (architecture review 2026-09-30, item 4) ────────
 * The studio PUTs the WHOLE blob, and four routes write this row: the studio,
 * the gallery, /admin/legal and the legal certificate. A studio tab opened
 * before a BRN was saved in /admin/legal used to put the old legal block back
 * on its next Save, silently. The studio now sends back the version it loaded,
 * and saveContent() refuses to write over a row that has moved since.
 */
async function readContentUncached(): Promise<{
  content: SiteContent;
  loaded: boolean;
  updatedAt: string | null;
}> {
  try {
    const supabase = publicReadClient();
    const { data, error } = await supabase
      .from('site_content')
      .select('data, updated_at')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw error;
    if (data?.data) {
      return {
        content: mergeWithDefaults(data.data as Partial<SiteContent>),
        loaded: true,
        updatedAt: data.updated_at == null ? null : String(data.updated_at),
      };
    }
    // No row yet — a genuine first run, not a failure.
    return { content: JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent, loaded: true, updatedAt: null };
  } catch {
    return { content: JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent, loaded: false, updatedAt: null };
  }
}

/**
 * ONE READ PER REQUEST, not one per caller.
 *
 * This row is 148,807 bytes on the wire — by far the largest payload the Data
 * API serves — and 68 call sites read it. Several pages read it TWICE in one
 * render, because generateMetadata() and the page body each ask independently.
 * Uncached, that billed 8,003 reads on 6 Sep 2026: about 1.19 GB in a day, or
 * roughly 36 GB a month against a 5 GB free-plan allowance.
 *
 * React's cache() dedupes within a single request only, so /admin still reads
 * its own writes on the next request and cannot serve a stale editor. Making
 * this survive ACROSS requests is the bigger win and needs saveContent() to
 * revalidate a tag — deliberately not done here, because getting that wrong
 * shows the owner a stale site with no way to tell.
 */
export const getContentWithStatus = cache(readContentUncached);

// The sentence the studio shows when its copy is older than the row. Kept in a
// client-safe module so the studio and this file cannot word it differently.
export { CONTENT_CONFLICT_MESSAGE };

/** Thrown by saveContent() when the row moved after the caller read it. */
export class ContentConflictError extends Error {
  constructor() {
    super(CONTENT_CONFLICT_MESSAGE);
    this.name = 'ContentConflictError';
  }
}

/**
 * Whether two updated_at strings name the same instant.
 *
 * Compared as instants, not as text: the same timestamptz can be printed as
 * "…33.12+00:00" or "…33.120000+00:00", and a text mismatch here would tell the
 * owner someone else had saved when nobody had. Microseconds are kept (Date
 * alone would drop them), because a write made in SQL with now() can land in
 * the same millisecond as the one the studio loaded.
 */
export function sameContentVersion(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  const key = (s: string) => {
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) return s.trim();
    const frac = (s.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(0, 6);
    return `${Math.floor(ms / 1000)}.${frac}`;
  };
  return key(a) === key(b);
}

/**
 * Write the whole blob. Returns the row's new updated_at.
 *
 * `expectedUpdatedAt` makes the write conditional (architecture review
 * 2026-09-30, item 4): the row is updated only while its updated_at is still
 * the one the caller read, in the same statement, so two tabs saving in the
 * same second cannot both win. A string is "the row must still be at this
 * version"; null is "there must be no row yet". Omitted keeps the old
 * unconditional upsert, which the legal, certificate and gallery routes still
 * use — each reads the row and writes it back within one request.
 */
export async function saveContent(
  content: SiteContent,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<{ updatedAt: string }> {
  // Writes go through the privileged client so site_content can be locked to
  // read-only for the public anon role (prevents site defacement).
  const { getPrivileged } = await import('./supabase/admin');
  const supabase = await getPrivileged();
  const now = new Date().toISOString();
  let updatedAt = now;

  if (typeof opts.expectedUpdatedAt === 'string') {
    const { data, error } = await supabase
      .from('site_content')
      .update({ data: content, updated_at: now })
      .eq('id', 'main')
      .eq('updated_at', opts.expectedUpdatedAt)
      .select('updated_at');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      // Zero rows has two causes, and only one is a conflict. A client that
      // cannot write at all (no service-role key: the anon fallback matches
      // nothing under RLS and reports no error) also updates zero rows, and
      // telling the owner "someone saved in another tab" would send him
      // looking for a tab that does not exist. So look before blaming.
      const { data: row } = await supabase
        .from('site_content')
        .select('updated_at')
        .eq('id', 'main')
        .maybeSingle();
      const current = row?.updated_at == null ? null : String(row.updated_at);
      if (!sameContentVersion(current, opts.expectedUpdatedAt)) throw new ContentConflictError();
      throw new Error('The content row was not written (no rows updated). Is SUPABASE_SERVICE_ROLE_KEY set?');
    }
    updatedAt = String((data[0] as { updated_at: unknown }).updated_at ?? now);
  } else {
    if (opts.expectedUpdatedAt === null) {
      // "There was no row when I loaded" — somebody may have created it since.
      const { data: row } = await supabase
        .from('site_content')
        .select('updated_at')
        .eq('id', 'main')
        .maybeSingle();
      if (row) throw new ContentConflictError();
    }
    const { data, error } = await supabase
      .from('site_content')
      .upsert({ id: 'main', data: content, updated_at: now })
      .select('updated_at');
    if (error) throw new Error(error.message);
    const first = (data ?? [])[0] as { updated_at?: unknown } | undefined;
    updatedAt = first?.updated_at == null ? now : String(first.updated_at);
  }

  // The write is the ONLY thing that can make the cached copy wrong, and this
  // is the only writer. { expire: 0 } because Next 16 requires a cache-life
  // profile and the owner pressing Save expects to see the site change, not to
  // wait out a window. updateTag() would be the newer spelling but is legal
  // only inside a Server Action, and this runs in a route handler.
  //
  // Guarded because revalidateTag throws outside a request scope, and a save
  // must not fail because the cache hint could not be delivered.
  try {
    revalidateTag(CONTENT_TAG, { expire: 0 });
  } catch (err) {
    console.error('content saved but the public cache was not revalidated', err);
  }
  return { updatedAt };
}

/**
 * Bust the ISR copies of every page that renders the content blob.
 *
 * Moved here from the content PUT (architecture review 2026-09-30, item 6) so
 * the history restore — the other route that replaces the whole blob — cannot
 * forget a path the studio save remembers. The homepage and /browse are not the
 * only content-backed routes: /faq, /explore, /map, /more, /trip-planner, the
 * guides and the /fr pages all read getContent() under an hour-long
 * revalidate, so an FAQ edit used to report "Saved!" while the public page
 * served stale copy for up to 60 minutes. A massage added in admin is served
 * from a 5-minute cache at /experiences/<type>; without that path the owner
 * saves, looks, sees nothing, and concludes the feature is broken.
 */
export function revalidateContentPages(): void {
  revalidatePath('/');
  revalidatePath('/browse/[category]', 'page');
  revalidatePath('/experiences/[type]', 'page');
  for (const p of ['/faq', '/explore', '/map', '/more', '/trip-planner', '/taxi', '/food', '/guide/rodrigues']) {
    revalidatePath(p);
  }
}

// Kept for backward-compat with callers; uploads now go to Supabase Storage.
export function ensureUploadsDir(): void {
  /* no-op — image uploads are stored in Supabase Storage */
}
