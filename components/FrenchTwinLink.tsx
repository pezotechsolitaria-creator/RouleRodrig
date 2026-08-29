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

export default function FrenchTwinLink({
  href,
  label,
  className = "",
}: {
  /** The French twin's path — must be the page that names THIS page in its own
   *  hreflang, or the pair stops being reciprocal and Google ignores both. */
  href: string;
  /** Written in French: it is addressed to a French reader, not an English one. */
  label: string;
  className?: string;
}) {
  return (
    <p className={`mt-6 font-dm text-sm text-muted ${className}`}>
      <Link
        href={href}
        hrefLang="fr"
        className="underline underline-offset-2 hover:text-yellow"
      >
        {label}
      </Link>
    </p>
  );
}
