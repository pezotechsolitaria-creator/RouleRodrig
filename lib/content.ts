import 'server-only';
import { DEFAULT_CONTENT, type SiteContent } from './defaults';

export { DEFAULT_CONTENT };
export type { SiteContent };
export type { HeroContent, StatItem, FleetItem, PricingRow, ContactContent, GalleryImage, TestimonialItem, SocialLinks, BrandingContent } from './defaults';

// True when running on Vercel (KV env vars are auto-injected)
const IS_VERCEL = !!process.env.KV_REST_API_URL;

function mergeWithDefaults(parsed: Partial<SiteContent>): SiteContent {
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

export async function getContent(): Promise<SiteContent> {
  if (IS_VERCEL) {
    try {
      const { kv } = await import('@vercel/kv');
      const stored = await kv.get<Partial<SiteContent>>('site-content');
      if (stored) return mergeWithDefaults(stored);
    } catch {
      /* fall through to defaults */
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent;
  }

  // Local development — read from content.json
  try {
    const { readFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'content.json');
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<SiteContent>;
      return mergeWithDefaults(parsed);
    }
  } catch {
    /* fall through */
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent;
}

export async function saveContent(content: SiteContent): Promise<void> {
  if (IS_VERCEL) {
    const { kv } = await import('@vercel/kv');
    await kv.set('site-content', content);
    return;
  }
  const { writeFileSync } = await import('fs');
  const { join } = await import('path');
  writeFileSync(join(process.cwd(), 'content.json'), JSON.stringify(content, null, 2), 'utf-8');
}

export function ensureUploadsDir(): void {
  if (IS_VERCEL) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const dir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
