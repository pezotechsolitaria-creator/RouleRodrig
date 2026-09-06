// ── Every word the marketplace chrome says, in three languages ──────────────
//
// ── WHY THIS IS NOT IN lib/i18n.ts ─────────────────────────────────────────
// Same reason as lib/delivery/copy.i18n.ts and lib/rides/copy.i18n.ts: the site
// dictionary is imported by the navbar, so it ships on every page of
// roulerodrig.com. These keys belong to /shop and would ride along on the home
// page, the blog and the map for nothing. It reuses the same `Language` union,
// the same LanguageProvider and the same localStorage key, so somebody who
// chose Kreol at the door is still in Kreol here.
//
// ── WHAT IS IN HERE AND WHAT IS NOT ────────────────────────────────────────
// UI CHROME ONLY. Product names, product descriptions, attribute keys, brands,
// variant names, category names, store names, taglines, addresses and review
// bodies all come out of Supabase and stay exactly as the owner and the
// merchants wrote them. Translating a category belongs in the `categories`
// table beside the *Fr/*Cr sibling columns this repo already uses elsewhere,
// not in code.
//
// Three more things deliberately absent, each of which would be an outage
// rather than a translation:
//   • lib/shop/plain-words.ts — the open/closed badge, the fulfilment chips and
//     "Not selling online yet". It is shared with /checkout and lib/food, its
//     own header says it is the one place that wording changes, and
//     app/shop/[storeSlug]/[productSlug] picks an icon by comparing a chip
//     string to FULFILMENT.*.chip. It stays English until that file is done.
//   • PRODUCT_SORTS, FULFILMENT_FILTERS, category slugs, URL parameter names
//     and every analytics event name. Those are wire format.
//   • `export const metadata`, `generateMetadata` and all JSON-LD. The chosen
//     language lives ONLY in localStorage (context/LanguageContext.tsx), so the
//     server cannot know it when the document head is built — and the
//     structured data has to keep matching the canonical English page.
//
// ── ON THE KREOL ───────────────────────────────────────────────────────────
// Follows the house style settled in lib/rides/copy.i18n.ts: <s> not <ch>, and
// the reader is "ou", never "to". Kreol does not inflect plurals, so every
// count function below is written per-language rather than sharing one "s"
// suffix — `${n} prodwi`, not `${n} prodwis`.
//
// IT HAS NOT BEEN READ BY A NATIVE SPEAKER. Correct in structure, waiting for
// an ear on the island. And the thing worth repeating from the delivery file:
// FRENCH is the accessibility win here — people on Rodrigues READ French.

import type { Language } from "@/lib/i18n";

/**
 * The grouping key for a product with no category on a storefront.
 *
 * NOT display text. app/shop/[storeSlug]/page.tsx uses it three ways at once:
 * as the bucket name, as the sort sentinel that keeps the bucket last, and as
 * the seed for the `#cat-more` anchor that CategoryRail scroll-spies against.
 * Translating it in place would break the sort AND the anchor, so the value is
 * frozen here and only its LABEL — `store.moreSection` — is translated.
 */
export const UNCATEGORISED = "More";

