import 'server-only';
import { DEFAULT_CONTENT, type SiteContent } from './defaults';
import { createClient } from './supabase/server';

export { DEFAULT_CONTENT };
export type { SiteContent };
export type { HeroContent, StatItem, FleetItem, PricingRow, ContactContent, GalleryImage, TestimonialItem, SocialLinks, BrandingContent, AnnouncementContent, AnnouncementItem, MapLocation, WhatsAppNumber, PlannerActivity, RideRoute, VehicleCategory, UsefulContact, EventItem, Sponsor, TransportOption, GettingAroundContent, FaqItem, FaqContent, RecommendedPlace, RecommendedContent, ExperienceContent, PromoSlide } from './defaults';

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
    testimonials: parsed.testimonials ?? DEFAULT_CONTENT.testimonials,
    social: { ...DEFAULT_CONTENT.social, ...(parsed.social ?? {}) },
    branding: { ...DEFAULT_CONTENT.branding, ...(parsed.branding ?? {}) },
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
    experience: { ...DEFAULT_CONTENT.experience, ...(parsed.experience ?? {}) },
  };
}

// ── Storage: Supabase `site_content` table (single row, id = 'main') ──
// Replaces Vercel KV / content.json so the admin "Save Changes" works
// reliably on the deployed site, consistent with every other table.

export async function getContent(): Promise<SiteContent> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('site_content')
      .select('data')
      .eq('id', 'main')
      .maybeSingle();
    if (data?.data) return mergeWithDefaults(data.data as Partial<SiteContent>);
  } catch {
    /* fall through to defaults */
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent;
}

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
