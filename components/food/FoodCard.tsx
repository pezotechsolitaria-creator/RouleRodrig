import Link from "next/link";
import AutoPhotos from "@/components/AutoPhotos";
import { Flame, Star, Clock, Users } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { UNAVAILABLE_LABEL, type FoodCard as FoodCardType } from "@/lib/food/types";
import { dishArt } from "@/lib/food/dish-art";
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
  item, variant = "grid", index = 0,
}: {
  item: FoodCardType;
  /** grid = the search/category results · rail = a horizontal scroller */
  variant?: "grid" | "rail";
  /** Position in the grid — offsets this card's photo cycle. */
  index?: number;
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
        // 152px at 375px: two dishes fully visible with ~35px of a third
        // showing. That peek is deliberate — it is the only signal a thumb gets
        // that the row scrolls. w-full killed it (c7f03e7) and with it the
        // whole swipe.
        variant === "rail" ? "w-[152px] shrink-0 snap-start sm:w-[210px]" : ""
      } ${unavailable ? "opacity-60" : ""}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-dark">
        {item.imageUrl ? (
          <AutoPhotos
            images={[item.imageUrl, ...(item.imageUrls ?? [])]}
            alt={item.name}
            sizes={variant === "rail" ? "210px" : "(max-width: 640px) 50vw, 260px"}
            stagger={index}
            className="transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          // NO PHOTOGRAPH. This used to be a 26px grey icon in an empty box,
          // which is fine for one dish and ruinous for a menu: the restaurants
          // went live with 17 of 19 dishes unphotographed and the whole surface
          // rendered as a grid of near-empty rectangles. A designed placeholder
          // holds the page up until real photos exist, and vanishes the moment
          // one is uploaded. See lib/food/dish-art.ts.
          (() => {
            const art = dishArt(item.slug, `${item.name} ${item.descriptor ?? ""}`);
            return (
              <span
                className="flex h-full items-center justify-center"
                style={{ backgroundImage: `linear-gradient(145deg, ${art.from}, ${art.to})` }}
              >
                {/* Sized off the card, not a fixed px, so the rail's 210px
                    cards and the grid's 343px ones both look composed. */}
                <span
                  aria-hidden
                  className="select-none text-[2.75rem] leading-none opacity-90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-5xl"
                >
                  {art.glyph}
                </span>
              </span>
            );
          })()
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
        {/* Clamped so a long name cannot make one card taller than the one
            beside it — two-up only reads as a grid while the rows line up. */}
        <h3 className="line-clamp-2 font-syne text-sm font-extrabold leading-tight text-offwhite">
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

        {/* ── HALAL, ON THE CARD ITSELF ────────────────────────────────────
            Every other dietary tag lives on the dish page, which is the right
            place for information you read once you are already interested.
            Halal is not that: somebody who needs it needs it before they read
            anything else, and making them open nine dishes to find out is the
            same as not saying. It is the only tag here for that reason — a card
            wearing eight pills tells you nothing at a glance. */}
        {item.dietary?.includes("halal") && (
          <p className="mt-1.5">
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-dm text-[10px] font-semibold text-emerald-300">
              Halal
            </span>
          </p>
        )}

        {item.descriptor && (
          <p className="mt-1 line-clamp-2 font-dm text-xs leading-snug text-muted">{item.descriptor}</p>
        )}

        {/* THE PRICE NEVER BREAKS IN HALF.
            Side by side, "from Rs 380.00" and "15–30 min" do not both fit in a
            two-up card, so the price wrapped to "Rs" / "380.00" and the prep
            time was clipped to "15 m". That is the exact damage that made
            somebody widen these cards to full width in the first place — the
            wrapping was the real fault, not the two-up layout. Stacked on a
            phone with both lines nowrap, the price is one piece at any width
            and the layout that makes this look like a menu survives. */}
        <div className="mt-auto flex flex-col items-start gap-0.5 pt-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
          <p className="whitespace-nowrap font-syne text-[15px] font-extrabold leading-tight text-yellow sm:text-base">
            {item.variantCount > 1 && <span className="font-dm text-[11px] font-normal text-muted">from </span>}
            Rs {centsToDecimalString(item.price)}
          </p>
          <p className="flex items-center gap-2 whitespace-nowrap font-dm text-[11px] text-muted">
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
