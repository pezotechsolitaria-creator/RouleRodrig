import { DEFAULT_CONTENT, type RecommendedPlace, type SiteContent } from "@/lib/defaults";
import type { TransferFares } from "@/lib/rides/fares";
import { deliveryFee } from "@/lib/booking-pricing";
import { EXPERIENCES, experiencesOfType, fromPriceOf } from "@/lib/experiences";
import { experiencesFaq, priceRangeOf, type PriceRange } from "@/lib/experiences-faq";
import { foodFaq } from "@/lib/food-faq";
import { placePrice } from "@/lib/place-detail";
import { placePageHref, placesWithOwnPage } from "@/lib/place-slug";
import { hubBlurb, liveFromPrice } from "@/lib/live-prices";
import { isSellableFleetItem } from "@/lib/site-data";
import { FR_PAGES, GUIDE_PAGES } from "@/lib/nav/hubs";
import { BLOG_POSTS } from "@/lib/blog";
import { taxiFaq, type TaxiFaqItem } from "@/lib/taxi-faq";
import {
  money,
  passengersCovered,
  portMathurin,
  timeSentences,
  transferFaq,
  zoneFaresSentence,
} from "@/lib/transfers-faq";

// ── llms.txt, BUILT FROM WHAT THE PAGES READ (SEO audit 2026-09-29 C8, T20) ──
//
// public/llms.txt was a file edited by hand, so it drifted exactly the way the
// hand-typed prices did: "les 12 plus belles plages" beside a page titled 19,
// "cars … delivered free" beside a car that charges for delivery, an events
// line promising tickets while /events said nothing was on sale, "island
// kitchens" when there is one, no airport transfer page, no emergency page and
// not a word about how to pay. It was also the file an assistant reads FIRST
// and quotes with our name on it.
//
// Now app/llms.txt/route.ts and app/llms-full.txt/route.ts read the same data
// the pages read — getContent(), readTransferFares(), the food catalog, the
// events list — and hand it to these two pure functions. Every figure below is
// computed from that data at request time, through the helpers the pages use
// (fleetFromPrice, fromPriceOf/placePrice, the transfer sentences). Where the
// data is missing, the line prints no number rather than a remembered one.
// Nothing in this file is a price.

/** What the food catalog says, reduced to what the index needs. */
export type LlmsFood = {
  kitchens: { name: string; address: string | null; minNoticeHours: number }[];
  /** Minor units (cents), one per dish on sale. */
  dishPrices: number[];
  deliveryEnabled: boolean;
};

export type LlmsData = {
  /** Absolute origin, e.g. SITE_URL. */
  siteUrl: string;
  content: SiteContent;
  fares: TransferFares;
  /** Null when the catalog could not be read. */
  food: LlmsFood | null;
  /** True only while at least one event has tickets on sale. */
  eventsOnSale: boolean;
};

// ── WHEN THE CONTENT ROW COULD NOT BE READ ──────────────────────────────────
// getContent() answers a failed read with the seed copy, and the seed's fleet
// says "From Rs 800" and "From Rs 600" — prices nobody is charged — beside a
// phone number of "+230 5XXX XXXX". A page shows that for a minute; this file
// is cached for an hour and quoted with our name on it. So a seed read, or no
// read, becomes content with no listings, no FAQ and no pins: every line that
// needs a figure prints none, and the file still maps the site. Never a 500.

/** The seed with everything that carries a figure or a listing taken out. */
export const UNREAD_CONTENT: SiteContent = {
  ...DEFAULT_CONTENT,
  fleet: [],
  recommended: { ...DEFAULT_CONTENT.recommended, items: [] },
  faq: { ...DEFAULT_CONTENT.faq, enabled: false },
  mapLocations: [],
};

/** True when every fleet row is a seed row, price and all: the owner's fleet
 *  was not what came back. */
