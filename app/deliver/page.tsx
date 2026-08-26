import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Wallet, Users } from "lucide-react";
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

export default async function DeliverPage() {
  const content = await getContent();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      <AppPageHeader logo={content.branding.logo} />

      {/* The bottom padding must clear the pinned CTA bar, which itself grows by
          env(safe-area-inset-bottom) on a notched phone. A fixed pb-52 (208px)
          measured fine in a browser reporting a zero inset and would have been
          ~9px short on an iPhone, clipping the last link. Derived from the same
          inset so the two cannot disagree on any device. */}
      <main className="min-h-screen bg-dark pb-[calc(13rem+env(safe-area-inset-bottom))]">
        <header className="border-b border-white/10 bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-10 md:py-14">
          <div className="mx-auto max-w-2xl">
            <p className={cn(t.eyebrow, "text-yellow")}>Roulé delivery</p>
            <h1 className="mt-3 font-syne text-4xl font-extrabold leading-tight text-offwhite md:text-5xl">
              Get anything moved on Rodrigues
            </h1>
            {/* The promise, and its limit, in the same breath. This is not a
                shop — there is no catalogue and no price list, because the
                thing being moved is whatever the customer says it is. */}
            <p className={cn(t.body, "mt-4 text-[#B0B0B0]")}>
              A parcel your family sent. Something you left at the other end of the
              island. A gas bottle nobody will carry on a scooter. Tell us what you
              need and where, and local drivers will send you their price.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-2xl px-5 py-10">
          {/* How the money works, said before the form rather than after it.
              Drivers set their own prices here — the platform takes a
              commission and does not set the fee — and a customer who does not
              know that will read the first quote as our price and judge us on
              it. */}
          <ul className="mb-9 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Users, t: "Drivers set the price", d: "Each one quotes their own. You pick." },
              { icon: Wallet, t: "Free to ask", d: "You pay only once you accept a price." },
              { icon: ShieldCheck, t: "A code proves delivery", d: "You read out a 4-digit PIN at the door." },
            ].map((f) => (
              <li key={f.t} className="rounded-xl border border-dark-border bg-white/[0.02] p-4">
                <f.icon size={20} className="text-yellow" aria-hidden />
                <p className={cn(t.cardTitle, "mt-2 text-offwhite")}>{f.t}</p>
                {/* Was 12px on the three sentences that explain the whole
                    pricing model. Nothing that carries a word sits below 16px
                    now — see lib/delivery/tokens.ts. */}
                <p className={cn(t.bodySm, "mt-1 text-[#B0B0B0]")}>{f.d}</p>
              </li>
            ))}
          </ul>

          {/* Before the form, because somebody arriving to CHECK a request
              should not have to scroll past the one that asks them to post
              another. */}
          <MyRequests />
          <FindRequest />

          <DeliverForm signedInEmail={user?.email ?? null} />

          {/* The escape hatch, ON the page. Somebody the form is failing does
              not file a complaint -- they close the tab, and nothing records
              that they tried. */}
          <NeedHelp
            phone={content.contact.phone}
            whatsapp={content.contact.whatsappNumbers?.[0]?.number ?? content.contact.phone}
          />

          <nav className="mt-12 border-t border-dark-border pt-8">
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
                    className={cn(t.body, "inline-flex min-h-12 items-center gap-1.5 text-yellow transition-colors hover:text-offwhite")}
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
