import 'server-only';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { DEFAULT_CONTENT, type SiteContent } from './defaults';

export { DEFAULT_CONTENT };
export type { SiteContent };
export type { HeroContent, StatItem, FleetItem, PricingRow, ContactContent, GalleryImage, TestimonialItem, SocialLinks, BrandingContent } from './defaults';

const CONTENT_PATH = path.join(process.cwd(), 'content.json');

export function getContent(): SiteContent {
  try {
    if (existsSync(CONTENT_PATH)) {
      const raw = readFileSync(CONTENT_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SiteContent>;
      return {
        hero: { ...DEFAULT_CONTENT.hero, ...(parsed.hero ?? {}) },
        stats: parsed.stats ?? DEFAULT_CONTENT.stats,
        fleet: parsed.fleet ?? DEFAULT_CONTENT.fleet,
        pricing: parsed.pricing ?? DEFAULT_CONTENT.pricing,
        contact: { ...DEFAULT_CONTENT.contact, ...(parsed.contact ?? {}) },
        gallery: parsed.gallery ?? [],
        testimonials: parsed.testimonials ?? DEFAULT_CONTENT.testimonials,
        social: { ...DEFAULT_CONTENT.social, ...(parsed.social ?? {}) },
        branding: { ...DEFAULT_CONTENT.branding, ...(parsed.branding ?? {}) },
      };
    }
  } catch {
    // Fall through
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent;
}

export function saveContent(content: SiteContent): void {
  writeFileSync(CONTENT_PATH, JSON.stringify(content, null, 2), 'utf-8');
}

export function ensureUploadsDir(): void {
  const dir = path.join(process.cwd(), 'public', 'uploads');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
