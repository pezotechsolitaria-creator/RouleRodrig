"use client";

import { useLanguage } from "@/context/LanguageContext";
import { DELIVER_COPY } from "@/lib/delivery/copy.i18n";

// ── The page's h1, and the only reason it is a client component ─────────────
//
// /deliver is a server component. The chosen language is not a cookie and not a
// route segment — context/LanguageContext.tsx keeps it in localStorage and
// restores it after mount — so there is nothing on the server to read it from,
// and no other server page in this repo has a pattern to copy. Every other word
// on this page already comes from DELIVER_COPY by way of DeliverForm; this
// heading was the one string the server wrote itself, and so the one string
// that stayed in English for a reader in French or Kreol.
//
// Only the heading moves. Making the page itself a client component to
// translate eight words would pull getContent(), the Supabase session read and
// the JSON-LD across the boundary with it.
//
// It still server-renders: the provider starts on "en" and corrects itself
// after hydration, so a crawler and a reader with no JavaScript both get the
// English h1 the page's metadata already promises.

export default function DeliverTitle() {
  const { language } = useLanguage();

  return (
    <h1 className="font-syne text-base font-extrabold leading-tight text-offwhite md:text-4xl">
      {DELIVER_COPY[language].pageTitle}
    </h1>
  );
}