export function isSeedContent(content: Pick<SiteContent, "fleet">): boolean {
  const seed = new Set(DEFAULT_CONTENT.fleet.map((f) => `${f.id}|${f.price}`));
  return content.fleet.length > 0 && content.fleet.every((f) => seed.has(`${f.id}|${f.price}`));
}

/** What both files are built from when the reads failed outright. */
export function unreadLlmsData(siteUrl: string): LlmsData {
  return {
    siteUrl,
    content: UNREAD_CONTENT,
    fares: { airport: null, ferry: null },
    food: null,
    eventsOnSale: false,
  };
}

/** Whole rupees, grouped the way the English pages write money. */
const rs = (n: number) => `Rs ${n.toLocaleString("en-US")}`;
/** French grouping, with a plain space rather than the narrow one, for plain text. */
const rsFr = (n: number) => `Rs ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;

/** A hub title whose count the page computes live ("The 20 best beaches")
 *  loses the count here; the page says it, this file cannot keep up with it. */
const withoutCount = (t: string) => t.replace(/^(Les|The) \d+ /, "$1 ");

/**
 * A contact field the owner actually set. getContent() falls back to the seed
 * copy when the database cannot be read, and the seed's phone is literally
 * "+230 5XXX XXXX": the one place an invented number would reach an assistant.
 */
function realContact(value: string | undefined, seed: string): string | null {
  const v = (value ?? "").trim();
  return v && v !== seed ? v : null;
}

/**
 * "delivered free to your guest house" only when the fee that charges it is 0
 * AND no unit's own price note puts a condition on delivery. The Swift reads
 * "Rs 1899(Book for more than 2 days to get free delivery!!)" while the car
 * fee is 0 — the old file said "delivered free" and the owner's note said
 * otherwise (SEO audit 2026-09-29 C8, C20). Until he settles it, this says
 * "delivered", which both agree on. The scooters' bare "(free delivery)" is
 * not a condition. With no sellable unit to read, no claim either way.
 */
function deliveryPhrase(content: SiteContent, category: "scooter" | "car"): string {
  const units = content.fleet.filter(
    (f) => (f.category ?? "scooter") === category && isSellableFleetItem(f),
  );
  const conditioned = units.some((f) =>
    /deliver/i.test((f.price ?? "").replace(/\(\s*free delivery\s*\)/gi, "")),
  );
  const free =
    units.length > 0 &&
    !conditioned &&
    deliveryFee({ price: "", category }, content.vehicleCategories) === 0;
  return free ? "delivered free to your guest house" : "delivered to your guest house";
}

function line(siteUrl: string, path: string, label: string, text: string): string {
  return `- [${label}](${siteUrl}${path}): ${text}`;
}

/** The owner's own price note, verbatim, or the number placePrice() reads. */
function listingPrice(p: { priceNote?: string | null; depositAmount?: number | null }): string | null {
  const n = placePrice(p);
  if (n == null) return null;
  const note = (p.priceNote ?? "").trim();
  return note && /\d/.test(note) ? note : rs(n);
}

/**
 * Whether the booking form takes a payment for this listing — the form's own
 * test (components/PlaceBookingModal.tsx `hasPrice`), which is also what an
 * experience page passes to howBookingWorks(). A price NOTE is not an amount:
 * Île aux Cocos, the spa ritual and the sunrise hike show a price and carry no
 * depositAmount, so the form offers no way to pay, online or in cash, and the
 * owner replies with how to pay (SEO audit 2026-09-29 C4, C8). This file said
 * "a listing with no price is a request only" and then printed a price on all
 * three, telling an assistant they could be paid by MCB Juice or PayPal.
 */
function paysOnSite(p: Pick<RecommendedPlace, "category" | "depositAmount" | "nightlyRate">): boolean {
  return Number(p.depositAmount) > 0 || (p.category === "hotel" && Number(p.nightlyRate) > 0);
}

/** What a request-only listing's line says instead of a way to pay. */
const REQUEST_ONLY = "request only: nothing is paid on the site; once the date is confirmed, we tell you how to pay";

/** Every kitchen needs the same notice → that notice, else null. */
function sharedNotice(food: LlmsFood): number | null {
  const hours = [...new Set(food.kitchens.map((k) => k.minNoticeHours))];
  return hours.length === 1 && hours[0] > 0 ? hours[0] : null;
}

function foodLine(siteUrl: string, food: LlmsFood | null): string {
  if (!food || food.kitchens.length === 0) {
    return line(siteUrl, "/food", "Order local food", "Rodriguan dishes ordered on the site, paid in cash when you collect");
  }
  const names = food.kitchens.map((k) => k.name).join(", ");
  const one = food.kitchens.length === 1 ? food.kitchens[0] : null;
  const where = one?.address ? ` at ${one.address}` : "";
  const notice = sharedNotice(food);
  const parts = [
    `Rodriguan dishes from ${names}${where}`,
    notice ? `order at least ${notice} hours ahead` : "each dish says how far ahead to order",
    `choose your collection time${food.deliveryEnabled ? " or have it delivered" : ""}`,
    "pay in cash when you collect",
  ];
  const prices = food.dishPrices.filter((c) => c > 0);
  if (prices.length) {
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    parts.push(lo === hi ? `dishes ${money(lo)}` : `dishes ${money(lo)} to ${money(hi)}`);
  }
  return line(siteUrl, "/food", "Order local food", parts.join(" — "));
}

export function buildLlmsTxt(d: LlmsData): string {
  const { siteUrl: u, content } = d;
  const seed = DEFAULT_CONTENT.contact;
  const c = content.contact;
  const phone = realContact(c.phone, seed.phone);
  const email = realContact(c.email, seed.email);
  const location = realContact(c.location, seed.location);
  const hours = realContact(c.hours, seed.hours);

  const scooterFrom = liveFromPrice(content, "scooter");
  const carFrom = liveFromPrice(content, "car");
  const staysFrom = liveFromPrice(content, "stays");
  const airport = d.fares.airport;
  const pm = portMathurin(airport);

  const priceSummary = [
    scooterFrom ? `Scooters from ${rs(scooterFrom)} a day, ${deliveryPhrase(content, "scooter")}.` : "",
    carFrom ? `Cars from ${rs(carFrom)} a day, ${deliveryPhrase(content, "car")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const summary = [
    "Roule Rodrigues rents scooters and cars on Rodrigues Island (Mauritius), direct from local owners, with delivery to your guest house and in-person handover.",
    `It is also a free island companion: handpicked stays and experiences${d.eventsOnSale ? ", event tickets" : ""}, taxis and airport transfers, and guides to beaches, viewpoints, hiking and local food written by locals.`,
    location ? `Based in ${location}.` : "",
    "Booking is direct — no agency, no booking fees.",
    priceSummary,
    "Site in English and French (audience largely French-speaking: Reunion, Mauritius, France); WhatsApp support in English, French and Creole.",
  ]
    .filter(Boolean)
    .join(" ");

  const transfersText = airport
    ? [
        `fixed fares by zone, by road from Plaine Corail airport: ${zoneFaresSentence(airport)}, one way${pm ? `; Port Mathurin ${money(airport.oneWay[pm.zone - 1])}` : ""}.`,
        `The fare covers ${passengersCovered(airport)}${airport.extraPassengerFee > 0 ? `; each extra passenger adds ${money(airport.extraPassengerFee)}` : ""}.`,
        ...timeSentences(airport),
        "Return packages; you pay the driver.",
      ].join(" ")
    : "fixed fares by zone from Plaine Corail airport, booked before you land; you pay the driver";

  // /guide/shops exists only once the owner has pinned a shop (the sitemap's
  // own gate); every other guide is a fixed route.
  const hasShops = content.mapLocations.some((l) => l.category === "shop");
  const guides = GUIDE_PAGES.filter((g) => g.href !== "/guide/shops" || hasShops);

  // Experience categories that have something in them, and nothing else: an
  // empty category page is not an answer (C16).
  //
  // The DESCRIPTION, not the subtitle (C8, T15). The subtitles are hand-typed
  // marketing lines — "big game, coastal or traditional", "islets and
  // sunsets", "at your hotel, or theirs" — naming offers no listing has, and
  // 1c8e7711 rewrote the descriptions against the real listings to take those
  // offers out. Beside "From Rs …", a subtitle told an assistant big-game
  // fishing was sold at that price. Each description ends in a full stop and
  // is sized to leave room for the price, as the category page's meta does.
  const types = (["massage", "fishing", "boat", "hiking"] as const)
    .map((t) => ({ t, list: experiencesOfType(content.recommended.items, t) }))
    .filter(({ list }) => list.length > 0)
    .map(({ t, list }) => {
      const from = fromPriceOf(list);
      return line(u, `/experiences/${EXPERIENCES[t].slug}`, EXPERIENCES[t].title, `${EXPERIENCES[t].description}${from ? ` From ${rs(from)}.` : ""}`);
    });

  // The owner's price note stays verbatim; a listing the form takes no
  // payment for says so on its own line (C4, C8), so the pay rule below cannot
  // be read as covering it. With no price at all, "price on the listing" was
  // false — there is none on it.
  const bookable = placesWithOwnPage(content.recommended.items).map((p) => {
    const price = listingPrice(p);
    const text = paysOnSite(p)
      ? price
        ? `price: ${price}`
        : "price on the listing"
      : price
        ? `price: ${price} (${REQUEST_ONLY})`
        : `no price listed (${REQUEST_ONLY})`;
    return line(u, placePageHref(p), p.name.trim(), text);
  });

  const out: string[] = [
    "# Roule Rodrigues",
    "",
    `> ${summary}`,
    "",
    "## Rent and get around",
    "",
    line(u, "/browse/scooter", "Scooter rental in Rodrigues", `${scooterFrom ? `from ${rs(scooterFrom)}/day, ` : ""}${deliveryPhrase(content, "scooter")}, helmet included, online booking`),
    line(u, "/browse/car", "Car rental in Rodrigues", `${carFrom ? `from ${rs(carFrom)}/day, ` : ""}${deliveryPhrase(content, "car")} or met at Plaine Corail airport, online booking`),
    line(u, "/transfers", "Airport transfers in Rodrigues", transfersText),
    line(u, "/taxi", "Taxis on Rodrigues", "independent local drivers you can call, message or book online; for any ride other than an airport transfer, the driver's price is confirmed with you before anything is agreed"),
    line(u, "/browse/getting-around", "Getting around Rodrigues", "taxis, transfers, scooter and car hire compared"),
    line(u, "/map", "Rodrigues map", "beaches, viewpoints, fuel stations and landmarks on one interactive map, with directions"),
    line(u, "/deliver", "Get anything delivered in Rodrigues", "post what you need collected or bought; local drivers send you their price and you choose"),
    "",
    "## Stay and do",
    "",
    // The page's own checked wording (its meta description, rewritten in
    // 1c8e7711), not the old file's "lodges and hotels", which it dropped (C8).
    line(u, "/browse/stays", "Where to stay in Rodrigues", `guesthouses, self-catering houses and villas${staysFrom ? `, from ${rs(staysFrom)} a night` : " with nightly prices"}`),
    line(u, "/browse/activities", "Things to do", "bookable activities, price per person and session length on each listing"),
    line(u, "/browse/tours", "Guided tours and boat trips", "Ile aux Cocos and its bird sanctuary, snorkelling at Riviere Banane, traditional fishing, lagoon trips - with local skippers"),
    line(u, "/experiences", "All experiences in one place", "the door for someone who does not yet know which kind they want"),
    ...types,
    ...(d.eventsOnSale ? [line(u, "/events", "Events and tickets", "what's on now, each event with its own ticket page")] : []),
    foodLine(u, d.food),
    ...(bookable.length ? ["", "## Experiences you can book", "", ...bookable] : []),
    "",
    "## Discover",
    "",
    ...guides.map((g) => line(u, g.href, withoutCount(g.title), g.blurb)),
    "",
    "## En français",
    "",
    line(u, "/fr", "Rodrigues en français", "tous nos guides en français"),
    ...FR_PAGES.map((p) => line(u, p.href, withoutCount(p.title), `${hubBlurb(content, p, rsFr)} En français.`)),
    "",
    "## Practical answers",
    "",
    ...BLOG_POSTS.map((p) => line(u, `/blog/${p.slug}`, p.title, p.description)),
    line(u, "/faq", "FAQ — licences, insurance, deposits, delivery", "the questions we are asked most"),
    // No coastguard: usefulContacts holds none, and /emergency stopped
    // promising one for the same reason (audit C7/T3).
    line(u, "/emergency", "Emergency numbers in Rodrigues", "police, hospital, fire and local contacts, every number tap-to-call"),
    line(u, "/about", "About Roule Rodrigues", "who runs the site and where to find us"),
    "",
    // Rule of the house, as of 29 Sept 2026: the payment step offers MCB Juice
    // or bank transfer (components/BankTransferDetails) and PayPal, which
    // takes cards; M220 lets the customer ASK to pay in person; a listing the
    // form has no amount for (no depositAmount; for a stay, no nightly rate)
    // takes nothing on the site, even when its note shows a price, and is
    // marked "request only" on its own line above (C4, C8); food is cash at
    // collection (M201); taxi fares go to the driver (refunds §10); event
    // checkout offers the organiser's own methods. No method is listed that is
    // not offered.
    "## How to pay",
    "",
    "- Scooters, cars, stays, activities and tours: you request online and we confirm availability first; nothing is charged until then. You then pay online by MCB Juice, bank transfer or PayPal (cards go through PayPal), or ask to pay in person in cash, and we tell you whether you can. A listing with no price on it is a request only, and so is any listing marked request only above, whatever price it shows: nothing is paid on the site, and we reply with how to pay.",
    `- Food: ordered ahead on the site${d.food && sharedNotice(d.food) ? ` (at least ${sharedNotice(d.food)} hours)` : ""} and paid to the kitchen in cash when you collect.`,
    "- Taxis and airport transfers: paid in cash directly to the driver; Roule Rodrigues never takes payment for a ride. Airport transfers are at the zone fares above; any other ride is at the driver's price, confirmed with you before anything is agreed.",
    ...(d.eventsOnSale
      ? ["- Event tickets: by bank transfer or in cash, whichever the organiser accepts; each event's checkout shows which."]
      : []),
    "",
    "## Contact",
    "",
    ...(phone ? [`- WhatsApp/phone: ${phone} (usually replies within minutes)`] : []),
    ...(email ? [`- Email: ${email}`] : []),
    ...(location ? [`- Base: ${location}`] : []),
    ...(hours ? [`- Hours: ${hours}`] : []),
    `- Full answers, in plain text: ${u}/llms-full.txt`,
    "",
  ];
  return out.join("\n");
}

