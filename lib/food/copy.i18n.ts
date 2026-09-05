// ── Every word the food catalogue says for itself, in three languages ───────
//
// ── WHY THIS IS NOT IN lib/i18n.ts ─────────────────────────────────────────
// Same reason as lib/delivery/copy.i18n.ts, lib/rides/copy.i18n.ts and
// lib/shop/copy.i18n.ts: the site dictionary is imported by the navbar, so it
// ships on every page of roulerodrig.com. These keys belong to /food and would
// ride along on the home page, the blog and the map for nothing. It reuses the
// same `Language` union, the same LanguageProvider and the same localStorage
// key, so somebody who chose Kreol at the door is still in Kreol here.
//
// lib/i18n.ts DOES have a `food` section and it is NOT this one: that is the
// WhatsApp Food Concierge vocabulary (cravings, budget, party size), which
// belongs to app/food/concierge and is already translated. The catalogue — the
// dish grid, the filters, the dish page and the add-to-cart panel — had no
// dictionary at all and rendered English in all three languages.
//
// lib/food/vocabulary.ts is not this either. That is DOMAIN vocabulary: search
// synonyms and category words matched against a Postgres tsvector. Same for
// lib/food/search.ts and lib/food/dish-art.ts. None of them is display copy and
// none of them is touched here.
//
// ── WHAT IS IN HERE AND WHAT IS NOT ────────────────────────────────────────
// UI CHROME ONLY. Dish names, descriptors, descriptions, allergen text, variant
// names, category names, kitchen names, pickup hints and addresses all come out
// of Supabase and stay exactly as the owner wrote them. The dish table already
// carries `descriptor_fr` / `descriptor_cr` and the category table `name_fr` /
// `name_cr` — translating owner data belongs in those columns, not in code.
//
// Four things are deliberately absent, each of which would be an outage rather
// than a translation:
//   • `export const metadata`, `generateMetadata` and every JSON-LD block. The
//     chosen language lives ONLY in localStorage (context/LanguageContext.tsx),
//     so the server cannot know it when the document head is built, and the
//     structured data has to keep matching the canonical English page.
//   • DIETARY_TAGS, FOOD_SORTS, the `?sort=` / `?diet=` / `?category=` URL
//     values, the category slugs and every reason string compared with `===`.
//     Those are wire format. `dietary` and `unavailable` below are keyed BY
//     those values and only their labels are display.
//   • The wa.me draft on the dish page. It is a message the customer sends to a
//     third party, not something this site says — see the note on `dish`.
//   • lib/food/types.ts. DIETARY_LABEL and UNAVAILABLE_LABEL stay English there
//     because app/admin/food/MenuPanel.tsx reads DIETARY_LABEL and the admin
//     desk is the owner's, in one language. Same split lib/rides/copy.i18n.ts
//     made against lib/rides/model.ts: the constants keep their English, this
//     file carries the display copy beside them keyed by the same unions.
//
// ── ON THE KREOL ───────────────────────────────────────────────────────────
// Follows the house style settled in lib/rides/copy.i18n.ts and continued in
// lib/shop/copy.i18n.ts: <s> not <ch>, and the reader is "ou", never "to".
// Kreol does not inflect plurals, so every count function below is written
// per-language rather than sharing one "s" suffix — `${n} plat`, not
// `${n} plats`. "lakwizinn" for the kitchen is lifted from
// lib/checkout/copy.i18n.ts, which met the same noun first.
//
// IT HAS NOT BEEN READ BY A NATIVE SPEAKER. Correct in structure, matching the
// established orthography, waiting for an ear on the island. And the thing
// worth repeating from the delivery file: FRENCH is the accessibility win here.
// People on Rodrigues READ French — forms, bank letters, government notices —
// while Kreol only recently settled an orthography. Both ship; the French is
// the one that has to be genuinely good.

import type { Language } from "@/lib/i18n";

