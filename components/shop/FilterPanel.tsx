import Link from "next/link";
import { centsToDecimalString } from "@/lib/money";
import { fulfilmentChip } from "@/lib/shop/plain-words";
import type { CategoryFacet, SellerFacet } from "@/lib/marketplace/types";
import { listingHref, type ProductFilters } from "@/lib/marketplace/urls";

// The filter controls, as plain links. Rendered twice — once in the desktop
// sidebar and once inside the mobile sheet — from ONE definition, because two
// copies of a filter list is how the phone ends up offering a filter the
// desktop dropped.
//
// Every option carries its COUNT, and an option with a count of zero is not
// rendered at all. A filter that leads to "no results" is a dead end the page
// could have known about before the tap.

export type FilterPanelProps = {
  base: string;
  filters: ProductFilters;
  categories: CategoryFacet[];
  sellers: SellerFacet[];
  priceMin: number | null;
  priceMax: number | null;
  /** True on /shop/c/[slug], where the category is the page and not a filter. */
  categoryLocked?: boolean;
};

const row =
  "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 font-dm text-sm transition-colors";
const rowOff = `${row} text-muted hover:bg-white/[0.04] hover:text-offwhite`;
const rowOn = `${row} bg-yellow/10 font-semibold text-yellow`;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 font-bebas text-[11px] tracking-[0.28em] text-muted/70">{title.toUpperCase()}</p>
      <div className="mt-1.5 space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * Sensible price steps for THIS catalogue, not a fixed ladder.
 *
 * A hardcoded "under Rs 500 / Rs 1,000 / Rs 2,000" is wrong in both directions:
 * useless on a catalogue that tops out at Rs 300, and useless again on one where
 * everything costs thousands.
 *
 * The step is a ROUND FRACTION OF THE SPAN, not a power of ten. The first
 * version used `10^floor(log10(span/3))`, which on a honey page spanning
 * Rs 250–450 produced "Under Rs 260 / 270 / 280 / 290" — four bands inside the
 * bottom quarter of the range, none of which anyone would ever tap. Dividing the
 * span into roughly four and rounding to a 1/2/5 step gives bands that actually
 * cut the catalogue in useful places.
 *
 * All values are integer cents, as everywhere else in this codebase.
 */
export function priceBands(min: number | null, max: number | null): number[] {
  if (min === null || max === null || max <= min) return [];
  const span = max - min;
  // Under Rs 100 apart there is nothing worth choosing between.
  if (span < 10_000) return [];

  const rough = span / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  const step = (normalised >= 5 ? 5 : normalised >= 2 ? 2 : 1) * magnitude;

  const bands: number[] = [];
  for (let v = Math.ceil((min + step) / step) * step; v < max && bands.length < 4; v += step) {
    bands.push(v);
  }
  return bands;
}

export default function FilterPanel({
  base, filters: f, categories, sellers, priceMin, priceMax, categoryLocked = false,
}: FilterPanelProps) {
  const bands = priceBands(priceMin, priceMax);

  return (
    <div className="space-y-6">
      {!categoryLocked && categories.length > 0 && (
        <Group title="Category">
          <Link href={listingHref(base, f, { category: "" })} className={f.category ? rowOff : rowOn}>
            All categories
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={listingHref(base, f, { category: f.category === c.slug ? "" : c.slug })}
              className={f.category === c.slug ? rowOn : rowOff}
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 tabular-nums opacity-60">{c.count}</span>
            </Link>
          ))}
        </Group>
      )}

      <Group title="How you get it">
        {(["pickup", "rr_delivery", "own_delivery"] as const).map((kind) => (
          <Link
            key={kind}
            href={listingHref(base, f, { fulfillment: f.fulfillment === kind ? "" : kind })}
            className={f.fulfillment === kind ? rowOn : rowOff}
          >
            {/* Same words as the cards and the checkout — lib/shop/plain-words.ts. */}
            {fulfilmentChip(kind === "own_delivery" ? "customer_delivery" : kind)}
          </Link>
        ))}
      </Group>

      <Group title="Availability">
        <Link
          href={listingHref(base, f, { inStock: !f.inStock })}
          className={f.inStock ? rowOn : rowOff}
        >
          In stock only
        </Link>
        <Link
          href={listingHref(base, f, { openNow: !f.openNow })}
          className={f.openNow ? rowOn : rowOff}
        >
          Shop open now
        </Link>
      </Group>

      {bands.length > 0 && (
        <Group title="Price">
          {bands.map((v) => (
            <Link
              key={v}
              href={listingHref(base, f, { maxPrice: f.maxPrice === v ? null : v })}
              className={f.maxPrice === v ? rowOn : rowOff}
            >
              Under Rs {centsToDecimalString(v)}
            </Link>
          ))}
        </Group>
      )}

      {sellers.length > 1 && (
        <Group title="Seller">
          {sellers.slice(0, 8).map((s) => (
            <Link
              key={s.slug}
              href={listingHref(base, f, { seller: f.seller === s.slug ? "" : s.slug })}
              className={f.seller === s.slug ? rowOn : rowOff}
            >
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 tabular-nums opacity-60">{s.count}</span>
            </Link>
          ))}
        </Group>
      )}
    </div>
  );
}
