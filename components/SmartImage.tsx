import Image from "next/image";
import { canOptimise } from "@/lib/images/hosts";

// ── next/image WHERE IT IS SAFE, <img> WHERE IT IS NOT ───────────────────────
//
// The public pages carried 48 raw <img> tags pointing at Supabase Storage, and
// a 612 kB original was being downloaded to fill a 36-pixel circle. next/image
// fixes that — it serves a resized WebP and, with minimumCacheTTL now set to a
// year, pulls each original out of Storage once instead of six times a day.
//
// It is not a safe blanket swap. next/image THROWS on a host that is not in
// remotePatterns, and these URLs are DATA: merchants paste them, the content
// studio stores them, and the blob already holds two served from roulerodrig.com
// which was never configured. Converting blind would have traded slow pages for
// blank ones.
//
// So the host decides. Known host, optimise it. Anything else renders exactly
// what it renders today. A component using this can never be crashed by a URL
// somebody typed.

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  /** Above the fold: skip lazy-loading and hint the browser to fetch early. */
  priority?: boolean;
  sizes?: string;
};

export default function SmartImage({ src, alt, width, height, className, priority, sizes }: Props) {
  if (!canOptimise(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={className}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      sizes={sizes}
    />
  );
}
