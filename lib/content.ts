import 'server-only';
import { cache } from 'react';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_CONTENT, DEFAULT_QUICK_ACCESS, DEFAULT_HOME_CARDS, type SiteContent } from './defaults';
import { migrateQuickAccess, migrateHomeCards } from './quick-access';

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

export async function getContent(): Promise<SiteContent> {
  return (await getContentWithStatus()).content;
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
async function readContentUncached(): Promise<{ content: SiteContent; loaded: boolean }> {
  try {
    const supabase = publicReadClient();
    const { data, error } = await supabase
      .from('site_content')
      .select('data')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw error;
    if (data?.data) {
      return { content: mergeWithDefaults(data.data as Partial<SiteContent>), loaded: true };
    }
    // No row yet — a genuine first run, not a failure.
    return { content: JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent, loaded: true };
  } catch {
    return { content: JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent, loaded: false };
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

export async function saveContent(content: SiteContent): Promise<void> {
  // Writes go through the privileged client so site_content can be locked to
  // read-only for the public anon role (prevents site defacement).
  const { getPrivileged } = await import('./supabase/admin');
  const supabase = await getPrivileged();
  const { error } = await supabase
    .from('site_content')
    .upsert({ id: 'main', data: content, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// Kept for backward-compat with callers; uploads now go to Supabase Storage.
export function ensureUploadsDir(): void {
  /* no-op — image uploads are stored in Supabase Storage */
}
