import Link from "next/link";
import Image from "next/image";
import { Flame, Star, Clock, UtensilsCrossed, Users } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { UNAVAILABLE_LABEL, type FoodCard as FoodCardType } from "@/lib/food/types";
import FoodQuickAdd from "./FoodQuickAdd";

// The food card. The most-rendered component on the surface, and the one that
// decides whether this feels like a food platform or a business directory.
//
// ── THE HIERARCHY, AND WHY THE KITCHEN IS AT THE BOTTOM OF IT ──────────────
//   1. the photograph   — on a phone it IS the product; everything else is a caption
//   2. the name
//   3. the price
//   4. one line of what is in it
//   5. how long it takes
//   6. the kitchen, small, last — and only on the detail view
//
// A card dominated by a logo and a business name is a directory listing. The
// customer's question is "do I want to eat that", and the only honest answer to
// it is a picture of the food. So the kitchen name does not appear on the grid
// card at all: it is metadata that scopes the cart, not a thing to browse.
//
// ── AN UNORDERABLE DISH IS SHOWN, NOT HIDDEN ───────────────────────────────
// Dimmed, with the REASON on the image. "From 11:00" tells a customer to come
// back; hiding the dish tells them the platform has nothing. The reason is
// already computed once in the food_catalog view, so every surface says the
// same thing.

export default function FoodCard({
  item, variant = "grid",
}: {
  item: FoodCardType;
  /** grid = the search/category results · rail = a horizontal scroller */
  variant?: "grid" | "rail";
}) {
  const unavailable = !item.orderable;
  const prep =
    item.prepMin != null && item.prepMax != null
      ? item.prepMin === item.prepMax
        ? `${item.prepMin} min`
        : `${item.prepMin}–${item.prepMax} min`
      : null;

  return (
    <Link
      href={`/food/${item.slug}`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-colors hover:border-white/25 ${
        // Full width on a phone so a dish card is the same size as a
        // marketplace product card (343px at 375px wide, versus the 190px
        // these were). A 190px card in a scroller clipped the next one at
        // the screen edge and cut the price in half.
        variant === "rail" ? "w-full shrink-0 sm:w-[210px]" : ""
      } ${unavailable ? "opacity-60" : ""}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-dark">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes={variant === "rail" ? "210px" : "(max-width: 640px) 50vw, 260px"}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted/40">
            <UtensilsCrossed size={26} />
          </span>
        )}

        {item.isSignature && !unavailable && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-dark/80 px-2 py-1 font-bebas text-[10px] tracking-[0.15em] text-yellow backdrop-blur-sm">
            <Star size={9} fill="currentColor" /> SIGNATURE
          </span>
        )}

        {unavailable && item.reason && (
          <span className="absolute inset-x-0 bottom-0 bg-dark/85 py-1.5 text-center font-bebas text-[11px] tracking-[0.2em] text-orange-200 backdrop-blur-sm">
            {UNAVAILABLE_LABEL[item.reason] ?? "Unavailable"}
          </span>
        )}

        {/* The add control floats over the photo so the tap target is where the
            thumb already is, and the card below stays pure information. */}
        <div className="absolute bottom-2 right-2">
          <FoodQuickAdd item={item} size={variant === "rail" ? "sm" : "md"} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-syne text-sm font-extrabold leading-tight text-offwhite">
          {item.name}
          {item.spiceLevel > 0 && (
            <span
              className="ml-1.5 inline-flex align-middle text-orange-400"
              aria-label={`Spice level ${item.spiceLevel} of 3`}
            >
              {Array.from({ length: item.spiceLevel }).map((_, i) => (
                <Flame key={i} size={11} />
              ))}
            </span>
          )}
        </h3>

        {item.descriptor && (
          <p className="mt-1 line-clamp-2 font-dm text-xs leading-snug text-muted">{item.descriptor}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <p className="font-syne text-base font-extrabold text-yellow">
            {item.variantCount > 1 && <span className="font-dm text-[11px] font-normal text-muted">from </span>}
            Rs {centsToDecimalString(item.price)}
          </p>
          <p className="flex items-center gap-2 font-dm text-[11px] text-muted">
            {item.serves && item.serves > 1 && (
              <span className="inline-flex items-center gap-0.5">
                <Users size={10} /> {item.serves}
              </span>
            )}
            {prep && (
              <span className="inline-flex items-center gap-0.5">
                <Clock size={10} /> {prep}
              </span>
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}
