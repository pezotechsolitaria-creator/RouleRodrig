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
  className?: string;
  /** Above the fold: skip lazy-loading and hint the browser to fetch early. */
  priority?: boolean;
  /**
   * Which width the image will actually occupy, per breakpoint. Without it the
   * optimiser assumes the full viewport and serves a far bigger file than the
   * slot needs — which is most of what this component exists to stop.
   */
  sizes?: string;
} & (
  | { fill: true; width?: never; height?: never }
  | { fill?: false; width: number; height: number }
);

export default function SmartImage(props: Props) {
  const { src, alt, className, priority, sizes } = props;

  // A host nobody configured renders exactly what it renders today. `fill`
  // becomes plain CSS: these parents are already `relative` with a fixed
  // aspect, so absolute inset-0 puts the raw tag in the same box next/image
  // would have used.
  if (!canOptimise(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={props.fill ? undefined : props.width}
        height={props.fill ? undefined : props.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={props.fill ? `absolute inset-0 h-full w-full ${className ?? ""}` : className}
      />
    );
  }

  if (props.fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={className}
        priority={priority}
        // A last-resort default rather than none: omitting sizes under `fill`
        // makes Next warn and fall back to 100vw, which is the bug.
        sizes={sizes ?? "100vw"}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={props.width}
      height={props.height}
      className={className}
      priority={priority}
      sizes={sizes}
    />
  );
}
