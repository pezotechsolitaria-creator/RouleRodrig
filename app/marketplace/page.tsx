import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Landmark, ShoppingBag, Sparkles, Wrench } from "lucide-react";
import BackLink from "@/components/BackLink";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import { HUB_ACTIONS } from "@/lib/marketplace/hub";

// ── BUY IT. BOOK IT. GET IT DONE. ───────────────────────────────────────────
//
// One page that answers "what can this site actually do for me", for somebody
// who does not already know which of eight routes they wanted.
//
// ── WHY THIS IS NOT /shop ───────────────────────────────────────────────────
// /shop is the SHELF, and it is deliberately spare: its own header comment
// records that the first product used to sit 400px down under a headline, a
// sentence, a search box and a category grid, and that all of it was removed
// because everything a shopper does on arrival is search, tap a category, or
// look at products. Putting a card hero back on that page would undo a
// measured decision. So the hub is its own route and /shop is one of its doors.
//
// ── WHY TWO CARDS ARE DARK ──────────────────────────────────────────────────
// Because two of them are not built. A card that pretends to work costs
// somebody their afternoon; one that says "not yet" costs them nothing. The
// state comes from a null href in lib/marketplace/hub.ts — one field, so the
// link, the cursor, the wording and the aria cannot drift apart.

export const revalidate = 3600;

const DESCRIPTION =
  "Buy from local shops, book a car wash, or have something delivered anywhere on Rodrigues. One place for everything Roule Rodrigues can get done for you.";

export const metadata: Metadata = {
  title: "Rodrigues Marketplace — buy it, book it, get it done | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/marketplace` },
  openGraph: {
    title: "Rodrigues Marketplace | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/marketplace`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

/** Icons live here, not in hub.ts — that module stays plain data so it can be
 *  tested in node without React. */
const ICON: Record<string, React.ElementType> = {
  shop: ShoppingBag,
  wash: Sparkles,
  pro: Wrench,
  admin: Landmark,
};

export default async function MarketplacePage() {
  const content = await getContent();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Roule Rodrigues", url: SITE_URL },
        { name: "Marketplace", url: `${SITE_URL}/marketplace` },
      ]),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={
          content.recommended.enabled && content.recommended.items.length > 0
        }
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="min-h-screen bg-dark">
        <div className="mx-auto max-w-3xl px-5 pt-28 pb-16 md:pt-32">
          <BackLink
            fallback="/"
            iconSize={15}
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-yellow"
          >
            {" "}Back
          </BackLink>

          <p className="mt-5 font-bebas text-[11px] tracking-[0.3em] text-yellow">
            RODRIGUES MARKETPLACE
          </p>
          {/* Three clauses, three things: the deliberate shape of the whole
              page. Kept on one line at every width — broken across three it
              reads as a list of features rather than as one promise. */}
          <h1 className="mt-2 font-syne text-[26px] font-extrabold leading-tight text-offwhite sm:text-4xl">
            Buy it. Book it. Get it done.
          </h1>
          <p className="mt-2 max-w-xl font-dm text-sm leading-relaxed text-muted">
            {DESCRIPTION}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {HUB_ACTIONS.map((a) => {
              const Icon = ICON[a.key] ?? ShoppingBag;
              const open = a.href !== null;

              const inner = (
                <>
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      open ? "bg-yellow text-dark" : "bg-white/[0.06] text-muted"
                    }`}
                  >
                    <Icon size={20} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={`font-syne text-[17px] font-extrabold ${
                          open ? "text-offwhite" : "text-muted"
                        }`}
                      >
                        {a.title}
                      </span>
                      {!open && (
                        // The word, not a colour. A greyed card alone is a
                        // guess; this says which it is.
                        <span className="rounded-full border border-white/15 px-2 py-0.5 font-dm text-[10px] uppercase tracking-wider text-muted">
                          Soon
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block font-dm text-[13px] leading-relaxed text-muted">
                      {a.blurb}
                    </span>
                  </span>
                  {open && (
                    <ArrowRight
                      size={17}
                      className="mt-1 shrink-0 text-yellow"
                      aria-hidden
                    />
                  )}
                </>
              );

              // A real anchor when there is somewhere to go, and a plain div
              // when there is not — never a disabled link. A link that goes
              // nowhere is still focusable, still announced as a link, and
              // still tapped.
              return open ? (
                <Link
                  key={a.key}
                  href={a.href!}
                  className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/45"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={a.key}
                  className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-white/[0.06] bg-dark-card/40 p-4"
                >
                  {inner}
                </div>
              );
            })}
          </div>

          <p className="mt-6 font-dm text-[12.5px] leading-relaxed text-muted">
            Run a business on Rodrigues?{" "}
            <Link
              href="/list-your-scooter"
              className="text-yellow underline underline-offset-4"
            >
              List it here
            </Link>{" "}
            — shops, kitchens and services are all welcome.
          </p>
        </div>
      </main>
    </>
  );
}
