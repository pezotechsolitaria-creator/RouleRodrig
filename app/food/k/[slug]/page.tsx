import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UtensilsCrossed, Clock, BadgeCheck, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { getFoodKitchen } from "@/lib/food/queries";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AddressLink from "@/components/AddressLink";
import FoodCard from "@/components/food/FoodCard";
import FoodCartBar from "@/components/food/FoodCartBar";
import { T, TCount } from "@/components/food/FoodCopy";

// The kitchen page (M168).
//
// /food used to state as a product rule that there is "no kitchen list, no
// kitchen filter, no kitchen page and no kitchen name on any grid card". The
// owner reversed that: he wants /food to carry its restaurants the way /shop
// carries its Island shops. This is the page the rail links to.
//
// ── WHY IT IS DYNAMIC ──────────────────────────────────────────────────────
// Identical reasoning to /food and the dish page: every card carries whether
// the dish can be ordered right now, which folds in the kitchen's opening
// hours, the dish's serving window and today's remaining portions. A page
// cached for even a minute shows a live Add button on a dish that sold out, and
// the customer discovers it when create_order() refuses them at the payment
// step.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const kitchen = await getFoodKitchen(supabase, slug);
  if (!kitchen) return { title: "Kitchen not found" };

  const title = `${kitchen.name} — order food in Rodrigues`;
  const description =
    kitchen.description?.trim() ||
    `${kitchen.name} in Rodrigues Island. ${kitchen.dishCount} dish${
      kitchen.dishCount === 1 ? "" : "es"
    } to pick up or have delivered. Pay the kitchen direct.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/food/k/${kitchen.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/food/k/${kitchen.slug}`,
      images: kitchen.coverUrl ? [{ url: kitchen.coverUrl }] : undefined,
    },
  };
}

export default async function KitchenPage({ params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();
  const kitchen = await getFoodKitchen(supabase, slug);

  // notFound() rather than an empty page: a restaurant rendered with no dishes
  // reads as "this place has closed down", when the truth is "this address is
  // wrong".
  if (!kitchen) notFound();

  const prep =
    kitchen.prepMin && kitchen.prepMax
      ? kitchen.prepMin === kitchen.prepMax
        ? `${kitchen.prepMin} min`
        : `${kitchen.prepMin}–${kitchen.prepMax} min`
      : null;

  return (
    <main className="min-h-screen bg-dark pb-28">
      <JsonLd
        data={breadcrumbLd([
          { name: "Food", url: `${SITE_URL}/food` },
          { name: kitchen.name, url: `${SITE_URL}/food/k/${kitchen.slug}` },
        ])}
      />

      <div className="mx-auto max-w-5xl px-4 pt-6">
        <Link
          href="/food"
          className="inline-flex items-center gap-1.5 font-dm text-xs text-muted hover:text-yellow"
        >
          <ArrowLeft size={14} />
          <T k="chrome.kitchenBack" />
        </Link>

        <header className="mt-4 flex items-start gap-3">
          {kitchen.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={kitchen.logoUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow">
              <UtensilsCrossed size={22} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="font-syne text-2xl font-extrabold text-offwhite">
              {kitchen.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-dm text-xs text-muted">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  kitchen.isOpen
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-white/5 text-muted"
                }`}
              >
                <T k={kitchen.isOpen ? "chrome.kitchenOpen" : "chrome.kitchenClosed"} />
              </span>
              <span>
                <TCount k="chrome.kitchenDishes" n={kitchen.dishCount} />
              </span>
              {prep && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} /> {prep}
                  </span>
                </>
              )}
              {/* Halal is a fact a customer may be searching for specifically,
                  so it is shown with its certifier rather than as a bare badge
                  — an unattributed claim is worth less than none. */}
              {kitchen.halal && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <BadgeCheck size={12} />
                    {kitchen.halalCertifier
                      ? `Halal — ${kitchen.halalCertifier}`
                      : "Halal"}
                  </span>
                </>
              )}
            </div>
          </div>
        </header>

        {kitchen.description && (
          <p className="mt-4 max-w-2xl font-dm text-sm leading-relaxed text-offwhite/80">
            {kitchen.description}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-dm text-xs text-muted">
          {kitchen.address && (
            <AddressLink
              address={kitchen.address}
              lat={kitchen.lat}
              lng={kitchen.lng}
              name={kitchen.name}
              size={12}
            />
          )}
          {kitchen.phone && (
            <a
              href={`tel:${kitchen.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1.5 hover:text-yellow"
            >
              <Phone size={12} /> {kitchen.phone}
            </a>
          )}
        </div>

        {kitchen.pickupHint && (
          <p className="mt-3 rounded-xl border border-white/10 bg-dark-card px-3 py-2 font-dm text-xs text-offwhite/80">
            {kitchen.pickupHint}
          </p>
        )}

        <h2 className="mt-9 font-syne text-lg font-extrabold text-offwhite">
          <T k="chrome.kitchenMenu" />
        </h2>
        {/* A grid, not the swipe rail /food uses. A rail's peek exists to say
            "this row moves sideways"; here the menu IS the page, so it scrolls
            down like a menu does. */}
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kitchen.items.map((item, i) => (
            <FoodCard key={item.id} item={item} index={i} />
          ))}
        </div>
      </div>

      <FoodCartBar />
    </main>
  );
}
