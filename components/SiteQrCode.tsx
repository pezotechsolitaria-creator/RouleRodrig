import { QR_TARGET, QR_ASSETS } from "@/lib/qr";

// ── THE SITE'S OWN QR CODE, ON THE SITE ─────────────────────────────────────
//
// A server component with no JavaScript and no client dependency: it renders an
// <img> pointing at a file that already exists in /public. Nothing is generated
// at request time, so the code on the screen is byte-identical to the one on
// the sticker — which is the whole point of committing the artwork.
//
// Deliberately a plain <img> rather than next/image. next/image would need
// dangerouslyAllowSVG turned on for the vector version, and would then
// re-encode a 6 KB file through the optimiser for no gain. A static square with
// explicit width and height causes no layout shift either way.

type Props = {
  /**
   * "branded" carries the island logo — the one to show a customer.
   * "clean" is plain black and white, which is what a printer wants.
   */
  variant?: "branded" | "clean";
  /** Rendered size in pixels. The file itself is resolution-independent. */
  size?: number;
  /** A short line under the code. Omit for a bare code. */
  caption?: string;
  className?: string;
};

export default function SiteQrCode({
  variant = "branded",
  size = 200,
  caption,
  className = "",
}: Props) {
  // Paths come from lib/qr.ts so a renamed file breaks the test rather than
  // rendering a broken image nobody notices until a customer mentions it.
  const src = QR_ASSETS[variant].svg;

  return (
    <figure className={`flex flex-col items-center gap-3 ${className}`}>
      {/* White plate, always. The code is black on white and the site is dark:
          printing it straight onto the dark background would leave a decoder
          hunting for an edge that is not there. */}
      <div className="rounded-2xl bg-white p-3 shadow-lg shadow-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element --
            next/image would need dangerouslyAllowSVG enabled globally to serve
            the vector, and would then push a 6 KB static file through the
            optimiser for no gain. Width and height are fixed, so there is no
            layout shift and nothing for LCP to lose. */}
        <img
          src={src}
          alt={`QR code — scan it to open ${QR_TARGET.replace(/^https:\/\//, "").replace(/\/$/, "")}`}
          width={size}
          height={size}
          // Square by construction, so the browser reserves the right box
          // before the file arrives and nothing jumps.
          style={{ width: size, height: size, display: "block" }}
          loading="lazy"
          decoding="async"
        />
      </div>

      {caption && (
        <figcaption className="max-w-[16rem] text-center font-dm text-xs leading-snug text-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
