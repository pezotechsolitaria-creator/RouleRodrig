"use client";

import { useLanguage } from "@/context/LanguageContext";
import { ShopHeader } from "@/components/shop/ShopChrome";
import { EVENTS_COPY } from "@/lib/events/copy.i18n";

// ── The one string in the sticky top bar, and why it needs a client child ───
//
// ShopHeader is already a client component, but its `backLabel` is a PROP, and
// the props on /events and /events/[slug] are written by server components. The
// chosen language is not a cookie and not a route segment —
// context/LanguageContext.tsx keeps it in localStorage and restores it after
// mount — so there is nothing on the server to read it from. Same reasoning,
// and the same shape, as app/deliver/DeliverTitle.tsx.
//
// It still server-renders: the provider starts on "en" and corrects itself
// after hydration, so a crawler and a reader with no JavaScript both get the
// English label.

export default function EventsBackBar({
  backHref,
  label,
}: {
  backHref: string;
  /** Which of the two back destinations this bar points at. */
  label: "home" | "allEvents";
}) {
  const { language } = useLanguage();

  return <ShopHeader backHref={backHref} backLabel={EVENTS_COPY[language].back[label]} />;
}