const EN = {
  // ── /food chrome ─────────────────────────────────────────────────────────
  chrome: {
    /** ShopHeader's back label. The header itself speaks from SHOP_COPY. */
    backHome: "Home",
    /** The h1 is two pieces because the second half is the yellow one. */
    titleLead: "What are you ",
    titleAccent: "hungry for?",
    dishCount: (n: number) =>
      `${n} dish${n === 1 ? "" : "es"} from island kitchens`,
    cookingNow: (n: number) => `${n} cooking now`,
    /**
     * Every example word here is one lib/food/search.ts actually knows —
     * "ourite", "chicken" and "cheap" are all in its tables. A placeholder that
     * suggests a word the search cannot answer is worse than no placeholder,
     * so the French and Kreol versions were picked from the same tables rather
     * than translated freely.
     */
    searchPlaceholder: "Octopus, chicken, something cheap…",
    search: "Search",
    categoriesLabel: "Food categories",
    everything: "Everything",
    readyNow: "Ready now",
    quickest: "Quickest",
    cheapest: "Cheapest",
  },

  /**
   * The clock-chosen rails, keyed by food_home()'s own `key`.
   *
   * The titles are built by the SQL (M51, food_home()) and arrive already
   * written, in English, for every reader. They are not owner data — no menu
   * screen can edit them — so the English below is a verbatim copy of the
   * literals in the migration and the lookup falls back to whatever the RPC
   * sent if a key ever appears that is not listed here.
   */
  rails: {
    now: "Ready to order now",
    breakfast: "Breakfast on the island",
    lunch: "Good for lunch",
    dinner: "Tonight's picks",
    snack: "Late-night bites",
    signature: "Signature dishes",
    new: "New on the menu",
  },

  // ── The search / filter results ─────────────────────────────────────────
  results: {
    count: (n: number) => `${n} dish${n === 1 ? "" : "es"}`,
    forQuery: (q: string) => `for “${q}”`,
    emptyTitle: "Nothing delicious matched that",
    emptyTyped:
      "Try a shorter word — “fish”, “curry”, “ourite” — or browse a category above.",
    emptyFiltered:
      "Nothing is filed under those filters yet. Clear them to see the whole menu.",
    showEverything: "Show everything",
  },

  // ── The launch state, which IS the empty state ──────────────────────────
  launch: {
    title: "We're between kitchens",
    body: "Island cooks are joining one by one — ourite rougaille, grilled fish, Creole curries. Ordering opens here the moment the first menu goes live.",
    cta: "Ask us to find you a table",
  },

  /** The footer link to the WhatsApp concierge, and its own back bar. */
  concierge: {
    lead: "Want a ",
    strong: "table at a restaurant",
    tail: " instead? A local books it for you.",
    link: "Food concierge →",
    /** BrowseBackBar's breadcrumb on /food/concierge. */
    backBarTitle: "Food Concierge",
  },

  // ── The dish card, met a hundred times ──────────────────────────────────
  card: {
    signature: "SIGNATURE",
    /** Only when a reason arrives that `unavailable` below does not name. */
    unavailable: "Unavailable",
    spiceAria: (n: number) => `Spice level ${n} of 3`,
    halalCertified: "Halal certified",
    halal: "Halal",
    /** Sits immediately before the price: "from Rs 120". */
    from: "from",
  },

  // ── /food/[slug] ────────────────────────────────────────────────────────
  //
  // The wa.me draft is NOT here on purpose. It is the message the CUSTOMER
  // sends to the kitchen, and lib/rides/copy.i18n.ts already recorded what goes
  // wrong when a message crossing between two people follows one of their UI
  // languages. It is also a URL payload, which this pass does not change.
  // Everything Roulé Rodrigues says around it — the button, the note under it —
  // is translated.
  dish: {
    backAria: "Back to food",
    serves: (n: number) => `Serves ${n}`,
    /** French wants the space before the colon, so it lives in the string. */
    allergens: "Allergens:",
    preparedBy: "Prepared by",
    closedNow: "closed right now",
    halalBy: (issuer: string) => `by ${issuer}`,
    messageKitchen: "Message the kitchen",
    noBankAccount:
      "No local bank account? Ask them to arrange it with you directly.",
    relatedTitle: "Goes well with this",
    relatedNote: "From the same kitchen, so it all arrives in one order.",
  },

  // ── The order panel on a dish page ──────────────────────────────────────
  panel: {
    notAvailable: "Not available",
    /**
     * Keyed by FoodUnavailableReason, plus `other` for the ones the panel does
     * not spell out. The KEYS are the database's own values — the panel still
     * compares `dish.reason` against them, never against these sentences.
     */
    reason: {
      sold_out: "Today's batch has gone. It is usually back tomorrow.",
      wrong_time:
        "This dish is only cooked at certain hours. Check back later today.",
      wrong_day: "It is not on the stove today.",
      kitchen_closed: "The kitchen is closed right now.",
      other: "It is off the menu for the moment.",
    },
    seeReady: "See what's ready now",
    chooseSize: "CHOOSE A SIZE",
    /** Only when a variant has no name of its own. */
    standard: "Standard",
    soldOut: "sold out",
    oneFewer: "One fewer",
    oneMore: "One more",
    portionsLeft: (n: number) =>
      `Only ${n} portion${n === 1 ? "" : "s"} left today.`,
    addToOrder: "Add to order",
    readyIn: (min: number, max: number) =>
      `Usually ready in ${min}–${max} minutes once the kitchen starts`,
  },

  // ── The "+" on a card ───────────────────────────────────────────────────
  quickAdd: {
    chooseSizeAria: (name: string) => `Choose a size for ${name}`,
    addAria: (name: string) => `Add ${name}`,
    oneFewerAria: (name: string) => `Remove one ${name}`,
    oneMoreAria: (name: string) => `Add another ${name}`,
  },

  // ── Toasts, shared by the card control and the dish panel ───────────────
  toast: {
    onlyLeft: (n: number) => `Only ${n} left today.`,
    conflictTitle: (name: string) => `${name} is cooked at another kitchen.`,
    conflictBody: (kitchen: string) =>
      `Your order so far is from ${kitchen}. One order comes from one kitchen so it can be cooked and collected together.`,
    /** When the cart knows a store id but not its name. */
    otherKitchen: "a different kitchen",
    startNew: "Start a new order",
    added: (name: string) => `${name} added.`,
    addedQty: (qty: number, name: string) => `${qty}× ${name} added.`,
  },

  // ── The sticky order bar ────────────────────────────────────────────────
  cartBar: {
    viewOrder: "View your order",
    fromKitchen: (kitchen: string) => `from ${kitchen}`,
  },

  // ── Pickup or delivery ──────────────────────────────────────────────────
  //
  // The two chip labels are a VERBATIM copy of FULFILMENT.pickup.chip and
  // FULFILMENT.rr_delivery.chip in lib/shop/plain-words.ts, which is still the
  // one place that wording is decided and is shared with /shop and /checkout.
  // It could not be translated in place: app/shop/[storeSlug]/[productSlug]
  // picks an icon by COMPARING a chip string to FULFILMENT.*.chip, so a
  // language-dependent chip would silently drop that icon. Keep the English
  // here in step with that file by hand until it has a dictionary of its own —
  // and note that /checkout still says these words in English today.
  fulfilment: {
    collectionOnly: "Collection only right now",
    deliveryPaused: "— delivery is paused.",
    pickup: "Collect in person",
    delivery: "Delivered to you",
    deliveryNote: "We bring it to you",
    deliveryFee: (fee: string) => `— from Rs ${fee} depending on the area.`,
    deliveryShare: "You share your location at checkout.",
    pickupNote:
      "Collect it from the kitchen. No fee, and you get a code to show when you arrive.",
  },

  /**
   * The dietary vocabulary's LABELS, keyed by the tag values in
   * lib/food/types.ts. The tags themselves are wire format — they are what the
   * `?diet=` parameter carries and what browse_food() matches — so only these
   * labels are display. An unknown tag already in the data falls back to itself,
   * exactly as DIETARY_LABEL does.
   */
  dietary: {
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    seafood: "Seafood",
    contains_pork: "Contains pork",
    contains_nuts: "Contains nuts",
    gluten_free: "Gluten free",
    halal: "Halal",
    spicy: "Spicy",
  },

  /** Why a dish cannot be ordered, keyed by FoodUnavailableReason. Short — it
   *  sits across the bottom of a card image. */
  // ── M161 · WHEN DO YOU WANT IT ────────────────────────────────────────
  // The times themselves come from food_pickup_slots(); these are only the
  // words around them.
  when: {
    title: "When do you want it?",
    asap: "As soon as it’s ready",
    asapReady: (from: string, to: string) => `Ready about ${from} – ${to}`,
    later: "Later",
    today: "Today",
    tomorrow: "Tomorrow",
    closedNow: (kitchen: string) => `${kitchen} is closed now.`,
    orderingFor: (day: string, from: string, to: string) =>
      `You are ordering for ${day.toLowerCase()}, ${from} – ${to}.`,
    noSlots: "No collection times left today.",
    noHours: "This kitchen has not set its opening hours yet.",
    closedDay: "Closed that day.",
    placeFor: (time: string) => `Place order for ${time}`,
  },

  unavailable: {
    sold_out: "Sold out today",
    wrong_day: "Not cooked today",
    wrong_time: "Not served now",
    off_menu: "Off the menu",
    kitchen_closed: "Kitchen closed",
    missing: "Unavailable",
  },
};

