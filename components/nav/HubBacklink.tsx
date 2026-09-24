import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// ── THE LINK THAT ONLY WENT ONE WAY ─────────────────────────────────────────
//
// /guide lists its eight children and /fr lists its eleven, and not one child
// linked back. Measured on the live site: zero of the eleven French pages
// rendered an href to /fr, and zero of the eight guide pages rendered one to
// /guide.
//
// That is the "French pages are an island" problem one level down, and the /fr
// hub was built specifically to end it. A French visitor arriving on
// /fr/plages-rodrigues from a search — which is how they arrive, those pages
// being the best-performing writing on this site — saw that one page and had
// no route to the other ten. The hub's only inbound link anywhere was a single
// row on /more, an English page behind a "More" tap.
//
// ── WHY THIS IS NOT IN A LAYOUT ─────────────────────────────────────────────
//
// One placement would have been nicer than nineteen, but a layout wraps the
// HUB as well as its children and cannot tell them apart: only the root layout
// can reach the request, and `usePathname()` is empty while a page is being
// statically generated — so the first attempt shipped a self-link inside
// /guide's own static HTML and then removed it on hydration, which is both a
// wrong link and a mismatch.
//
// A plain server component in each page renders into the static HTML, so a
// crawler that runs no JavaScript follows it, and the hubs simply do not have
// one. lib/nav/hub-backlinks.test.ts fails if a new child page ships without
// it.
export default function HubBacklink({
  href, label,
}: {
  /** The hub this page belongs under. */
  href: "/guide" | "/fr";
  /** In the language of the page it sits on, not the visitor's. */
  label: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10">
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-yellow"
      >
        {label} <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
