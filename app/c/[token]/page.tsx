import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MapPin, Phone, Package } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

export const metadata: Metadata = {
  title: "Deliveries",
  // A courier link must never be indexed, and must never be followed into.
  robots: { index: false, follow: false, nocache: true },
};

// ── A COURIER'S SCREEN ──────────────────────────────────────────────────────
//
// Opened from a link the SHOP sent them. These people do not work for Roulé
// Rodrigues: they work for the restaurant, they have no account, no application
// and no earnings here. They have a link, and the link is the credential — the
// same shape as the taxi driver's /d/<token> page and the event organiser's
// scanner links.
//
// Deliberately no login, no install prompt and no navigation: this opens in
// WhatsApp's browser on a moped at the side of a road. It is a list of stops
// with a phone number and a map pin, and nothing else.
export const dynamic = "force-dynamic";

type Job = {
  orderId: string;
  orderNumber: string;
  customer: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  total: number | null;
  status: string;
};

export default async function CourierPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("courier_jobs", { p_token: token });

  const result = data as
    | { ok: boolean; courier?: string; store?: string; jobs?: Job[] }
    | null;

  // One message for every failure. An unknown link, a revoked link and a shop
  // whose tracking was switched off must be indistinguishable, or the page
  // tells whoever is probing which of the three they found.
  if (!result?.ok) {
    return (
      <main className="min-h-screen bg-dark px-4 py-16">
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-syne text-xl font-extrabold text-offwhite">This link is not active</h1>
          <p className="mt-2 font-dm text-sm text-muted">
            Ask the shop to send you a new one.
          </p>
        </div>
      </main>
    );
  }

  const jobs = result.jobs ?? [];

  return (
    <main className="min-h-screen bg-dark px-4 py-8">
      <div className="mx-auto max-w-md">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{result.store}</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">
          {result.courier}
        </h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          {jobs.length === 0
            ? "Nothing to deliver right now."
            : `${jobs.length} ${jobs.length === 1 ? "delivery" : "deliveries"} to make.`}
        </p>

        {jobs.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
            <Package size={22} className="mx-auto text-muted" />
            <p className="mt-2 font-dm text-sm text-muted">
              When the shop marks an order ready, it appears here. Keep this page open.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {jobs.map((j) => (
              <li key={j.orderId} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-syne text-base font-bold text-offwhite">
                    {j.customer ?? "Customer"}
                  </span>
                  {j.total != null && (
                    <span className="shrink-0 font-dm text-sm text-yellow">
                      Rs {centsToDecimalString(j.total)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-dm text-xs text-muted">{j.orderNumber}</p>

                {j.address && (
                  <p className="mt-2 font-dm text-sm text-offwhite/85">{j.address}</p>
                )}

                {/* The two things a courier actually taps. Big, and side by
                    side, because this is used one-handed at a roadside. */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {j.phone ? (
                    <a
                      href={`tel:${j.phone.replace(/\s/g, "")}`}
                      className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/15 font-syne text-sm font-bold text-offwhite"
                    >
                      <Phone size={15} /> Call
                    </a>
                  ) : (
                    <span className="flex min-h-[48px] items-center justify-center rounded-xl border border-white/5 font-dm text-xs text-muted">
                      No phone
                    </span>
                  )}
                  {j.lat != null && j.lng != null ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${j.lat},${j.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-yellow font-syne text-sm font-bold text-dark"
                    >
                      <MapPin size={15} /> Directions
                    </a>
                  ) : (
                    <span className="flex min-h-[48px] items-center justify-center rounded-xl border border-white/5 font-dm text-xs text-muted">
                      No pin
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 font-dm text-[11px] text-muted/60">
          This link is personal to you. Do not share it — anyone who has it can see these
          deliveries.
        </p>
      </div>
    </main>
  );
}