const EN = {
  // ── Where "back" goes, named ─────────────────────────────────────────────
  nav: {
    home: "Home",
    /** Lower-case: it only ever appears inside `header.backTo`. */
    marketplace: "the marketplace",
    /** Title case: a heading, a breadcrumb link, a back button's own label. */
    marketplaceTitle: "Marketplace",
  },

  // ── The sticky bar, on every marketplace screen ──────────────────────────
  header: {
    backTo: (place: string) => `Back to ${place}`,
    searchPlaceholder: "Search Rodrigues",
    searchLabel: "Search the marketplace",
    savedLabel: (n: number) => `Saved, ${n} product${n === 1 ? "" : "s"}`,
    bagLabel: (n: number) => `Bag, ${n} item${n === 1 ? "" : "s"}`,
    bagEmpty: "Bag, empty",
    viewBag: "View bag",
    /** The CartBar pill when the shopper has baskets at several shops. */
    shops: (n: number) => `${n} shops`,
  },

  // ── The counts said in more than one place ──────────────────────────────
  counts: {
    products: (n: number) => `${n} product${n === 1 ? "" : "s"}`,
    items: (n: number) => `${n} item${n === 1 ? "" : "s"}`,
    /** Rendered with its brackets, beside a star average. */
    reviews: (n: number) => `(${n} review${n === 1 ? "" : "s"})`,
  },

  // ── /shop ────────────────────────────────────────────────────────────────
  home: {
    seeAll: "See all",
    srTitle: "Rodrigues Marketplace — buy from the island's shops",
    deliveryFrom: (fee: string) => `Delivery from Rs ${fee}`,
    payDirect: "Pay the shop direct, no card",
    paused:
      "Online ordering is paused — browse now, or contact a shop to buy today.",
    railBuying: "People are buying",
    railNew: "New arrivals",
    railEverything: "Everything on the marketplace",
    railShops: "Island shops",
    openStore: (name: string) => `Open ${name}`,
    sellHere: (pitch: string) => `Run a shop in Rodrigues? Sell here — ${pitch}.`,
    openYourShopShort: "Open your shop →",
    launch: {
      title: "The island's shops are coming online",
      body:
        "Rodrigues honey, lemon and chilli, hand-woven baskets, embroidery — the marketplace is opening shop by shop. The first products will appear right here.",
      sellerTitle: "Run a shop in Rodrigues?",
      sellerBody: (pitch: string) =>
        `List your products, take orders online, and get paid directly by bank transfer before you hand anything over — ${pitch}.`,
      openShop: "Open your shop",
      visiting: "Just visiting?",
      explore: "Explore the island →",
    },
  },

  // ── The product card, met a hundred times ────────────────────────────────
  card: {
    soldOut: "Sold out",
    notSelling: "Not selling",
    left: (n: number) => `${n} left`,
    /** Sits immediately before the price: "from Rs 120". */
    from: "from",
  },

  // ── /shop/search and /shop/c/[slug] ─────────────────────────────────────
  listing: {
    filter: "Filter",
    clear: "Clear",
    previous: "Previous",
    next: "Next",
    page: (page: number, total: number) => `Page ${page} of ${total}`,
    paginationLabel: "Pagination",
    allProducts: "All products",
    /** The h1 when somebody searched: the query, quoted. */
    query: (q: string) => `“${q}”`,
    nothingFor: (q: string) => `Nothing for “${q}”`,
    nothingMatches: "Nothing matches those filters",
    tryRemoving:
      "Try removing a filter, or open a shelf that has stock right now.",
    nothingListed: "Nothing is listed here yet.",
    clearFilters: "Clear filters",
    browseEverything: "Browse everything",
  },

  /** Keyed by ProductSort. The KEYS are wire format (lib/marketplace/types.ts
   *  says so); only these labels are display. */
  sort: {
    recommended: "Recommended",
    newest: "New arrivals",
    price_asc: "Price: low to high",
    price_desc: "Price: high to low",
    rating: "Best rated",
    name: "A–Z",
  },

  // ── The filter panel, desktop sidebar and mobile sheet alike ────────────
  filters: {
    category: "Category",
    allCategories: "All categories",
    howYouGetIt: "How you get it",
    availability: "Availability",
    inStockOnly: "In stock only",
    openNow: "Shop open now",
    price: "Price",
    under: (amount: string) => `Under Rs ${amount}`,
    seller: "Seller",
    sheetTitle: "Filters",
    closeSheet: "Close filters",
  },

  // ── The category rail and strip ─────────────────────────────────────────
  categories: {
    stripLabel: "Shop by category",
    railLabel: "Product categories",
    all: "All",
  },

  // ── /shop/[storeSlug] ───────────────────────────────────────────────────
  store: {
    noReviews: "No reviews yet — buyers can rate after collecting an order.",
    ordersCompleted: (n: number) =>
      `${n} order${n === 1 ? "" : "s"} completed`,
    since: (when: string) => `Since ${when}`,
    emptyTitle: "Nothing listed yet",
    emptyBody: "This shop hasn't put anything on the marketplace so far.",
    browseMarketplace: "Browse the marketplace",
    reviewsTitle: "What buyers say",
    reviewsNote: "Every review here comes from a collected order at this shop.",
    /** Shown when the reviewer chose not to give a name. */
    verifiedBuyer: "Verified buyer",
    /** The label for the UNCATEGORISED bucket above. */
    moreSection: "More",
  },

  // ── /shop/[storeSlug]/[productSlug] ─────────────────────────────────────
  product: {
    breadcrumbLabel: "Breadcrumb",
    notSellingTitle: "This shop isn't selling online yet",
    stillVisit: "You can still visit them:",
    deliveryFrom: (fee: string) =>
      `Delivery from Rs ${fee} — you pick your area at checkout.`,
    payDirect: (shop: string) =>
      `Pay ${shop} direct by bank transfer. No card details.`,
    details: "Details",
    reviewsTitle: "What buyers said",
    reviewsNote:
      "Every review here comes from someone who collected this product.",
    moreIn: (category: string) => `More ${category}`,
    moreMarketplace: "More from the marketplace",
    relatedNote: "From every shop on the island, not only this one.",
  },

  // ── The seller trust block ──────────────────────────────────────────────
  seller: {
    soldBy: "SOLD BY",
    ordersThrough: (n: number) =>
      `${n} order${n === 1 ? "" : "s"} completed through Roulé Rodrigues`,
    onMarketplaceSince: (when: string) => `On the marketplace since ${when}`,
    seeAllProducts: (n: number) =>
      `See all ${n} product${n === 1 ? "" : "s"}`,
  },

  // ── Opening hours ───────────────────────────────────────────────────────
  hours: {
    openNow: "Open now",
    closed: "Closed",
    closedToday: "Closed today",
    deliveryOn: "Delivery available",
    deliveryOff: "Delivery unavailable",
    noDeliveryToday: "No delivery today",
    srOpen: "Shop is open",
    srClosed: "Shop is closed",
    noHours: "This shop hasn't published its hours yet.",
    /** Sunday-zero, the same indices lib/schedule.ts and the DB CHECK use. */
    weekdays: [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
      "Saturday",
    ],
  },

  // ── The buy box ─────────────────────────────────────────────────────────
  buy: {
    addedToast: (qty: number, product: string) => `${qty} × ${product} added`,
    each: "each",
    inBasketFrom: (shop: string) => `In your basket from ${shop}.`,
    unavailable: "This product isn't available right now.",
    chooseOption: "Choose an option",
    /** Only when a variant has no name of its own. */
    option: "Option",
    save: (amount: string) => `Save Rs ${amount}`,
    soldOutTitle: "This one has sold out",
    anotherOption: "Another option above may still be available.",
    restock:
      "The shop restocks it from time to time — check back, or ask them directly.",
    quantity: "Quantity",
    decrease: "Decrease quantity",
    increase: "Increase quantity",
    onlyLeft: (n: number) => `Only ${n} left`,
    added: "Added to your bag",
    addToBag: "Add to bag",
    alreadyInBasket: (n: number, shop: string) =>
      `${n} already in your basket from ${shop}.`,
  },

  // ── The "+" on a card ───────────────────────────────────────────────────
  quickAdd: {
    addedToast: (product: string) => `${product} added`,
    addAria: (product: string) => `Add ${product} to your basket`,
    oneFewer: (product: string) => `One fewer ${product}`,
    oneMore: (product: string) => `One more ${product}`,
  },

  // ── The heart ───────────────────────────────────────────────────────────
  save: {
    removeAria: (product: string) => `Remove ${product} from saved`,
    saveAria: (product: string) => `Save ${product} for later`,
    savedToast: "Saved for later",
    removedToast: "Removed from saved",
    savedHint: "Find it again under Saved in the marketplace.",
  },

  // ── /shop/saved ─────────────────────────────────────────────────────────
  savedPage: {
    title: "Saved",
    countLine: (n: number) =>
      `${n} product${n === 1 ? "" : "s"} you kept for later. Prices and stock are live.`,
    emptyLine: "Products you keep for later live here.",
    failTitle: "We couldn't load your saved items",
    failBody:
      "Nothing has been lost — they are still saved on this device. Try again in a moment.",
    gone: (n: number) =>
      `${n} saved item${n === 1 ? " is" : "s are"} no longer on sale.`,
    emptyTitle: "Nothing saved yet",
    emptyBody:
      "Tap the heart on any product to keep it here while you think about it.",
    deviceOnly:
      "Saved on this device only — clearing your browser data clears this list.",
  },

  gallery: {
    photo: (index: number, total: number) => `Photo ${index} of ${total}`,
  },

  rating: {
    outOfFive: (value: string) => `${value} out of 5`,
  },

  // ── app/shop/error.tsx ──────────────────────────────────────────────────
  error: {
    eyebrow: "MARKETPLACE",
    title: "The shop directory didn't load",
    body: "Something went wrong on our side — it's not you. Try again in a moment.",
    retry: "Try again",
    backHome: "Back home",
  },
};

