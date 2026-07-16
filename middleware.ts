import { NextRequest, NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/site';

// Canonical host, derived from NEXT_PUBLIC_SITE_URL so this can never disagree
// with the canonical tags, the sitemap or the JSON-LD — they all read the same
// env var. With the var unset (local dev) this equals the vercel.app host, so
// the redirect below is a no-op and nothing loops.
const CANONICAL_HOST = (() => {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return '';
  }
})();

// Adding a custom domain does NOT retire the .vercel.app alias — it keeps
// serving every page with a 200, so both hosts answer for the whole site and
// Google sees two copies of everything. Canonical tags say roulerodrig.com is
// the real one; this turns that hint into a hard 308 so the ranking signals
// actually move across instead of splitting.
//
// Only the exact production alias is redirected. Preview deployments
// (roule-rodrig-git-<branch>-*.vercel.app) must stay independently reachable —
// redirecting those would make every preview test the production site instead.
const RETIRED_HOSTS = new Set(['roule-rodrig.vercel.app']);

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase();

  if (CANONICAL_HOST && host !== CANONICAL_HOST && RETIRED_HOSTS.has(host)) {
    const url = new URL(req.url);
    url.protocol = 'https:';
    url.host = CANONICAL_HOST;
    url.port = '';
    // 308, not 307: permanent, and it preserves the method.
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const cookie = req.cookies.get('rr_admin');
    if (!cookie?.value) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  // Pages + SEO files (sitemap.xml, robots.txt) must redirect, so this can no
  // longer be /admin-only. /api is left alone: a stale client still posting to
  // the old host should succeed rather than be bounced, and APIs aren't
  // indexed. Next's own static assets are skipped for latency.
  matcher: ['/((?!api|_next/static|_next/image).*)'],
};
