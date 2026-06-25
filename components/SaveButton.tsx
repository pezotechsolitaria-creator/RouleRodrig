"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import { useFavorites, type FavoriteItem } from "@/context/FavoritesContext";

/**
 * Heart toggle used as an overlay on cards (scooters, places, routes).
 * Saving builds a personal wishlist that brings visitors back to the site.
 */
export default function SaveButton({
  item,
  className = "",
  size = 17,
}: {
  item: FavoriteItem;
  className?: string;
  size?: number;
}) {
  const { isSaved, toggle, hydrated } = useFavorites();
  const saved = hydrated && isSaved(item.type, item.id);

  return (
    <button
      type="button"
      aria-label={saved ? "Remove from saved" : "Save for later"}
      aria-pressed={saved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(item);
      }}
      className={
        className ||
        "flex items-center justify-center w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white hover:bg-black/60 transition-colors"
      }
    >
      <motion.span
        key={saved ? "on" : "off"}
        initial={{ scale: 0.6 }}
        animate={{ scale: saved ? [1, 1.35, 1] : 1 }}
        transition={{ duration: 0.3 }}
        className="flex"
      >
        <Heart
          size={size}
          className={saved ? "fill-red-500 text-red-500" : "text-white"}
        />
      </motion.span>
    </button>
  );
}
