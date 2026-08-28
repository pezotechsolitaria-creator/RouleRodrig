"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { FOOD_COPY, type FoodCopy } from "@/lib/food/copy.i18n";
import { ShopHeader } from "@/components/shop/ShopChrome";
import BrowseBackBar from "@/components/BrowseBackBar";

// ── How a SERVER page in /food says a translated word ───────────────────────
//
// app/food/page.tsx and app/food/[slug]/page.tsx are `force-dynamic` server
// components, and they have to stay that way: both decide whether a dish can be
// ordered RIGHT NOW from the kitchen's hours, the serving window and today's
// remaining portions, and both build JSON-LD from the same read. The chosen
// language is not a cookie and not a route segment — context/LanguageContext.tsx
// keeps it in localStorage and restores it after mount — so there is nothing on
// the server to read it from.
//
// app/deliver/DeliverTitle.tsx solved this for ONE heading with a tiny client
// child, and components/shop/ShopCopy.tsx generalised it for a surface with a
// hundred strings. This is the same idea at /food's size: the smallest possible
// client leaves — a hook call and a text node — with the grid, the cards, the
// photographs and the structured data all still server-rendered.
//
// The consequence DeliverTitle already recorded holds here too: the provider
// starts on "en", so the server-rendered HTML is English and corrects itself
// after hydration. A crawler and a reader with no JavaScript get the English the
// page's metadata and JSON-LD already promise.
//
// Components that are already client-side (DishOrderPanel, FoodQuickAdd,
// FoodCartBar, FulfillmentBar) do NOT need these — they call useFoodCopy() and
// read the object.

export function useFoodCopy(): FoodCopy {
  const { language } = useLanguage();
  return FOOD_COPY[language];
}

/**
 * Every dotted path in the copy tree whose leaf has type `L`.
 *
 * The function check has to come BEFORE the object check: in TypeScript a
 * function is also an object, so without it `results.forQuery` would be walked
 * into and produce paths like "results.forQuery.call".
 */
type LeafOf<O, L> = {
  [K in keyof O & string]: O[K] extends L
    ? K
    : O[K] extends (...args: never[]) => unknown
      ? never
      : O[K] extends object
        ? `${K}.${LeafOf<O[K], L>}`
        : never;
}[keyof O & string];

/** A plain string: `<T k="chrome.search" />`. */
export type TextKey = LeafOf<FoodCopy, string>;
/** A count: `<TCount k="results.count" n={12} />`. */
export type CountKey = LeafOf<FoodCopy, (n: number) => string>;
/** One substitution: `<TName k="results.forQuery" v={q} />`. */
export type NameKey = LeafOf<FoodCopy, (v: string) => string>;

function at(copy: FoodCopy, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], copy);
}

export function T({ k }: { k: TextKey }) {
  const copy = useFoodCopy();
  return <>{at(copy, k) as string}</>;
}

export function TCount({ k, n }: { k: CountKey; n: number }) {
  const copy = useFoodCopy();
  return <>{(at(copy, k) as (n: number) => string)(n)}</>;
}

export function TName({ k, v }: { k: NameKey; v: string }) {
  const copy = useFoodCopy();
  return <>{(at(copy, k) as (v: string) => string)(v)}</>;
}

/**
 * A rail heading.
 *
 * food_home() writes the title itself (M51), in English, for every reader — the
 * rails are chosen by the clock in SQL and their titles are literals in the
 * migration, not owner data. So the key is what gets looked up and the RPC's own
 * title is the fallback, which keeps a rail that this file has never heard of
 * rendering exactly what it renders today.
 */
export function TRail({ railKey, fallback }: { railKey: string; fallback: string }) {
  const copy = useFoodCopy();
  return <>{(copy.rails as Record<string, string>)[railKey] ?? fallback}</>;
}

/**
 * A dietary tag's label. The TAG is wire format — it is what `?diet=` carries
 * and what browse_food() matches — and only the label passing through here is
 * display. An unknown tag falls back to itself, exactly as DIETARY_LABEL does.
 */
export function TDiet({ tag }: { tag: string }) {
  const copy = useFoodCopy();
  return <>{(copy.dietary as Record<string, string>)[tag] ?? tag}</>;
}

/**
 * Why a dish cannot be ordered. The REASON is the database's own value; only
 * this sentence is display.
 */
export function TUnavailable({ reason }: { reason: string | null }) {
  const copy = useFoodCopy();
  const label = reason
    ? (copy.unavailable as Record<string, string>)[reason]
    : undefined;
  return <>{label ?? copy.card.unavailable}</>;
}

/** The /food h1. The second half is the yellow one, so it comes in two pieces. */
export function FoodTitle({ className, accentClassName }: {
  className?: string;
  accentClassName?: string;
}) {
  const copy = useFoodCopy();
  return (
    <h1 className={className}>
      {copy.chrome.titleLead}
      <span className={accentClassName}>{copy.chrome.titleAccent}</span>
    </h1>
  );
}

/**
 * ShopHeader with a translated back label.
 *
 * The header speaks for ITSELF out of SHOP_COPY; `backLabel` is a plain string
 * the caller owns, and its own header says so. This is /food's caller.
 */
export function FoodBackHeader({ backHref }: { backHref: string }) {
  const copy = useFoodCopy();
  return <ShopHeader backHref={backHref} backLabel={copy.chrome.backHome} />;
}

/** BrowseBackBar's breadcrumb on /food/concierge. */
export function ConciergeBackBar() {
  const copy = useFoodCopy();
  return <BrowseBackBar title={copy.concierge.backBarTitle} />;
}

/** The search box. Its placeholder is an attribute, so it cannot be a text node. */
export function FoodSearchInput({ defaultValue, className, children }: {
  defaultValue: string;
  className?: string;
  /** The magnifying glass, rendered by the server page. */
  children: ReactNode;
}) {
  const copy = useFoodCopy();
  return (
    <div className="relative flex-1">
      {children}
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={copy.chrome.searchPlaceholder}
        className={className}
      />
    </div>
  );
}

/** A <nav> whose aria-label needs translating. Children stay server-rendered. */
export function LabelledNav({ k, className, children }: {
  k: TextKey;
  className?: string;
  children: ReactNode;
}) {
  const copy = useFoodCopy();
  return (
    <nav aria-label={at(copy, k) as string} className={className}>
      {children}
    </nav>
  );
}

/** A <Link> whose aria-label is a word rather than its visible text. */
export function LabelledLink({ k, href, className, children }: {
  k: TextKey;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const copy = useFoodCopy();
  return (
    <Link href={href} aria-label={at(copy, k) as string} className={className}>
      {children}
    </Link>
  );
}

/** The flames beside a dish name, and the sentence a screen reader hears. */
export function SpiceAria({ level, className, children }: {
  level: number;
  className?: string;
  children: ReactNode;
}) {
  const copy = useFoodCopy();
  return (
    <span className={className} aria-label={copy.card.spiceAria(level)}>
      {children}
    </span>
  );
}

/**
 * The concierge footer's sentence, whose middle words are highlighted.
 *
 * Three pieces rather than three separate leaves: French and Kreol put the
 * emphasised phrase in a different position in the sentence, and only the
 * language that owns the sentence can decide what comes before and after it.
 */
export function ConciergeLead({ className, strongClassName }: {
  className?: string;
  strongClassName?: string;
}) {
  const copy = useFoodCopy();
  return (
    <p className={className}>
      {copy.concierge.lead}
      <span className={strongClassName}>{copy.concierge.strong}</span>
      {copy.concierge.tail}
    </p>
  );
}
