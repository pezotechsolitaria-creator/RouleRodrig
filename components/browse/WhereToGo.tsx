"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// ── WHERE TO GO, IN THE READER'S LANGUAGE ───────────────────────────────────
// Architecture review 2026-09-30, item 1 (fix-up). The block was a server
// function with English-only text, so on /browse/stays a visitor reading in
// French went through French notes and then hit "Where to go" and "The beaches
// of Rodrigues" in English — the mid-page switch CategoryNotes was written to
// avoid. A client leaf still renders on the server (in English, language "en"),
// so a crawler reads the same links without a script; only the words follow
// the visitor's choice. The hrefs never change with the language: the server
// HTML and the first client render have to agree.

export type GuideLink = { href: string; label: { en: string; fr: string; cr: string } };

const HEADING = { en: "Where to go", fr: "Où aller", cr: "Kot pou al" };

export default function WhereToGo({ links }: { links: GuideLink[] }) {
  const { language } = useLanguage();
  if (links.length === 0) return null;
  return (
    <section className="mx-auto max-w-5xl px-4 pb-10 pt-2 md:px-6">
      <div className="border-t border-white/10 pt-8">
        <h2 className="font-bebas text-[11px] tracking-[0.3em] text-muted">{HEADING[language]}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-white/10 bg-dark-card px-4 py-3 font-dm text-sm text-offwhite/85 transition hover:border-yellow/40 hover:text-yellow"
            >
              {l.label[language]}
              <ChevronRight size={14} className="shrink-0 opacity-60" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
