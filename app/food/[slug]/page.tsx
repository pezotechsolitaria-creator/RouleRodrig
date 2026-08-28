import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, Users, Clock, ChefHat, UtensilsCrossed, Info, MessageCircle, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { getFoodItem } from "@/lib/food/queries";
import { centsToDecimalString } from "@/lib/money";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AddressLink from "@/components/AddressLink";
import FoodCard from "@/components/food/FoodCard";
import DishOrderPanel from "@/components/food/DishOrderPanel";
import FoodCartBar from "@/components/food/FoodCartBar";
import { LabelledLink, T, TCount, TDiet, TName } from "@/components/food/FoodCopy";

// The dish page.
//
// ── WHY THIS IS DYNAMIC ────────────────────────────────────────────────────
// Same reason as /food: the Add button's existence depends on the serving
// window, the kitchen's opening hours and today's remaining portions. Caching
// this page would render a live Add button on a dish that sold out an hour ago,
// and the customer would only find out when create_order() refused them at the
// payment step — the worst possible moment to learn it.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const dish = await getFoodItem(supabase, slug);
  if (!dish) return { title: "Dish not found | Roulé Rodrigues" };

  const description =
    dish.descriptor ??
    dish.description?.slice(0, 155) ??
    `Order ${dish.name} in Rodrigues — pick it up or get it delivered.`;

  return {
    title: `${dish.name} — order in Rodrigues | Roulé Rodrigues`,
    description,
    alternates: { canonical: `${SITE_URL}/food/${dish.slug}` },
    openGraph: {
      title: `${dish.name} | Roulé Rodrigues`,
      description,
      url: `${SITE_URL}/food/${dish.slug}`,
      type: "website",
      images: [dish.imageUrl ?? `${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function DishPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const dish = await getFoodItem(supabase, slug);

  // A draft dish, an archived one, or one whose kitchen is paused all resolve to
  // null here — the view filters on the marketplace's own visibility predicate.
  // So an unpublished slug 404s rather than leaking that it exists.
  if (!dish) notFound();

  const prep =
    dish.prepMin != null && dish.prepMax != null
      ? dish.prepMin === dish.prepMax
        ? `${dish.prepMin} min`
        : `${dish.prepMin}–${dish.prepMax} min`
      : null;

  return (
    <main className="min-h-screen bg-dark pb-44 text-offwhite">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Food", url: `${SITE_URL}/food` },
            { name: dish.name, url: `${SITE_URL}/food/${dish.slug}` },
          ]),
          // Product rather than MenuItem: MenuItem has no offer/availability
          // vocabulary that search engines act on, and this dish genuinely is a
          // purchasable thing with a price and a stock state.
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: dish.name,
            description: dish.descriptor ?? dish.description ?? undefined,
            image: dish.images.length ? dish.images : undefined,
            offers: {
              "@type": "Offer",
              priceCurrency: dish.currency,
              price: (dish.price / 100).toFixed(2),
              url: `${SITE_URL}/food/${dish.slug}`,
              availability: dish.orderable
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
          },
        ]}
      />

      {/* ── The photograph is the hero. On a phone it IS the product. ── */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-dark-card sm:aspect-[21/9]">
        {dish.imageUrl ? (
          <Image
            src={dish.imageUrl}
            alt={dish.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted/30">
            <UtensilsCrossed size={44} />
          </span>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-dark to-transparent" />
        <LabelledLink
          href="/food"
          k="dish.backAria"
          className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] inline-flex h-10 w-10 items-center justify-center rounded-full bg-dark/70 text-offwhite backdrop-blur-sm transition-colors hover:text-yellow"
        >
          <ArrowLeft size={18} />
        </LabelledLink>
      </div>

      <div className="mx-auto -mt-6 max-w-2xl px-4 lg:max-w-5xl">
        <div className="lg:grid lg:grid-cols-[1.3fr_1fr] lg:gap-10">
          <div>
            <h1 className="font-syne text-2xl font-extrabold leading-tight sm:text-3xl">{dish.name}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-dm text-sm text-muted">
              <span className="font-syne text-lg font-extrabold text-yellow">
                {dish.variantCount > 1 && <span className="font-dm text-xs font-normal text-muted"><T k="card.from" />{" "}</span>}
                Rs {centsToDecimalString(dish.price)}
              </span>
              {prep && (
                <span className="inline-flex items-center gap-1"><Clock size={13} /> {prep}</span>
              )}
              {dish.serves && dish.serves > 1 && (
                <span className="inline-flex items-center gap-1"><Users size={13} /> <TCount k="dish.serves" n={dish.serves} /></span>
              )}
              {dish.spiceLevel > 0 && (
                <span className="inline-flex items-center gap-0.5 text-orange-400">
                  {Array.from({ length: dish.spiceLevel }).map((_, i) => <Flame key={i} size={13} />)}
                </span>
              )}
            </div>

            {dish.descriptor && (
              <p className="mt-3 font-dm text-base leading-relaxed text-offwhite/90">{dish.descriptor}</p>
            )}
            {dish.description && (
              <p className="mt-3 whitespace-pre-line font-dm text-sm leading-relaxed text-muted">
                {dish.description}
              </p>
            )}

            {dish.dietary.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {dish.dietary.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-dark-card px-3 py-1.5 font-dm text-xs text-muted"
                  >
                    <TDiet tag={tag} />
                  </span>
                ))}
              </div>
            )}

            {dish.allergens && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-dark-card px-4 py-3 font-dm text-xs leading-relaxed text-muted">
                <Info size={14} className="mt-0.5 shrink-0 text-yellow" />
                <span>
                  <span className="font-semibold text-offwhite"><T k="dish.allergens" />{" "}</span>
                  {dish.allergens}
                </span>
              </p>
            )}

            {dish.images.length > 1 && (
              <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {dish.images.slice(1).map((url) => (
                  <div key={url} className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl">
                    <Image src={url} alt="" fill sizes="128px" className="object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* ── The kitchen, deliberately subordinate. It is disclosure and
                trust, not a destination: there is no link, because a kitchen
                page would turn this back into a restaurant directory. ── */}
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-dark-card px-4 py-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow/10 text-yellow">
                <ChefHat size={15} />
              </span>
              <div className="min-w-0">
                <p className="font-dm text-sm text-offwhite">
                  <T k="dish.preparedBy" /> <span className="font-semibold">{dish.kitchenName}</span>
                  {!dish.kitchenOpen && <span className="text-muted"> · <T k="dish.closedNow" /></span>}
                </p>
                {/* The certifier is named, not implied. "Halal certified" on its
                    own asks the customer to trust the platform; the issuer's
                    name is the part they can actually check, and it is the only
                    reason the field is mandatory. The card carries the badge;
                    this is where the badge is accounted for. */}
                {dish.kitchenHalalCertified && (
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 font-dm text-xs text-emerald-200">
                    <BadgeCheck size={13} aria-hidden />
                    <span>
                      <T k="card.halalCertified" />
                      {dish.kitchenHalalCertifier && (
                        <span className="text-emerald-200/70"> · <TName k="dish.halalBy" v={dish.kitchenHalalCertifier} /></span>
                      )}
                    </span>
                  </p>
                )}
                {/* WHERE it is, tappable. The hint used to sit under a map-pin
                    icon that linked to nothing, so "Port Mathurin, near the
                    market" was a sentence rather than directions. */}
                {(dish.kitchenAddress || dish.kitchenLat != null) && (
                  <AddressLink
                    address={dish.kitchenAddress}
                    lat={dish.kitchenLat}
                    lng={dish.kitchenLng}
                    name={dish.kitchenName}
                    size={11}
                    className="mt-0.5 block font-dm text-xs text-muted"
                  />
                )}
                {dish.pickupHint && (
                  <p className="mt-0.5 font-dm text-xs text-muted">{dish.pickupHint}</p>
                )}

                {/* TALK TO THE KITCHEN (M95).
                    Deliberately the one interactive thing in an otherwise
                    subordinate block, because since M89 it is load-bearing: a
                    visitor with a foreign card cannot make a local bank
                    transfer, so without this the site simply has no path for
                    them — they read the menu, reach checkout and stop. It is
                    also who you call when an order goes wrong at 20:00.
                    The message is pre-written with the dish name so the
                    kitchen knows what it is about before they read a word. */}
                {dish.kitchenWhatsapp && (
                  <a
                    href={`https://wa.me/${dish.kitchenWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                      `Hello ${dish.kitchenName}, I saw "${dish.name}" on Roulé Rodrigues and I would like to order it.`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#25D366] px-3.5 font-syne text-sm font-bold text-black transition-opacity hover:opacity-90"
                  >
                    <MessageCircle size={15} /> <T k="dish.messageKitchen" />
                  </a>
                )}
                {dish.kitchenWhatsapp && (
                  <p className="mt-1.5 font-dm text-[11px] leading-snug text-muted">
                    <T k="dish.noBankAccount" />
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* On desktop the order panel sticks beside the dish; on mobile it
              sits directly under it, above the related strip. */}
          <div className="mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-6">
              <DishOrderPanel dish={dish} />
            </div>
          </div>
        </div>

        {dish.related.length > 0 && (
          <section className="mt-12">
            <h2 className="font-syne text-lg font-extrabold text-offwhite"><T k="dish.relatedTitle" /></h2>
            <p className="mt-1 font-dm text-xs text-muted">
              <T k="dish.relatedNote" />
            </p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
              {dish.related.map((item, i) => (
                <FoodCard key={item.id} item={item} variant="rail" index={i} />
              ))}
            </div>
          </section>
        )}
      </div>

      <FoodCartBar />
    </main>
  );
}