/**
 * The shape every language must satisfy, taken from the English.
 *
 * DELIBERATELY NOT `as const`, for the same reason lib/delivery/copy.i18n.ts
 * says: with it, `typeof EN` types every field as its own string LITERAL, so
 * the French entry would have to say "Sold out" to type-check — the annotation
 * would enforce that nothing is translated. Widened, it enforces the thing
 * worth enforcing: same keys, same types, everywhere. copy.i18n.test.ts checks
 * the rest, including that no string is empty.
 */
export type ShopCopy = typeof EN;

const FR: ShopCopy = {
  nav: {
    home: "l’accueil",
    marketplace: "les boutiques",
    marketplaceTitle: "Boutiques",
  },

  header: {
    backTo: (place: string) => `Retour vers ${place}`,
    searchPlaceholder: "Rechercher à Rodrigues",
    searchLabel: "Rechercher dans les boutiques",
    savedLabel: (n: number) => `Favoris, ${n} produit${n === 1 ? "" : "s"}`,
    bagLabel: (n: number) => `Panier, ${n} article${n === 1 ? "" : "s"}`,
    bagEmpty: "Panier vide",
    viewBag: "Voir le panier",
    shops: (n: number) => `${n} boutiques`,
  },

  counts: {
    products: (n: number) => `${n} produit${n === 1 ? "" : "s"}`,
    items: (n: number) => `${n} article${n === 1 ? "" : "s"}`,
    // "avis" ne prend pas de s — repris de lib/i18n.ts t.taxi.review/reviews.
    reviews: (n: number) => `(${n} avis)`,
  },

  home: {
    seeAll: "Tout voir",
    srTitle:
      "Marketplace de Rodrigues — achetez dans les boutiques de l’île",
    deliveryFrom: (fee: string) => `Livraison à partir de Rs ${fee}`,
    payDirect: "Payez la boutique directement, sans carte",
    paused:
      "Les commandes en ligne sont suspendues — regardez maintenant, ou contactez une boutique pour acheter aujourd’hui.",
    railBuying: "Ce que les gens achètent",
    railNew: "Nouveautés",
    railEverything: "Tout sur la marketplace",
    railShops: "Les boutiques de l’île",
    openStore: (name: string) => `Ouvrir ${name}`,
    sellHere: (pitch: string) =>
      `Vous avez une boutique à Rodrigues ? Vendez ici — ${pitch}.`,
    openYourShopShort: "Ouvrez votre boutique →",
    launch: {
      title: "Les boutiques de l’île arrivent en ligne",
      body:
        "Miel de Rodrigues, citron et piment, paniers tressés à la main, broderie — la marketplace ouvre boutique par boutique. Les premiers produits apparaîtront ici même.",
      sellerTitle: "Vous avez une boutique à Rodrigues ?",
      sellerBody: (pitch: string) =>
        `Mettez vos produits en ligne, prenez des commandes, et soyez payé directement par virement bancaire avant de remettre quoi que ce soit — ${pitch}.`,
      openShop: "Ouvrez votre boutique",
      visiting: "Vous êtes de passage ?",
      explore: "Découvrir l’île →",
    },
  },

  card: {
    soldOut: "Épuisé",
    notSelling: "Ne vend pas",
    left: (n: number) => `${n} restant${n === 1 ? "" : "s"}`,
    from: "à partir de",
  },

  listing: {
    filter: "Filtrer",
    clear: "Effacer",
    previous: "Précédent",
    next: "Suivant",
    page: (page: number, total: number) => `Page ${page} sur ${total}`,
    paginationLabel: "Pagination",
    allProducts: "Tous les produits",
    query: (q: string) => `« ${q} »`,
    nothingFor: (q: string) => `Rien pour « ${q} »`,
    nothingMatches: "Aucun résultat pour ces filtres",
    tryRemoving:
      "Essayez d’enlever un filtre, ou ouvrez un rayon qui a du stock en ce moment.",
    nothingListed: "Rien n’est encore en ligne ici.",
    clearFilters: "Effacer les filtres",
    browseEverything: "Voir tout",
  },

  sort: {
    recommended: "Recommandé",
    newest: "Nouveautés",
    price_asc: "Prix : croissant",
    price_desc: "Prix : décroissant",
    rating: "Les mieux notés",
    name: "A–Z",
  },

  filters: {
    category: "Catégorie",
    allCategories: "Toutes les catégories",
    howYouGetIt: "Comment vous le recevez",
    availability: "Disponibilité",
    inStockOnly: "En stock seulement",
    openNow: "Boutique ouverte maintenant",
    price: "Prix",
    under: (amount: string) => `Moins de Rs ${amount}`,
    seller: "Vendeur",
    sheetTitle: "Filtres",
    closeSheet: "Fermer les filtres",
  },

  categories: {
    stripLabel: "Acheter par catégorie",
    railLabel: "Catégories de produits",
    all: "Tout",
  },

  store: {
    noReviews:
      "Pas encore d’avis — les acheteurs peuvent noter après avoir récupéré une commande.",
    ordersCompleted: (n: number) =>
      `${n} commande${n === 1 ? "" : "s"} terminée${n === 1 ? "" : "s"}`,
    since: (when: string) => `Depuis ${when}`,
    emptyTitle: "Rien en ligne pour l’instant",
    emptyBody: "Cette boutique n’a encore rien mis sur la marketplace.",
    browseMarketplace: "Voir la marketplace",
    reviewsTitle: "Ce que disent les acheteurs",
    reviewsNote:
      "Chaque avis ici vient d’une commande récupérée dans cette boutique.",
    verifiedBuyer: "Acheteur vérifié",
    moreSection: "Autres",
  },

  product: {
    breadcrumbLabel: "Fil d’Ariane",
    notSellingTitle: "Cette boutique ne vend pas encore en ligne",
    stillVisit: "Vous pouvez quand même vous y rendre :",
    deliveryFrom: (fee: string) =>
      `Livraison à partir de Rs ${fee} — vous choisissez votre région au moment de payer.`,
    payDirect: (shop: string) =>
      `Payez ${shop} directement par virement bancaire. Aucune carte.`,
    details: "Détails",
    reviewsTitle: "Ce que les acheteurs ont dit",
    reviewsNote:
      "Chaque avis ici vient de quelqu’un qui a récupéré ce produit.",
    moreIn: (category: string) => `Plus de ${category}`,
    moreMarketplace: "Plus sur la marketplace",
    relatedNote: "De toutes les boutiques de l’île, pas seulement celle-ci.",
  },

  seller: {
    soldBy: "VENDU PAR",
    ordersThrough: (n: number) =>
      `${n} commande${n === 1 ? "" : "s"} terminée${n === 1 ? "" : "s"} via Roulé Rodrigues`,
    onMarketplaceSince: (when: string) => `Sur la marketplace depuis ${when}`,
    seeAllProducts: (n: number) =>
      n === 1 ? "Voir le produit" : `Voir les ${n} produits`,
  },

  hours: {
    openNow: "Ouvert maintenant",
    closed: "Fermé",
    closedToday: "Fermé aujourd’hui",
    deliveryOn: "Livraison disponible",
    deliveryOff: "Livraison indisponible",
    noDeliveryToday: "Pas de livraison aujourd’hui",
    srOpen: "La boutique est ouverte",
    srClosed: "La boutique est fermée",
    noHours: "Cette boutique n’a pas encore publié ses horaires.",
    weekdays: [
      "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
    ],
  },

  buy: {
    addedToast: (qty: number, product: string) => `${qty} × ${product} ajouté`,
    each: "l’unité",
    inBasketFrom: (shop: string) => `Dans votre panier chez ${shop}.`,
    unavailable: "Ce produit n’est pas disponible pour le moment.",
    chooseOption: "Choisissez une option",
    option: "Option",
    save: (amount: string) => `Économisez Rs ${amount}`,
    soldOutTitle: "Celui-ci est épuisé",
    anotherOption: "Une autre option ci-dessus est peut-être encore disponible.",
    restock:
      "La boutique se réapprovisionne de temps en temps — revenez voir, ou demandez-leur directement.",
    quantity: "Quantité",
    decrease: "Diminuer la quantité",
    increase: "Augmenter la quantité",
    onlyLeft: (n: number) => `Plus que ${n}`,
    added: "Ajouté à votre panier",
    addToBag: "Ajouter au panier",
    alreadyInBasket: (n: number, shop: string) =>
      `${n} déjà dans votre panier chez ${shop}.`,
  },

  quickAdd: {
    addedToast: (product: string) => `${product} ajouté`,
    addAria: (product: string) => `Ajouter ${product} à votre panier`,
    oneFewer: (product: string) => `Un ${product} de moins`,
    oneMore: (product: string) => `Un ${product} de plus`,
  },

  save: {
    removeAria: (product: string) => `Retirer ${product} des favoris`,
    saveAria: (product: string) => `Garder ${product} pour plus tard`,
    savedToast: "Gardé pour plus tard",
    removedToast: "Retiré des favoris",
    savedHint: "Retrouvez-le dans Favoris sur la marketplace.",
  },

  savedPage: {
    title: "Favoris",
    countLine: (n: number) =>
      `${n} produit${n === 1 ? "" : "s"} gardé${n === 1 ? "" : "s"} pour plus tard. Les prix et le stock sont à jour.`,
    emptyLine: "Les produits que vous gardez pour plus tard sont ici.",
    failTitle: "Nous n’avons pas pu charger vos favoris",
    failBody:
      "Rien n’est perdu — ils sont toujours gardés sur cet appareil. Réessayez dans un instant.",
    gone: (n: number) =>
      `${n} produit${n === 1 ? "" : "s"} gardé${n === 1 ? "" : "s"} n’${n === 1 ? "est" : "sont"} plus en vente.`,
    emptyTitle: "Rien en favoris",
    emptyBody:
      "Touchez le cœur sur un produit pour le garder ici pendant que vous réfléchissez.",
    deviceOnly:
      "Gardé sur cet appareil uniquement — effacer les données du navigateur efface cette liste.",
  },

  gallery: {
    photo: (index: number, total: number) => `Photo ${index} sur ${total}`,
  },

  rating: {
    outOfFive: (value: string) => `${value} sur 5`,
  },

  error: {
    eyebrow: "MARKETPLACE",
    title: "L’annuaire des boutiques n’a pas pu se charger",
    body: "Une erreur s’est produite de notre côté — ce n’est pas vous. Réessayez dans un instant.",
    retry: "Réessayer",
    backHome: "Retour à l’accueil",
  },
};

