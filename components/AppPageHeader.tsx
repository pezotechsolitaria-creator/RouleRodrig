"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import InstallAppButton from "@/components/InstallAppButton";
import AccountButton from "@/components/AccountButton";
import WorldSwitcher from "@/components/world/WorldSwitcher";

/**
 * Slim app-style top bar for inner pages — the v2 replacement for the marketing
 * <Navbar> on redesigned surfaces. Mirrors the app-home header (sticky, hairline
 * border, blurred ink) so navigation feels the same everywhere. Two modes:
 *   • sub-page  (title given): back control + centred title + language toggle.
 *   • primary   (no title):    brand wordmark + language toggle — for top-level
 *                               destinations that carry their own page header.
 * The global BottomNav carries the rest.
 */
export default function AppPageHeader({
  title,
  backHref = "/",
  logo,
}: {
  title?: string;
  backHref?: string;
  logo?: string;
}) {
  const { language, setLanguage } = useLanguage();
  const cycle = () => setLanguage(language === "en" ? "fr" : language === "fr" ? "cr" : "en");
  const back = loc(language, "Back", "Retour", "Retour");

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-dark/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
        {title ? (
          <Link
            href={backHref}
            aria-label={back}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:border-yellow/50 hover:text-yellow"
          >
            <ArrowLeft size={16} />
          </Link>
        ) : (
          <Link href="/" className="flex items-center" aria-label="Roule Rodrigues home">
            <span className="rr-logo-anim inline-flex">
              <span className="rr-logo-bob inline-flex">
                {logo ? (
                  <Image src={logo} alt="Roule Rodrigues" width={120} height={32} priority sizes="120px" className="h-8 w-auto object-contain" unoptimized={logo.startsWith("/uploads/") || (logo.startsWith("http") && !logo.includes("supabase.co"))} />
                ) : (
                  <span className="flex items-baseline gap-1.5 font-syne font-extrabold leading-none">
                    <span className="text-lg text-offwhite">Roulé</span>
                    <span className="text-lg text-yellow">Rodrigues</span>
                  </span>
                )}
              </span>
            </span>
          </Link>
        )}

        {title ? (
          <h1 className="mx-auto max-w-[62%] truncate text-center font-syne text-base font-bold text-offwhite">
            {title}
          </h1>
        ) : (
          <span className="flex-1" />
        )}

        {/* On a PRIMARY page there is no title, so the switch sits in the row
            it would otherwise share with one. On a sub-page it moves below —
            see the note under this row. */}
        {!title && <WorldSwitcher strip={false} className="mr-auto" />}

        <InstallAppButton variant="icon" />
        <button
          onClick={cycle}
          aria-label="Change language"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 font-bebas text-[11px] tracking-widest text-muted transition-colors hover:text-yellow"
        >
          {language.toUpperCase()}
        </button>
        <AccountButton />
      </div>

      {/* ── THE WORLD SWITCH, ON EVERY PAGE ──────────────────────────────────
          It used to live on the homepage and the world pages only, which meant
          tapping any card out of Curated stranded you: the page you landed on
          had no way back into the world you were in. The owner's instruction is
          that this control is everywhere — so leaving a world is always one tap
          from returning to it, and "/" can stay what it has always been.

          On a SUB-PAGE it gets its own row. Inline, it took 186px out of a
          392px bar and squeezed the page title — measured — to zero width: the
          visitor could no longer see what they were looking at. A 44px strip is
          the cheaper trade.

          The component renders nothing until the visitor's world is known, and
          this wrapper renders nothing when it does — so there is never an empty
          bar on a first load. */}
      {title && (
        <div className="flex justify-center border-t border-white/[0.06] px-4 py-1">
          <WorldSwitcher strip={false} />
        </div>
      )}
    </header>
  );
}