// ── llms-full.txt ────────────────────────────────────────────────────────────

/** `more` is the whole trailing pointer, already in the answer's language. */
function qa(items: { q: string; a: string; more?: string }[]): string[] {
  return items.flatMap((f) => [`### ${f.q}`, "", f.more ? `${f.a} ${f.more}` : f.a, ""]);
}

/** The taxi FAQ, with the link the page renders under an answer spelled out. */
function fromTaxi(u: string, items: TaxiFaqItem[], lang: "en" | "fr") {
  const label = lang === "fr" ? "Voir :" : "More:";
  return items.map((f) => ({
    q: f.question,
    a: f.answer,
    more: f.link ? `${label} ${u}${f.link.href}` : undefined,
  }));
}

/**
 * The experiences hub's price range, measured exactly as ExperiencesHub does:
 * the activities app/experiences/page.tsx hands it, through priceRangeOf() and
 * placePrice(), so the answer names the same listing at each end. Null with
 * nothing priced: the FAQ's own fallback range is a remembered figure, not a
 * live one.
 */
function experienceRange(content: SiteContent): PriceRange | null {
  const places = content.recommended.items.filter(
    (p) => p.category === "activity" && p.name.trim() && (p.image || p.images?.[0]),
  );
  return priceRangeOf(places.map((p) => ({ name: p.name, price: placePrice(p) })));
}

