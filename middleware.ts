import { NextRequest, NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/site';
import { updateSession } from '@/lib/supabase/middleware';
import { WORLD_COOKIE, WORLD_PAGE, parseWorld } from '@/lib/worlds';

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

export async function middleware(req: NextRequest) {
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

  // ── URLS PEOPLE GUESS, POINTED AT THE PAGES THAT ANSWER THEM ──────────────
  //
  // Neither of these was ever linked from the site, so no test could have
  // caught them: they are what somebody TYPES, or writes on a card, or shortens
  // a shared link to. /contact is the most guessed URL on any website and
  // /stays is the obvious short form of /browse/stays, and both returned the
  // not-found screen while the real thing sat one path segment away.
  //
  // Here rather than as redirect pages, because a page would then need an entry
  // in reachable-pages' ALLOWED_WITHOUT_LINKS explaining why nothing links to
  // it — and a redirect is not a page anybody should be linking to.
  //
  // Deliberately NOT a general "send them to the nearest match" rule. Every
  // entry is a guess somebody actually makes, aimed at a page that actually
  // exists; a fuzzy matcher would turn typos into confident wrong answers, and
  // a 404 that says "not found" is better than a page that says the wrong
  // thing convincingly.
  const GUESSED: Record<string, string> = {
    '/contact': '/#contact',
    '/stays': '/browse/stays',
    // /browse has six categories beneath it and no index. It stopped being a
    // broken LINK when /admin/marketplace was pointed at /shop, but it is still
    // a path somebody shortens a URL to. /explore is the page that actually
    // answers "show me what there is".
    '/browse': '/explore',
  };
  const guessed = GUESSED[pathname.replace(/\/+$/, '') || '/'];
  if (guessed) {
    // 307, not 308: these are conveniences, and pinning them into every
    // browser's cache permanently would make them impossible to change if
    // either destination ever moves.
    return NextResponse.redirect(new URL(guessed, req.url), 307);
  }

  // ── "/" ANSWERS WITH THE WORLD YOU CHOSE ───────────────────────────────────
  //
  // A visitor who has chosen Curated should land on Curated from every "home"
  // link on the site. That used to be done in a client effect, which meant the
  // homepage rendered and THEN bounced — a visible flash of the wrong world on
  // every visit.
  //
  // Here it happens before the page is built, so the wrong page is never
  // painted. It is also free for everyone else: no cookie, no redirect, and "/"
  // stays statically cached exactly as it was. Reading the cookie in the PAGE
  // would have opted the homepage out of ISR entirely; middleware does not.
  //
  // 307, not 308: this is a preference that changes the moment somebody presses
  // AUTHENTIC, and a permanently-cached redirect would strand them.
  if (pathname === '/') {
    const world = parseWorld(req.cookies.get(WORLD_COOKIE)?.value);
    if (world && WORLD_PAGE[world] !== '/') {
      return NextResponse.redirect(new URL(WORLD_PAGE[world], req.url), 307);
    }
  }

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const cookie = req.cookies.get('rr_admin');
    // The worlds studio has a SECOND door: an editor code that opens the worlds
    // that person looks after and nothing else (lib/worlds/access.ts). Two
    // consequences here, both deliberate:
    //
    //  · an editor's `rr_world` cookie is enough to pass this gate for
    //    /admin/worlds — and only for /admin/worlds;
    //  · with no cookie at all, /admin/worlds RENDERS rather than redirecting,
    //    because its own page is where an editor signs in. Bouncing them to
    //    /admin/login would send them to a password they do not have.
    //
    // This is a presence check, exactly as the line above always was. The
    // signature is verified in the page and in every API route it calls;
    // middleware runs on the edge, where the node crypto that verification
    // needs is not available.
    const isWorlds = pathname === '/admin/worlds' || pathname.startsWith('/admin/worlds/');
    if (!cookie?.value && !isWorlds) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
  }

  // Marketplace merchant area — Supabase Auth. Session refresh is scoped here so
  // the tourism site keeps its account-less behaviour and pays no auth cost.
  if (pathname.startsWith('/merchant')) {
    const { response, user } = await updateSession(req);
    if (!user && !pathname.startsWith('/merchant/login')) {
      return NextResponse.redirect(new URL('/merchant/login', req.url));
    }
    return response;
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
