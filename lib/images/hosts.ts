// ── WHICH HOSTS THE IMAGE OPTIMISER IS ALLOWED TO TOUCH ─────────────────────
//
// ONE list, imported by next.config.ts (which turns it into remotePatterns) and
// by SmartImage (which decides per URL). Two copies would drift, and the way
// they drift is silent: next/image THROWS on a host it was not configured for,
// so the failure is a crashed page rather than a slow one.
//
// No imports on purpose — next.config.ts loads this before the app exists.

export const OPTIMISABLE_IMAGE_HOSTS = [
  "*.public.blob.vercel-storage.com",
  "*.supabase.co",
  "api.qrserver.com",
  // Our own domain. The content blob holds two image URLs served from it, and
  // they were NOT covered before: any component converted to next/image while
  // rendering one of those would have thrown on a live page.
  "roulerodrig.com",
  "www.roulerodrig.com",
] as const;

/**
 * Does this URL point somewhere the optimiser is configured for?
 *
 * Anything else — a merchant pasting a link, an image URL typed into the
 * content studio, a host added to the database but not to this list — must
 * fall back to a plain <img>. Slower is a cost; a thrown error is a blank page.
 */
export function canOptimise(src: string | null | undefined): boolean {
  if (!src) return false;
  // A relative path is served by us and is always fine.
  if (src.startsWith("/")) return true;
  if (src.startsWith("data:") || src.startsWith("blob:")) return false;

  let host: string;
  try {
    host = new URL(src).hostname.toLowerCase();
  } catch {
    return false;
  }

  return OPTIMISABLE_IMAGE_HOSTS.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1).toLowerCase(); // ".supabase.co"
      return host.endsWith(suffix);
    }
    return host === pattern.toLowerCase();
  });
}