/** Whole-rupee figures in a sentence: "Rs 1,000" and "Rs 1 000" both → 1000. */
function rupeeFigures(text: string): number[] {
  return [...text.matchAll(/Rs\s?(\d{1,3}(?:[ ,  ]\d{3})+|\d+)/g)].map((m) =>
    Number(m[1].replace(/\D/g, "")),
  );
}

/**
 * lib/food-faq.ts types its price answer ("from Rs 1,000 up to Rs 2,500").
 * This file prints no figure it did not read, so an answer is kept only while
 * every figure in it is a price the catalog is charging today — and dropped,
 * not rewritten, the day one is not. Answers with no figure pass untouched.
 */
function foodFaqLive(lang: "en" | "fr", food: LlmsFood | null) {
  const live = new Set((food?.dishPrices ?? []).filter((c) => c > 0).map((c) => Math.round(c / 100)));
  return foodFaq(lang)
    .filter((f) => rupeeFigures(f.answer).every((n) => live.has(n)))
    .map((f) => ({ q: f.question, a: f.answer }));
}

export function buildLlmsFullTxt(d: LlmsData): string {
  const { siteUrl: u, content } = d;
  const airport = d.fares.airport;
  const range = experienceRange(content);
  // With no live range, the one answer that quotes a range is left out rather
  // than answered with the fallback figures.
  const exp = (lang: "en" | "fr") =>
    experiencesFaq(lang, range ?? undefined)
      .filter((f) => range || !/Rs\s?\d/.test(f.answer))
      .map((f) => ({ q: f.question, a: f.answer }));
  const siteFaq = content.faq.enabled
    ? (content.faq.items ?? []).filter((i) => i.question?.trim() && i.answer?.trim())
    : [];

  const section = (title: string, path: string, items: { q: string; a: string; more?: string }[]) =>
    items.length ? [`## ${title}`, "", `Source: ${u}${path}`, "", ...qa(items)] : [];

  const out: string[] = [
    "# Roule Rodrigues — the answers in full",
    "",
    `> The questions travellers ask about Rodrigues Island, answered in the words the site's own pages use, section by section. The short index is ${u}/llms.txt.`,
    "",
    ...section("Frequently asked questions", "/faq", siteFaq.map((i) => ({ q: i.question.trim(), a: i.answer.trim() }))),
    ...section("Taxis on Rodrigues", "/taxi", fromTaxi(u, taxiFaq("en", airport), "en")),
    ...section("Airport transfers", "/transfers", transferFaq(d.fares)),
    ...section("Ordering food", "/food", foodFaqLive("en", d.food)),
    ...section("Experiences", "/experiences", exp("en")),
    // The same modules in French: what /taxi, /food and /experiences show a
    // reader who has switched the site to French.
    ...section("Le taxi à Rodrigues (en français)", "/taxi", fromTaxi(u, taxiFaq("fr", airport), "fr")),
    ...section("Commander à manger (en français)", "/food", foodFaqLive("fr", d.food)),
    ...section("Les activités (en français)", "/experiences", exp("fr")),
  ];
  return out.join("\n");
}
