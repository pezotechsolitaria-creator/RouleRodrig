"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import AccountButton from "@/components/AccountButton";
import ExperienceWorldSwitcher from "@/components/world/WorldSwitcher";

// ── ONE SWITCHER, NOT TWO ───────────────────────────────────────────────────
//
// This header used to carry its own menu listing Curated / Explore / Stays /
// Shops — a second control also called a "world switcher", sitting a few pixels
// from the real one, meaning something completely different. Two controls with
// the same name and different jobs is worse than either alone.
//
// It now carries the site's actual world switch: Authentic <-> Curated, which
// navigates to that world's page. The sections it used to list are one tap away
// in the quick actions immediately below the hero, which is where a list of
// destinations belongs.
//
// ── NO SEARCH FIELD, DELIBERATELY ───────────────────────────────────────────
//
// Search is Explore's job, and it is one tap away in the world switcher. A
// search box at the top of a curated page contradicts the page: it says "tell
// us what you want" to a reader who came precisely because they don't know yet.
// It also puts the least editorial control in the most prominent position.
//
// The language toggle from the app headers is gone for a smaller reason — three
// controls is a header, five is a toolbar — but it survives in the footer and
// on every other page.
export default function WorldHeader({ logo }: { logo?: string }) {
  const { count } = useFavorites();
  const { language } = useLanguage();
  const openSaved = () => window.dispatchEvent(new CustomEvent("rr:open-saved"));

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{
        borderColor: "var(--cur-line)",
        backgroundColor: "var(--cur-veil)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 lg:px-8">
        <Link
          href="/"
          // A minimum WIDTH as well as a height: on a phone the wordmark is
          // hidden and only the mark remains, which on its own is a 28px-wide
          // target. Spelled as an arbitrary value because this Tailwind build
          // generates .min-h-11 but not .min-w-11.
          className="flex min-h-11 min-w-[2.75rem] shrink-0 items-center gap-2"
          aria-label={loc(language, "Roulé Rodrigues home", "Accueil Roulé Rodrigues")}
        >
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={112}
              height={32}
              priority
              sizes="112px"
              className="h-8 w-auto shrink-0 object-contain"
              unoptimized={
                logo.startsWith("/uploads/") ||
                (logo.startsWith("http") && !logo.includes("supabase.co"))
              }
            />
          ) : null}
          {/* ── THE STACKED WORDMARK ──────────────────────────────────────
              Two lines, TI ROULÉ over RODRIGUES, as the owner drew it. Stacking
              is what lets the mark stay legible in a 44px-tall bar without
              eating the width the world switcher needs beside it — and it is
              why this survives on a phone where the single-line version had to
              be hidden.

              It stays in the site's display face. The serif belongs to the
              editorial voice below; on the brand mark it would make the page
              look like a different company's. */}
          <span className="flex flex-col justify-center leading-none">
            <span
              className="font-syne text-[13px] font-extrabold uppercase tracking-[0.06em]"
              style={{ color: "var(--cur-ivory)" }}
            >
              Ti Roulé
            </span>
            <span
              className="mt-0.5 font-dm text-[8px] font-medium uppercase tracking-[0.28em]"
              style={{ color: "var(--cur-copper)" }}
            >
              Rodrigues
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <ExperienceWorldSwitcher strip={false} />

          <button
            onClick={openSaved}
            aria-label={loc(language, `Saved (${count})`, `Favoris (${count})`)}
            className="relative flex h-11 w-11 items-center justify-center rounded-full border transition-colors"
            style={{ borderColor: "var(--cur-line)" }}
          >
            <Heart
              size={17}
              className={count > 0 ? "fill-current" : ""}
              style={{ color: count > 0 ? "var(--cur-peach)" : "var(--cur-dim)" }}
            />
            {count > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-dm text-[10px] font-bold"
                style={{ backgroundColor: "var(--cur-champagne)", color: "var(--cur-on-accent)" }}
              >
                {count}
              </span>
            )}
          </button>

          <AccountButton />
        </div>
      </div>
    </header>
  );
}
