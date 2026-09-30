import Link from "next/link";

// ── THE DOOR INTO THE FRENCH SIDE OF THE SITE (M153) ────────────────────────
//
// Search Console, 2026-08-29, URL Inspection on the French pages:
//
//   /fr/location-voiture-rodrigues   URL is unknown to Google
//   /fr/hebergement-rodrigues        URL is unknown to Google
//   /fr/que-faire-a-rodrigues        URL is unknown to Google
//   /fr/se-deplacer-a-rodrigues      Discovered - currently not indexed
//
// All eight French pages are in the sitemap, all eight declare a correct
// reciprocal hreflang, and all eight are better pages than their English
// twins — 3,000 to 8,800 characters with FAQPage and real entity markup,
// against English pages that were serving 1,100. They were still invisible.
//
// The cause was the link graph, not the pages. Every French page was reachable
// ONLY from other French pages: a closed island with two narrow doors,
// /browse/car and /browse/scooter, both of which sit around position 50-70
// themselves. The four French pages whose English twin did not link them are
// exactly the four Google could not see. Perfect correlation.
//
// hreflang is an annotation, not a crawl path. This is the crawl path.
//
// It matters more than it looks: for "plage rodrigues" Google ranks
// /fr/plages-rodrigues at position 9 and the English /guide/beaches at 83 for
// the same query. The French pages win when Google can find them.

// ── AND THE DOOR BACK (SEO audit 2026-09-29 C13) ────────────────────────────
// The same lesson runs the other way. /fr/plages-rodrigues and
// /fr/se-deplacer-a-rodrigues named their English twins in hreflang and linked
// neither, while the other nine French pages did. `lang="en"` is that link:
// same component, same place on the page, the reader's own language on the
// label ("Read this page in English").
export default function FrenchTwinLink({
  href,
  label,
  className = "",
  as = "p",
  lang = "fr",
}: {
  /** The twin's path — must be the page that names THIS page in its own
   *  hreflang, or the pair stops being reciprocal and Google ignores both. */
  href: string;
  /** Written in the TWIN's language: it is addressed to that reader. */
  label: string;
  className?: string;
  /** The language of the page linked to. "en" on a French page. */
  lang?: "fr" | "en";
  /**
   * The element to render as.
   *
   * "span" exists because the vehicle pages put this directly under their
   * intro, and that intro is already a <p>. A nested <p> is invalid and the
   * parser silently closes the outer one, which breaks the layout in a way
   * that looks like a CSS bug. The span is still `block`, so it still sits on
   * its own line.
   */
  as?: "p" | "span";
}) {
  const Tag = as;
  return (
    <Tag className={`mt-6 block font-dm text-sm text-muted ${className}`}>
      <Link
        href={href}
        hrefLang={lang}
        // The label is in the twin's language, so it says so — a screen
        // reader on a French page would otherwise read English in French.
        lang={lang}
        className="underline underline-offset-2 hover:text-yellow"
      >
        {label}
      </Link>
    </Tag>
  );
}
