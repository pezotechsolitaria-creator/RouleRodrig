import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Wallet, Clock } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import AppPageHeader from "@/components/AppPageHeader";
import BookRide from "./BookRide";
import { RIDE_SERVICES, type RideService } from "@/lib/rides/model";

// ── ONE SCREEN FOR TAXI *AND* EVERY TRANSFER ────────────────────────────────
//
// The owner: "DO NOT FORGET TRANSFERS ALSO IS TAXI BUT A VARIANT."
//
// He is right, and it collapses two half-built flows into one. A taxi, an airport
// run, a ferry run, a hotel transfer and a private hire are the same act — a car
// takes somebody from A to B — differing only in whether there is a flight number
// and whether the far end is fixed. /transfers was a separate WhatsApp form for
// the same thing.
//
// So `service` is a variant on ONE booking screen, and ?service=airport just
// preselects it. One flow to maintain, one to test, one for a customer to learn.
export const metadata: Metadata = {
  title: "Book a taxi or transfer in Rodrigues | Roulé Rodrigues",
  description:
    "Book a taxi, airport transfer or ferry transfer in Rodrigues in under a minute. See the fare before you book, pay your driver directly. No account needed.",
  alternates: { canonical: `${SITE_URL}/taxi/book` },
};

export default async function BookRidePage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  const initial: RideService =
    service && (RIDE_SERVICES as readonly string[]).includes(service)
      ? (service as RideService)
      : "taxi";

  return (
    <>
      <AppPageHeader title="Book a ride" backHref="/taxi" />
      <main className="min-h-screen bg-dark px-4 pb-32 pt-4 text-offwhite">
        <div className="mx-auto max-w-lg">
          {/* Three promises, because a first-time visitor's real question is
              "is this safe and what will it cost me". Answered before the form. */}
          <div className="mb-5 grid grid-cols-3 gap-2 text-center">
            {[
              { icon: Wallet, line: "See the fare first" },
              { icon: Clock, line: "Driver in minutes" },
              { icon: ShieldCheck, line: "No account needed" },
            ].map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.line} className="rounded-xl border border-white/10 bg-dark-card px-2 py-3">
                  <Icon size={16} className="mx-auto text-yellow" />
                  <p className="mt-1 font-dm text-[11px] leading-tight text-muted">{p.line}</p>
                </div>
              );
            })}
          </div>

          <BookRide initialService={initial} />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <Link href="/taxi" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-offwhite">
              <ArrowLeft size={15} /> All drivers
            </Link>
            <Link href="/taxi/track" className="font-dm text-sm font-bold text-yellow hover:underline">
              Already booked? Follow your ride →
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
