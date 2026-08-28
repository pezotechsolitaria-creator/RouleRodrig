"use client";

import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useSaved } from "@/lib/marketplace/saved";
import { trackSaveToggled } from "@/lib/marketplace/analytics";
import { useShopCopy } from "./ShopCopy";

// Save for later.
//
// Renders in its unsaved state until the client has read localStorage
// (`hydrated`), because SSR cannot know and a button that flips from filled to
// empty on load looks like the save was lost. Until then it is inert rather
// than wrong.
export default function SaveButton({
  productId, productName, className = "",
}: {
  productId: string;
  productName: string;
  /** Kept in the signature so a card can pass them; unused by the button. */
  storeSlug?: string;
  productSlug?: string;
  className?: string;
}) {
  const { isSaved, toggle, hydrated } = useSaved();
  const copy = useShopCopy();
  const saved = hydrated && isSaved(productId);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? copy.save.removeAria(productName) : copy.save.saveAria(productName)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const nowSaved = toggle(productId);
        trackSaveToggled({ productId, productName, saved: nowSaved });
        toast.success(nowSaved ? copy.save.savedToast : copy.save.removedToast, {
          description: nowSaved ? copy.save.savedHint : undefined,
        });
      }}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow ${
        saved
          ? "border-yellow/50 bg-yellow/10 text-yellow"
          : "border-white/15 text-muted hover:border-white/30 hover:text-offwhite"
      } ${className}`}
    >
      <Heart size={17} className={saved ? "fill-yellow" : ""} />
    </button>
  );
}