/**
 * The shape every language must satisfy, taken from the English.
 *
 * DELIBERATELY NOT `as const`, for the reason lib/delivery/copy.i18n.ts states:
 * with it, `typeof EN` types every field as its own string LITERAL, so the
 * French entry would have to say "Sold out today" to type-check — the
 * annotation would enforce that nothing is translated. Widened, it enforces the
 * thing worth enforcing: same keys, same types, in all three. copy.i18n.test.ts
 * checks the rest, including that no string is empty.
 */
export type FoodCopy = typeof EN;

const FR: FoodCopy = {
  chrome: {
    backHome: "Accueil",
    titleLead: "Vous avez envie de ",
    titleAccent: "quoi ?",
    dishCount: (n: number) =>
      `${n} plat${n === 1 ? "" : "s"} des cuisines de l’île`,
    cookingNow: (n: number) => `${n} en train de cuisiner`,
    // "ourite", "poulet" et "pas cher" sont tous les trois dans les tables de
    // lib/food/search.ts — la recherche répond vraiment à ces trois mots.
    searchPlaceholder: "Ourite, poulet, pas cher…",
    search: "Rechercher",
    categoriesLabel: "Catégories de plats",
    everything: "Tout",
    readyNow: "Prêt maintenant",
    quickest: "Le plus rapide",
    cheapest: "Le moins cher",
  },

  rails: {
    now: "Prêt à commander maintenant",
    breakfast: "Petit-déjeuner sur l’île",
    lunch: "Bon pour le déjeuner",
    dinner: "Notre sélection du soir",
    snack: "À grignoter tard",
    signature: "Les plats signature",
    new: "Nouveau au menu",
  },

  results: {
    count: (n: number) => `${n} plat${n === 1 ? "" : "s"}`,
    forQuery: (q: string) => `pour « ${q} »`,
    emptyTitle: "Rien de bon ne correspond",
    emptyTyped:
      "Essayez un mot plus court — « poisson », « cari », « ourite » — ou parcourez une catégorie ci-dessus.",
    emptyFiltered:
      "Rien n’est classé sous ces filtres pour l’instant. Effacez-les pour voir tout le menu.",
    showEverything: "Voir tout",
  },

  launch: {
    title: "Entre deux cuisines",
    body: "Les cuisiniers de l’île arrivent un par un — ourite rougaille, poisson grillé, caris créoles. La commande s’ouvre ici dès que le premier menu est en ligne.",
    cta: "Demandez-nous de vous trouver une table",
  },

  concierge: {
    lead: "Vous voulez plutôt ",
    strong: "une table au restaurant",
    tail: " ? Un habitant vous la réserve.",
    link: "Concierge culinaire →",
    backBarTitle: "Concierge culinaire",
  },

  card: {
    signature: "SIGNATURE",
    unavailable: "Indisponible",
    spiceAria: (n: number) => `Niveau de piment ${n} sur 3`,
    halalCertified: "Certifié halal",
    halal: "Halal",
    from: "à partir de",
  },

  dish: {
    backAria: "Retour vers les plats",
    serves: (n: number) => `Pour ${n} personnes`,
    allergens: "Allergènes :",
    preparedBy: "Préparé par",
    closedNow: "fermé en ce moment",
    halalBy: (issuer: string) => `par ${issuer}`,
    messageKitchen: "Écrire au restaurant",
    noBankAccount:
      "Pas de compte bancaire local ? Demandez-leur de s’arranger directement avec vous.",
    relatedTitle: "Ça va bien avec ce plat",
    relatedNote:
      "Du même restaurant, pour que tout arrive en une seule commande.",
  },

  panel: {
    notAvailable: "Indisponible",
    reason: {
      sold_out: "La fournée du jour est partie. Elle revient d’habitude demain.",
      wrong_time:
        "Ce plat n’est cuisiné qu’à certaines heures. Revenez voir plus tard dans la journée.",
      wrong_day: "Il n’est pas au feu aujourd’hui.",
      kitchen_closed: "Le restaurant est fermé en ce moment.",
      other: "Il est hors menu pour le moment.",
    },
    seeReady: "Voir ce qui est prêt maintenant",
    chooseSize: "CHOISISSEZ UNE TAILLE",
    standard: "Standard",
    soldOut: "épuisé",
    oneFewer: "Un de moins",
    oneMore: "Un de plus",
    portionsLeft: (n: number) =>
      `Plus que ${n} portion${n === 1 ? "" : "s"} aujourd’hui.`,
    addToOrder: "Ajouter à la commande",
    readyIn: (min: number, max: number) =>
      `Prêt en général en ${min}–${max} minutes une fois que le restaurant commence`,
  },

  quickAdd: {
    chooseSizeAria: (name: string) => `Choisir une taille pour ${name}`,
    addAria: (name: string) => `Ajouter ${name}`,
    oneFewerAria: (name: string) => `Un ${name} de moins`,
    oneMoreAria: (name: string) => `Un ${name} de plus`,
  },

  toast: {
    onlyLeft: (n: number) => `Plus que ${n} aujourd’hui.`,
    conflictTitle: (name: string) =>
      `${name} est cuisiné dans un autre restaurant.`,
    conflictBody: (kitchen: string) =>
      `Votre commande vient pour l’instant de ${kitchen}. Une commande vient d’un seul restaurant, pour être cuisinée et récupérée ensemble.`,
    otherKitchen: "un autre restaurant",
    startNew: "Commencer une nouvelle commande",
    added: (name: string) => `${name} ajouté.`,
    addedQty: (qty: number, name: string) => `${qty}× ${name} ajouté.`,
  },

  cartBar: {
    viewOrder: "Voir votre commande",
    fromKitchen: (kitchen: string) => `chez ${kitchen}`,
  },

  fulfilment: {
    collectionOnly: "Retrait uniquement pour l’instant",
    deliveryPaused: "— la livraison est suspendue.",
    pickup: "Retirer sur place",
    delivery: "Livré chez vous",
    deliveryNote: "On vous l’apporte",
    deliveryFee: (fee: string) => `— à partir de Rs ${fee} selon la région.`,
    deliveryShare: "Vous indiquez votre position au moment de payer.",
    pickupNote:
      "Retirez-le au restaurant. Sans frais, et vous recevez un code à montrer en arrivant.",
  },

  dietary: {
    vegetarian: "Végétarien",
    vegan: "Végétalien",
    seafood: "Fruits de mer",
    contains_pork: "Contient du porc",
    contains_nuts: "Contient des fruits à coque",
    gluten_free: "Sans gluten",
    halal: "Halal",
    spicy: "Épicé",
  },

  when: {
    title: "Vous le voulez quand ?",
    asap: "Dès que c’est prêt",
    asapReady: (from, to) => `Prêt vers ${from} – ${to}`,
    later: "Plus tard",
    today: "Aujourd’hui",
    tomorrow: "Demain",
    closedNow: (kitchen) => `${kitchen} est fermé maintenant.`,
    orderingFor: (day, from, to) =>
      `Vous commandez pour ${day.toLowerCase()}, ${from} – ${to}.`,
    noSlots: "Plus de créneaux aujourd’hui.",
    noHours: "Cette cuisine n’a pas encore indiqué ses horaires.",
    closedDay: "Fermé ce jour-là.",
    placeFor: (time) => `Commander pour ${time}`,
  },

  unavailable: {
    sold_out: "Épuisé aujourd’hui",
    wrong_day: "Pas cuisiné aujourd’hui",
    wrong_time: "Pas servi maintenant",
    off_menu: "Hors menu",
    kitchen_closed: "Restaurant fermé",
    missing: "Indisponible",
  },
};

