import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import DeliverForm from "./DeliverForm";
import MyRequests from "./MyRequests";

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
      {/* ── A WAY BACK ─────────────────────────────────────────
          This was `<AppPageHeader logo={...} />` with no title, which is the
          component's PRIMARY mode: a brand wordmark and no back control. The
          wordmark does link home, but a logo is not a way out and nobody reads
          it as one — the owner reported twice that there was no back button on
          this page, and they were right.

          /deliver is a four-step flow, not a top-level destination, so it takes
          the same sub-page header /order and /shop already use. */}
      <AppPageHeader showBack backHref="/" />

      {/* The bottom padding must clear the pinned CTA bar, which itself grows by
          env(safe-area-inset-bottom) on a notched phone. Derived from the same
          inset so the two cannot disagree on any device. */}
      {/* The pinned action no longer has to clear a floating tab bar — see
          lib/nav-scope.ts — so the bottom padding is the bar itself plus the
          notch, and not 80px of clearance for something that is not there. */}
      {/* MEASURED, 375x812, review screen, French. This <main> was
          `min-h-screen` — 100vh — while starting 64px down the page, under the
          sticky AppPageHeader. 100vh of content beginning at y=64 ends at 876
          in an 812 viewport, so the page scrolled 64px before a single word was
          written into it. Subtracting the header is the whole fix.

          The bottom padding was a hardcoded 8rem guessing at the pinned bar's
          height. The bar is 125px in English and 145px in French, where its
          caption wraps to two lines — so the guess was 17px short in French and
          that much of the review screen sat under the bar with no way to reach
          it.

          9.5rem is the tallest the bar gets — 145px, measured on the French
          review screen, which is the only combination that shows a Back button,
          the long "Publier la demande" label AND a caption that wraps to two
          lines. Slack rather than a live measurement because the surplus is
          FREE: min-height above means that whenever the content is short enough
          for the padding to matter, main is already taller than its contents
          and the padding costs no scroll at all. It is only load-bearing on the
          screens where content overflows anyway, and there it is what lets the
          last line be scrolled out from under the bar. */}
      <main className="min-h-[calc(100vh-4rem)] bg-dark pb-[calc(9.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl px-5 pt-3">
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
          {/* MEASURED at 90px as three wrapped lines of text-2xl. It is the
              page's title and its SEO heading, and on a phone it is also 90px
              of a 534px budget spent before anybody can do anything — so it is
              one line on mobile and keeps its presence where height is free.

              It stays HERE rather than moving into the header: the header's
              title slot also moves the world switch onto a second row, and that
              costs 46px of scroll. The arrow does not need the title to exist
              — see the `showBack` prop. */}
          <h1 className="font-syne text-base font-extrabold leading-tight text-offwhite md:text-4xl">
            Get anything moved on Rodrigues
          </h1>

          <div className="mt-3">
            <MyRequests />
          </div>

          <div className="mt-2">
            <DeliverForm
              signedInEmail={user?.email ?? null}
              helpPhone={phone}
              helpWhatsapp={whatsapp}
            />
          </div>

          {/* ── WHAT USED TO BE HERE, AND WHY IT IS NOT ────────────────────
              MEASURED: below a form that fits a phone sat 821px of other page
              — a "find your request" panel, a "Rather talk to someone?" block
              and three cross-sell links. Each screen of the form could fit
              perfectly and the PAGE still scrolled, which is what the owner
              was actually looking at. Measuring the form section rather than
              document.scrollHeight was the wrong metric, and it hid this.

              "Rather talk to someone?" is GONE as a block, not as a feature:
              the call and WhatsApp buttons live in the form's sticky bar now,
              so they are on screen at every step instead of 334px below the
              last one.

              The cross-sells are gone outright. Somebody halfway through
              asking for a delivery is not shopping, and three links inviting
              them elsewhere are three ways to lose them. They belong on the
              home page and in More.

              What is left is the one thing a person might come here looking
              for that is not the form: getting back to a request whose link
              they lost. It is a single line. */}
        </div>
      </main>
    </>
  );
}
