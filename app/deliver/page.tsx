import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getContent } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import DeliverForm from "./DeliverForm";
import MyRequests from "./MyRequests";
import FindRequest from "./FindRequest";
import NeedHelp from "./NeedHelp";
import { cn } from "@/lib/utils";
import { type as t } from "@/lib/delivery/tokens";

export const dynamic = "force-dynamic";

const TITLE = "Get Anything Delivered in Rodrigues | Roule Rodrigues";
const DESCRIPTION =
  "Need something moved on Rodrigues? Post what you need collected or bought, local drivers send you their price, and you choose. Packages, shopping runs and large items.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/deliver` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/deliver`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

// ── The page around the form ────────────────────────────────────────────────
//
// ── WHAT WAS ABOVE THE FIRST QUESTION, AND IS NOT ANY MORE ─────────────────
// A three-screen form that fits a phone is worth nothing if you have to scroll
// past half a page to reach screen one. This page used to open with a 14-unit
// hero, a four-line paragraph and three explainer cards — roughly 450px of
// reading before the first thing anybody could DO.
//
// The three cards ("drivers set the price", "free to ask", "a code proves
// delivery") were the right facts in the wrong place. They were being read by
// people who had not yet decided to care, and they were gone from the screen by
// the time somebody was deciding whether to press post. They now live on the
// review screen, where that decision is actually made — see the `promises` list
// in lib/delivery/copy.i18n.ts.
//
// What is left above the form is a title and one sentence. Everything else —
// finding a request you lost the link to, talking to a human instead — moved
// BELOW it, because those are things you go looking for and the form is the
// thing you arrived for.
//
// The one exception is MyRequests, which stays on top and renders NOTHING for a
// first-time visitor. Somebody coming back to check on a job should not have to
// scroll past the form asking them to post another.

export default async function DeliverPage() {
  const content = await getContent();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const phone = content.contact.phone ?? "";
  const whatsapp = content.contact.whatsappNumbers?.[0]?.number ?? phone;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Deliver anything", url: `${SITE_URL}/deliver` },
          ]),
        ]}
      />
      {/* Carries the language cycle (EN → FR → Kreol) that this whole flow
          reads from. One control for the site, not a second one per page. */}
      <AppPageHeader logo={content.branding.logo} />

      {/* The bottom padding must clear the pinned CTA bar, which itself grows by
          env(safe-area-inset-bottom) on a notched phone. Derived from the same
          inset so the two cannot disagree on any device. */}
      <main className="min-h-screen bg-dark pb-[calc(13rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl px-5 pt-7">
          {/* MEASURED, on a real 375x812 render. At text-3xl the title wrapped
              to three lines and stood 113px tall, with a 54px sentence under it
              and a tracked-capitals eyebrow above — 207px of a 599px budget,
              spent before anybody could do anything.

              The sentence is gone: the form's own first question says it
              better, three taps earlier. The eyebrow is gone: it read "ROULÉ
              DELIVERY" directly above an h1 saying the same thing in words
              somebody actually reads. The title is sized to wrap to two lines
              on a phone and keeps its presence on a desktop, where height is
              free. */}
          <h1 className="font-syne text-2xl font-extrabold leading-tight text-offwhite md:text-4xl">
            Get anything moved on Rodrigues
          </h1>

          <div className="mt-5">
            <MyRequests />
          </div>

          <div className="mt-5">
            <DeliverForm
              signedInEmail={user?.email ?? null}
              helpPhone={phone}
              helpWhatsapp={whatsapp}
            />
          </div>

          {/* Below the form on purpose: this is for somebody who came back
              having lost their link, which is a thing you go looking for. */}
          <div className="mt-12 border-t border-dark-border pt-8">
            <FindRequest />
          </div>

          <NeedHelp phone={phone} whatsapp={whatsapp} />

          <nav className="mt-10 border-t border-dark-border pt-8">
            <p className={cn(t.cardTitle, "text-offwhite")}>Already selling on Roulé?</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/shop", label: "Order from island shops — delivery included" },
                { href: "/food", label: "Order food from local kitchens" },
                { href: "/driver/apply", label: "Drive for Roulé and quote on these jobs" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={cn(
                      t.body,
                      "inline-flex min-h-12 items-center gap-1.5 text-yellow transition-colors hover:text-offwhite",
                    )}
                  >
                    {l.label} <ArrowRight size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
    </>
  );
}