const CR: FoodCopy = {
  chrome: {
    backHome: "Lakaz",
    titleLead: "Ki ou anvi ",
    titleAccent: "manze ?",
    dishCount: (n: number) => `${n} plat depi bann lakwizinn lil la`,
    cookingNow: (n: number) => `${n} pe kwi aster`,
    // "ourit", "pouler" ek "bomarse" tou dan bann tab lib/food/search.ts —
    // rod la reponn sa trwa mo la vremem.
    searchPlaceholder: "Ourit, pouler, bomarse…",
    search: "Rode",
    categoriesLabel: "Kategori plat",
    everything: "Tou",
    readyNow: "Pare aster",
    quickest: "Pli vit",
    cheapest: "Pri pli ba",
  },

  rails: {
    now: "Pare pou komande aster",
    breakfast: "Ti-dezene lor lil la",
    lunch: "Bon pou dezene",
    dinner: "Nou swa pou aswar",
    snack: "Ti manze tar dan lanwit",
    signature: "Bann plat signatir",
    new: "Nouvo lor meni",
  },

  results: {
    count: (n: number) => `${n} plat`,
    forQuery: (q: string) => `pou « ${q} »`,
    emptyTitle: "Nanye bon pa korespond ar sa",
    emptyTyped:
      "Esey enn mo pli kourt — « pwason », « kari », « ourit » — ouswa get enn kategori anwo.",
    emptyFiltered:
      "Nanye pankor dan sa bann filt la. Efas zot pou get tou meni la.",
    showEverything: "Get tou",
  },

  launch: {
    title: "Nou ant de lakwizinn",
    body: "Bann kwizinie lil la pe vinn enn par enn — ourit rougay, pwason grile, kari kreol. Komann pou ouver isi mem deswit ki premie meni sorti.",
    cta: "Demann nou trouv ou enn latab",
  },

  concierge: {
    lead: "Ou anvi ",
    strong: "enn latab dan enn restoran",
    tail: " pito ? Enn dimounn lokal rezerv li pou ou.",
    link: "Konsierz manze →",
    backBarTitle: "Konsierz manze",
  },

  card: {
    signature: "SIGNATIR",
    unavailable: "Pa disponib",
    spiceAria: (n: number) => `Nivo piman ${n} lor 3`,
    halalCertified: "Sertifie halal",
    halal: "Halal",
    from: "apartir",
  },

  dish: {
    backAria: "Retour ver bann plat",
    serves: (n: number) => `Pou ${n} dimounn`,
    allergens: "Alerzen :",
    preparedBy: "Prepare par",
    closedNow: "ferme aster",
    halalBy: (issuer: string) => `par ${issuer}`,
    messageKitchen: "Ekrir lakwizinn la",
    noBankAccount:
      "Pena kont banker lokal ? Demann zot arranz sa direk ar ou.",
    relatedTitle: "Sa al byen ar sa plat la",
    relatedNote: "Depi mem lakwizinn, koumsa tou ariv dan enn sel komann.",
  },

  panel: {
    notAvailable: "Pa disponib",
    reason: {
      sold_out: "Seki ti kwi zordi finn fini. Normalman li retourn demen.",
      wrong_time:
        "Sa plat la kwi zis a serten ler. Retourn get pli tar zordi.",
      wrong_day: "Li pa lor dife zordi.",
      kitchen_closed: "Lakwizinn la ferme aster.",
      other: "Li nepli lor meni pou lemoman.",
    },
    seeReady: "Get seki pare aster",
    chooseSize: "SWAZIR ENN GRANDER",
    standard: "Standar",
    soldOut: "nepli ena",
    oneFewer: "Enn an mwins",
    oneMore: "Enn an plis",
    portionsLeft: (n: number) => `Res zis ${n} porsion zordi.`,
    addToOrder: "Azout dan komann",
    readyIn: (min: number, max: number) =>
      `Normalman pare dan ${min}–${max} minit apre ki lakwizinn koumanse`,
  },

  quickAdd: {
    chooseSizeAria: (name: string) => `Swazir enn grander pou ${name}`,
    addAria: (name: string) => `Azout ${name}`,
    oneFewerAria: (name: string) => `Enn ${name} an mwins`,
    oneMoreAria: (name: string) => `Enn ${name} an plis`,
  },

  toast: {
    onlyLeft: (n: number) => `Res zis ${n} zordi.`,
    conflictTitle: (name: string) => `${name} kwi dan enn lot lakwizinn.`,
    conflictBody: (kitchen: string) =>
      `Ou komann la sorti kot ${kitchen}. Enn komann sorti dan enn sel lakwizinn, pou li kapav kwi ek ranmase ansam.`,
    otherKitchen: "enn lot lakwizinn",
    startNew: "Koumans enn nouvo komann",
    added: (name: string) => `${name} azoute.`,
    addedQty: (qty: number, name: string) => `${qty}× ${name} azoute.`,
  },

  cartBar: {
    viewOrder: "Get ou komann",
    fromKitchen: (kitchen: string) => `depi ${kitchen}`,
  },

  fulfilment: {
    collectionOnly: "Zis ranmase pou lemoman",
    deliveryPaused: "— livrezon finn arete.",
    pickup: "Ranmas limem",
    delivery: "Livre kot ou",
    deliveryNote: "Nou amenn li kot ou",
    deliveryFee: (fee: string) => `— apartir Rs ${fee} dapre landrwa.`,
    deliveryShare: "Ou dir kot ou ete kan ou peye.",
    pickupNote:
      "Al pran li kot lakwizinn la. Pena fre, ek ou gagn enn kod pou montre kan ou arive.",
  },

  dietary: {
    vegetarian: "Vezetarien",
    vegan: "Vegan",
    seafood: "Fri de mer",
    contains_pork: "Ena koson",
    contains_nuts: "Ena nwa",
    gluten_free: "San gluten",
    halal: "Halal",
    spicy: "Piman",
  },

  when: {
    title: "Kan ou anvi li ?",
    asap: "Deswit ki li pare",
    asapReady: (from, to) => `Pare apepre ${from} – ${to}`,
    later: "Pli tar",
    today: "Zordi",
    tomorrow: "Demin",
    closedNow: (kitchen) => `${kitchen} ferme la.`,
    orderingFor: (day, from, to) =>
      `Ou pe komann pou ${day.toLowerCase()}, ${from} – ${to}.`,
    noSlots: "Nepli ena ler pou zordi.",
    noHours: "Sa lakwizinn la pankor met so lertan.",
    closedDay: "Ferme sa zour la.",
    placeFor: (time) => `Komann pou ${time}`,
  },

  unavailable: {
    sold_out: "Nepli ena zordi",
    wrong_day: "Pa pe kwi zordi",
    wrong_time: "Pa pe servi aster",
    off_menu: "Nepli lor meni",
    kitchen_closed: "Lakwizinn ferme",
    missing: "Pa disponib",
  },
};

export const FOOD_COPY: Record<Language, FoodCopy> = {
  en: EN,
  fr: FR,
  cr: CR,
};
