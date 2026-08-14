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

      <main className="min-h-screen bg-dark pb-28">
        <header className="border-b border-white/10 bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-10 md:py-14">
          <div className="mx-auto max-w-2xl">
            <p className="font-bebas text-xs tracking-[0.3em] text-yellow">ROULÉ DELIVERY</p>
            <h1 className="mt-3 font-syne text-4xl font-extrabold leading-tight text-offwhite md:text-5xl">
              Get anything moved on Rodrigues
            </h1>
            {/* The promise, and its limit, in the same breath. This is not a
                shop — there is no catalogue and no price list, because the
                thing being moved is whatever the customer says it is. */}
            <p className="mt-4 font-dm leading-relaxed text-muted">
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
                <f.icon size={16} className="text-yellow" />
                <p className="mt-2 font-syne text-sm font-bold text-offwhite">{f.t}</p>
                <p className="mt-1 font-dm text-xs leading-relaxed text-muted">{f.d}</p>
              </li>
            ))}
          </ul>

          <DeliverForm signedInEmail={user?.email ?? null} />

          <nav className="mt-12 border-t border-dark-border pt-8">
            <p className="font-syne text-sm font-bold text-offwhite">Already selling on Roulé?</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/shop", label: "Order from island shops — delivery included" },
                { href: "/food", label: "Order food from local kitchens" },
                { href: "/driver/apply", label: "Drive for Roulé and quote on these jobs" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
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
