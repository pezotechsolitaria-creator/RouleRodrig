import 'server-only';
import { DEFAULT_CONTENT, type SiteContent } from './defaults';
import { createClient } from './supabase/server';

export { DEFAULT_CONTENT };
export type { SiteContent };
export type { HeroContent, StatItem, FleetItem, PricingRow, ContactContent, GalleryImage, TestimonialItem, SocialLinks, BrandingContent, AnnouncementContent, MapLocation, WhatsAppNumber } from './defaults';

function mergeWithDefaults(parsed: Partial<SiteContent>): SiteContent {
  // Ensure existing fleet items have the new `available` field
  const fleet = (parsed.fleet ?? DEFAULT_CONTENT.fleet).map((s) => ({
    ...s,
    available: s.available ?? true,
  }));
  return {
    hero: { ...DEFAULT_CONTENT.hero, ...(parsed.hero ?? {}) },
    stats: parsed.stats ?? DEFAULT_CONTENT.stats,
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
  const supabase = await createClient();
  const { error } = await supabase
    .from('site_content')
    .upsert({ id: 'main', data: content, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// Kept for backward-compat with callers; uploads now go to Supabase Storage.
export function ensureUploadsDir(): void {
  /* no-op — image uploads are stored in Supabase Storage */
}
