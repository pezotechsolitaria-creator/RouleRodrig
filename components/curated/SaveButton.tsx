"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";
import { useLanguage } from "@/context/LanguageContext";
import { locT } from "@/lib/world-docs/types";
import type { ResolvedCard } from "@/lib/world-docs/resolve";

/**
 * The heart, with one beat and no confetti.
 *
 * It sits INSIDE a card that is itself a link, so the click has to be stopped
 * from bubbling — otherwise saving a stay also navigates away from the page you
 * were saving it on, which is the classic version of this bug.
 *
 * `beat` is armed only on the transition to saved. Re-running the animation on
 * un-save would celebrate a removal, and re-running it on mount would make
 * every already-saved card pulse when the page loads.
 */
export default function SaveButton({ card }: { card: ResolvedCard }) {
  const { isSaved, toggle, hydrated } = useFavorites();
  const { language } = useLanguage();
  const [beat, setBeat] = useState(false);

  const fav = card.fav;
  const saved = !!fav && isSaved(fav.type, fav.id);

  useEffect(() => {
    if (!beat) return;
    const t = setTimeout(() => setBeat(false), 460);
    return () => clearTimeout(t);
  }, [beat]);

  if (!fav) return null;

  const name = locT(language, card.title);
  const label = saved
    ? language === "fr"
      ? `Retirer ${name} des favoris`
      : `Remove ${name} from saved`
    : language === "fr"
      ? `Enregistrer ${name}`
      : `Save ${name}`;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!saved) setBeat(true);
        toggle({
          id: fav.id,
          type: fav.type,
          name,
          image: card.image,
          href: card.href,
          meta: locT(language, card.meta) || undefined,
        });
      }}
      // Before hydration the saved state is unknown (it lives in localStorage),
      // so the control is present and sized but not yet interactive — which is
      // honest, and keeps the card's layout from shifting when it arrives.
      disabled={!hydrated}
      className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md transition-colors disabled:opacity-60"
      style={{
        borderColor: saved ? "var(--cur-line-strong)" : "rgba(255,255,255,0.16)",
        backgroundColor: "rgba(10,9,8,0.42)",
      }}
    >
      <Heart
        size={16}
        className={`${saved ? "fill-current" : ""} ${beat ? "rr-cur-heart-on" : ""}`}
        style={{ color: saved ? "var(--cur-peach)" : "rgba(242,235,225,0.9)" }}
      />
    </button>
  );
}
