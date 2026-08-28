"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { CHECKOUT_COPY } from "@/lib/checkout/copy.i18n";

// ── The back link and the h1, and the only reason they are a client child ────
//
// /checkout is a server component: it awaits searchParams, reads the Supabase
// session and resolves the order-hold windows from SQL. The chosen language is
// not a cookie and not a route segment — context/LanguageContext.tsx keeps it
// in localStorage and restores it after mount — so there is nothing on the
// server to read it from.
//
// Every other word on this page comes from CHECKOUT_COPY by way of
// CheckoutForm; these two were the strings the server wrote itself, and so the
// two that stayed in English above a form answering in French or Kreol.
//
// Same shape as app/deliver/DeliverTitle.tsx and app/taxi/book/BookingHeading.tsx.
// Making the page itself a client component to translate three words would drag
// the session read and resolveHoldWindows() across the boundary with it.
//
// It still server-renders: the provider starts on "en" and corrects itself
// after hydration, so a reader with no JavaScript gets the English heading.

export default function CheckoutHeading() {
  const { language } = useLanguage();
  const c = CHECKOUT_COPY[language].page;

  return (
    <>
      <Link href="/cart" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
        <ArrowLeft size={14} /> {c.back}
      </Link>
      <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">{c.heading}</h1>
    </>
  );
}
