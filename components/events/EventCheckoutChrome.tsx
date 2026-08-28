"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { EVENTS_COPY } from "@/lib/events/copy.i18n";

// ── The four sentences around the ticket form ───────────────────────────────
//
// app/events/[slug]/checkout/page.tsx is a server component and stays one — it
// is where the event is loaded and where selling is closed for a cancelled or
// finished event, which is a decision no client is allowed to make. Its own
// wording is small enough to lift out in two pieces rather than move the shell
// across the boundary: the chosen language is in localStorage and unreadable on
// the server (see app/deliver/DeliverTitle.tsx).

/** The back link and the h1 — the two lines above the form. */
export function EventCheckoutHeader({
  slug,
  name,
  closed,
}: {
  slug: string;
  /** The organiser's own name for the event. Never translated. */
  name: string;
  closed: boolean;
}) {
  const { language } = useLanguage();
  const c = EVENTS_COPY[language];

  return (
    <>
      <Link
        href={`/events/${slug}`}
        className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
      >
        <ArrowLeft size={14} /> {c.back.toEvent(name)}
      </Link>

      <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">
        {closed ? c.checkout.titleClosed : c.checkout.titleOpen}
      </h1>
    </>
  );
}

/** Shown instead of the form when the event is cancelled or already over. */
export function EventCheckoutClosed({ cancelled }: { cancelled: boolean }) {
  const { language } = useLanguage();
  const c = EVENTS_COPY[language];

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-dark-card p-6">
      <p className="font-dm text-sm text-muted">
        {cancelled ? c.checkout.closedCancelled : c.checkout.closedEnded}
      </p>
      <Link
        href="/events"
        className="mt-4 inline-block font-dm text-sm font-semibold text-yellow hover:underline"
      >
        {c.checkout.seeOthers}
      </Link>
    </div>
  );
}