const CR: ShopCopy = {
  nav: {
    home: "Lakaz",
    marketplace: "bann laboutik",
    marketplaceTitle: "Laboutik",
  },

  header: {
    backTo: (place: string) => `Retour ver ${place}`,
    searchPlaceholder: "Rod dan Rodrig",
    searchLabel: "Rod dan bann laboutik",
    savedLabel: (n: number) => `Sove, ${n} prodwi`,
    bagLabel: (n: number) => `Sak, ${n} zafer`,
    bagEmpty: "Sak vid",
    viewBag: "Get sak la",
    shops: (n: number) => `${n} laboutik`,
  },

  counts: {
    products: (n: number) => `${n} prodwi`,
    items: (n: number) => `${n} zafer`,
    // "lavi" — depi lib/i18n.ts t.taxi.review/reviews. Kreol pa met "s".
    reviews: (n: number) => `(${n} lavi)`,
  },

  home: {
    seeAll: "Get tou",
    srTitle: "Marketplace Rodrig — aste dan bann laboutik lil la",
    deliveryFrom: (fee: string) => `Livrezon apartir Rs ${fee}`,
    payDirect: "Peye laboutik la direk, san kart",
    paused:
      "Komann an liny finn arete pou lemoman — get bann prodwi, ouswa kontakt enn laboutik pou aste zordi.",
    railBuying: "Seki dimounn pe aste",
    railNew: "Nouvo prodwi",
    railEverything: "Tou seki ena lor marketplace la",
    railShops: "Bann laboutik lil la",
    openStore: (name: string) => `Ouver ${name}`,
    sellHere: (pitch: string) =>
      `Ou ena enn laboutik dan Rodrig ? Vann isi — ${pitch}.`,
    openYourShopShort: "Ouver ou laboutik →",
    launch: {
      title: "Bann laboutik lil la pe vinn an liny",
      body:
        "Dimiel Rodrig, sitron ek piman, panye trese ar lame, brodri — marketplace la pe ouver laboutik par laboutik. Bann premie prodwi pou paret isi mem.",
      sellerTitle: "Ou ena enn laboutik dan Rodrig ?",
      sellerBody: (pitch: string) =>
        `Met ou bann prodwi an liny, pran komann, ek gagn ou kas direk par vireman banker avan ou donn nanye — ${pitch}.`,
      openShop: "Ouver ou laboutik",
      visiting: "Ou zis pe pase ?",
      explore: "Dekouver lil la →",
    },
  },

  card: {
    soldOut: "Nepli ena",
    notSelling: "Pa pe vann",
    left: (n: number) => `Res ${n}`,
    from: "apartir",
  },

  listing: {
    filter: "Filt",
    clear: "Efase",
    previous: "Presedan",
    next: "Swivan",
    page: (page: number, total: number) => `Paz ${page} lor ${total}`,
    paginationLabel: "Pazinasion",
    allProducts: "Tou bann prodwi",
    query: (q: string) => `« ${q} »`,
    nothingFor: (q: string) => `Nanye pou « ${q} »`,
    nothingMatches: "Nanye pa korespond ar sa bann filt la",
    tryRemoving:
      "Esey tir enn filt, ouswa ouver enn reyon ki ena stok la mem.",
    nothingListed: "Pankor ena nanye isi.",
    clearFilters: "Efas bann filt",
    browseEverything: "Get tou",
  },

  sort: {
    recommended: "Rekomande",
    newest: "Nouvo prodwi",
    price_asc: "Pri : pli ba ver pli o",
    price_desc: "Pri : pli o ver pli ba",
    rating: "Pli byen note",
    name: "A–Z",
  },

  filters: {
    category: "Kategori",
    allCategories: "Tou bann kategori",
    howYouGetIt: "Kouma ou gagn li",
    availability: "Disponibilite",
    inStockOnly: "Zis seki ena an stok",
    openNow: "Laboutik ouver aster",
    price: "Pri",
    under: (amount: string) => `Mwins ki Rs ${amount}`,
    seller: "Vander",
    sheetTitle: "Bann filt",
    closeSheet: "Ferm bann filt",
  },

  categories: {
    stripLabel: "Aste par kategori",
    railLabel: "Kategori prodwi",
    all: "Tou",
  },

  store: {
    noReviews:
      "Pankor ena lavi — bann aseter kapav note apre ki zot finn pran zot komann.",
    ordersCompleted: (n: number) => `${n} komann fini`,
    since: (when: string) => `Depi ${when}`,
    emptyTitle: "Pankor ena nanye an liny",
    emptyBody: "Sa laboutik la pankor met nanye lor marketplace la.",
    browseMarketplace: "Get marketplace la",
    reviewsTitle: "Seki bann aseter dir",
    reviewsNote:
      "Sak lavi isi sorti depi enn komann ki finn pran dan sa laboutik la.",
    verifiedBuyer: "Aseter verifie",
    moreSection: "Lezot",
  },

  product: {
    breadcrumbLabel: "Fil navigasion",
    notSellingTitle: "Sa laboutik la pankor pe vann an liny",
    stillVisit: "Ou kapav ankor al kot zot :",
    deliveryFrom: (fee: string) =>
      `Livrezon apartir Rs ${fee} — ou swazir ou landrwa kan ou peye.`,
    payDirect: (shop: string) =>
      `Peye ${shop} direk par vireman banker. Pena kart.`,
    details: "Detay",
    reviewsTitle: "Seki bann aseter finn dir",
    reviewsNote:
      "Sak lavi isi sorti depi enn dimounn ki finn pran sa prodwi la.",
    moreIn: (category: string) => `Plis ${category}`,
    moreMarketplace: "Plis lor marketplace la",
    relatedNote: "Depi tou bann laboutik lil la, pa zis sa enn la.",
  },

  seller: {
    soldBy: "VANN PAR",
    ordersThrough: (n: number) =>
      `${n} komann fini atraver Roulé Rodrigues`,
    onMarketplaceSince: (when: string) => `Lor marketplace la depi ${when}`,
    seeAllProducts: (n: number) => `Get tou ${n} prodwi`,
  },

  hours: {
    openNow: "Ouver aster",
    closed: "Ferme",
    closedToday: "Ferme zordi",
    deliveryOn: "Livrezon disponib",
    deliveryOff: "Livrezon pa disponib",
    noDeliveryToday: "Pena livrezon zordi",
    srOpen: "Laboutik la ouver",
    srClosed: "Laboutik la ferme",
    noHours: "Sa laboutik la pankor pibliye so bann ler.",
    weekdays: [
      "Dimans", "Lindi", "Mardi", "Merkredi", "Zedi", "Vandredi", "Samdi",
    ],
  },

  buy: {
    addedToast: (qty: number, product: string) => `${qty} × ${product} azoute`,
    each: "sakenn",
    inBasketFrom: (shop: string) => `Dan ou sak depi ${shop}.`,
    unavailable: "Sa prodwi la pa disponib pou lemoman.",
    chooseOption: "Swazir enn opsion",
    option: "Opsion",
    save: (amount: string) => `Ekonomiz Rs ${amount}`,
    soldOutTitle: "Sa enn la nepli ena",
    anotherOption: "Enn lot opsion anwo kapav ankor disponib.",
    restock:
      "Laboutik la remet li de tanzantan — retourn get, ouswa demann zot direk.",
    quantity: "Kantite",
    decrease: "Diminie kantite",
    increase: "Ogmant kantite",
    onlyLeft: (n: number) => `Res zis ${n}`,
    added: "Azoute dan ou sak",
    addToBag: "Azout dan sak",
    alreadyInBasket: (n: number, shop: string) =>
      `${n} deza dan ou sak depi ${shop}.`,
  },

  quickAdd: {
    addedToast: (product: string) => `${product} azoute`,
    addAria: (product: string) => `Azout ${product} dan ou sak`,
    oneFewer: (product: string) => `Enn ${product} an mwins`,
    oneMore: (product: string) => `Enn ${product} an plis`,
  },

  save: {
    removeAria: (product: string) => `Tir ${product} depi bann sove`,
    saveAria: (product: string) => `Gard ${product} pou pli tar`,
    savedToast: "Garde pou pli tar",
    removedToast: "Tire depi bann sove",
    savedHint: "Ou pou retrouv li dan Sove lor marketplace la.",
  },

  savedPage: {
    title: "Sove",
    countLine: (n: number) =>
      `${n} prodwi ki ou finn gard pou pli tar. Pri ek stok azour.`,
    emptyLine: "Bann prodwi ki ou gard pou pli tar reste isi.",
    failTitle: "Nou pa finn kapav sarz ou bann prodwi sove",
    failBody:
      "Nanye pa finn perdi — zot ankor sove lor sa aparey la. Esey ankor dan enn moman.",
    gone: (n: number) => `${n} prodwi sove nepli an vant.`,
    emptyTitle: "Nanye pankor sove",
    emptyBody:
      "Tous lor leker lor enn prodwi pou gard li isi pandan ki ou pe reflesi.",
    deviceOnly:
      "Sove zis lor sa aparey la — si ou efas done ou navigater, sa lis la efase.",
  },

  gallery: {
    photo: (index: number, total: number) => `Foto ${index} lor ${total}`,
  },

  rating: {
    outOfFive: (value: string) => `${value} lor 5`,
  },

  error: {
    eyebrow: "MARKETPLACE",
    title: "Lalis bann laboutik pa finn sarze",
    body: "Enn zafer finn mal pase kot nou — pa ou. Esey ankor dan enn moman.",
    retry: "Esey ankor",
    backHome: "Retourn Lakaz",
  },
};

export const SHOP_COPY: Record<Language, ShopCopy> = {
  en: EN,
  fr: FR,
  cr: CR,
};
