// ── Every word on the bag and the checkout, in three languages ──────────────
//
// ── WHY THIS IS NOT IN lib/i18n.ts ─────────────────────────────────────────
// Same reason as lib/delivery/copy.i18n.ts and lib/rides/copy.i18n.ts: the site
// dictionary is imported by the navbar, so it ships on every page of
// roulerodrig.com. These keys belong to two screens — /cart and /checkout — and
// would ride along on the home page, the blog and the map for nothing. It
// reuses the same `Language` union, the same LanguageProvider and the same
// localStorage key, so somebody who chose Kreol at the door is still in Kreol
// here. One system, split at the bundle rather than at the concept.
//
// ── THIS IS THE FORM THAT TAKES PEOPLE'S MONEY ─────────────────────────────
// Every English string below is byte-identical to what the screen said before
// extraction, including the two places where the product says the same thing in
// two different wordings ("Try again" on the cart error and "Retry" on the
// quote error; "Share your delivery location…" above the button and "Share your
// location…" below it). Freezing them here rather than tidying them keeps this
// change to what it claims to be — words moved, nothing else. The duplicates
// are reported, not fixed.
//
// ── WHY FRENCH MATTERS MORE THAN IT LOOKS ──────────────────────────────────
// The research behind the /deliver rebuild, repeated here because it decides
// which half of this file has to be genuinely good: Kreol is the language of
// the HOME, and it is what people speak. But the language people READ on
// Rodrigues — forms, notices, bank letters — is French. Somebody who left
// school at fourteen has read French documents their whole life and almost
// nothing in Kreol, which only recently settled an orthography. Kreol here is a
// comfort and a signal of respect; FRENCH is the accessibility win.
//
// ── ON THE KREOL ───────────────────────────────────────────────────────────
// Written to match lib/delivery/copy.i18n.ts and lib/rides/copy.i18n.ts — "ou"
// and not "to", "sofer" and not "chofer", <s> and not <ch>. IT HAS NOT BEEN
// READ BY A NATIVE SPEAKER. Correct in structure, waiting for an ear.

import type { Language } from "@/lib/i18n";
import type { CartDomain } from "@/lib/cart/domains";

// ── THE SELLER, NAMED IN FOUR GRAMMATICAL POSITIONS ─────────────────────────
//
// /cart, /checkout and /orders are one implementation shared by the
// marketplace, by food and by ticketing, and lib/food/vocabulary.ts supplies
// the noun each of them uses for whoever is selling — "shop", "kitchen",
// "organiser". A dozen sentences on the checkout interpolate it mid-sentence.
//
// That noun is English, and lib/food/vocabulary.ts is not translated. Dropping
// it into a French sentence produces "Cette shop est fermée" — which is worse
// than an English sentence, because a half-translated screen reads as broken
// rather than as untranslated. So the seller words are carried HERE, keyed by
// the same CartDomain the page already resolved server-side, in the four forms
// the sentences below actually need. Every English form is byte-identical to
// what lib/food/vocabulary.ts produced at the same site.
//
// THE FRENCH NOUNS ARE ALL MASCULINE ON PURPOSE. "la boutique" would force
// "fermée" in some sentences and "fermé" in others, so a shared sentence could
// not agree with all three sellers at once. "le magasin" is already the house
// word — lib/delivery/copy.i18n.ts says "Le chauffeur choisit le magasin."
export type SellerWords = {
  /** Mid-sentence, definite: "the shop". Never used straight after "à". */
  the: string;
  /** Sentence-initial, definite: "The shop". */
  theCap: string;
  /** Sentence-initial, demonstrative: "This shop". */
  thisCap: string;
  /** Possessive, as it attaches to what is owned: "the shop's" / "du magasin". */
  poss: string;
};

const EN = {
  seller: {
    shop: {
      the: "the shop",
      theCap: "The shop",
      thisCap: "This shop",
      poss: "the shop's",
    },
    food: {
      the: "the kitchen",
      theCap: "The kitchen",
      thisCap: "This kitchen",
      poss: "the kitchen's",
    },
    events: {
      the: "the organiser",
      theCap: "The organiser",
      thisCap: "This organiser",
      poss: "the organiser's",
    },
  },

  // ── app/checkout/page.tsx ────────────────────────────────────────────────
  // A server component. The chosen language lives in localStorage, so these two
  // are read by a tiny client child — app/checkout/CheckoutHeading.tsx, the
  // same shape as app/deliver/DeliverTitle.tsx.
  page: {
    back: "Back to your bag",
    heading: "Checkout",
  },

  // ── components/checkout/CheckoutForm.tsx ─────────────────────────────────
  form: {
    loading: "Loading your cart…",
    /** The h2 of the error card. No full stop — the sentence is below it. */
    loadFailedTitle: "We couldn't load your cart",
    tryAgain: "Try again",
    emptyTitle: "Your cart is empty",
    emptyBody: "Add something to your cart before checking out.",

    // Why the button is dark. A disabled control with no explanation is a dead
    // end, so this chain names the first thing the customer can actually act on.
    blocked: {
      email: "Enter a valid email so we can send your order confirmation.",
      name: "Enter your full name to continue.",
      /** Byte-for-byte what SellerVocab.phoneReason said at this site. */
      phone: (s: SellerWords) =>
        `Enter your phone number so ${s.the} can reach you.`,
      location: "Share your delivery location to continue.",
      zone: "Choose your delivery area to continue.",
      payment: (s: SellerWords) =>
        `${s.thisCap} does not accept the selected payment method.`,
      closed: (s: SellerWords) =>
        `${s.theCap} is closed for this option right now.`,
      quote: (s: SellerWords) =>
        `Waiting for ${s.the} to confirm your price…`,
    },

    items: {
      eyebrow: "ITEMS",
      issue: "Some items are no longer available.",
      issueLink: "Review your cart",
    },

    schedule: {
      closedNow: (s: SellerWords) => `${s.thisCap} is closed right now.`,
      /** Only when store_schedule_status() gives no next opening. */
      tryOpeningHours: "Please try again during opening hours.",
      /** Leading separator kept: it follows the next-open line on one row. */
      todayPrefix: " · Today ",
      openNow: "Open now",
      todayLower: " · today ",
    },

    ticket: {
      eyebrow: "HOW IT WORKS",
      body: "Your tickets arrive by email with a QR code. Show it at the gate — nothing is posted or delivered.",
    },

    fulfilment: {
      legend: "DELIVERY METHOD",
      closed: (s: SellerWords) => `${s.theCap} is closed right now.`,
      noRrDelivery: (s: SellerWords) =>
        `${s.thisCap} doesn't use our delivery team.`,
      deliveryOff: "Delivery isn't running right now.",
      /** Title passed to PickupLocationCard; the card's own words are its own. */
      pickupTitle: "You'll collect from",
    },

    zone: {
      eyebrow: "DELIVERY AREA",
      question: "Which part of Rodrigues are we delivering to?",
      choose: "Choose your area…",
      covers: "Covers: ",
      none: "No delivery areas are set up yet. Choose pickup or your own delivery.",
      largeLabel: "This is a large item — it needs a car",
      largeHelp:
        "Tick this for anything that will not fit on a scooter — furniture, a gas bottle, an appliance, several big boxes. We will only send a driver with a car or a van. It does not change the price.",
      /** An upper bound, not a promise — hours come from /api/delivery-zones. */
      within: (hours: number) => `Usually delivered within ${hours} hours.`,
      largeSlower: "Large items can take longer — fewer drivers have a car.",
      agreed: "The exact delivery time is agreed between you and the driver.",
      today: "Delivery today: ",
    },

    location: {
      eyebrow: "YOUR LOCATION",
      shared: (lat: string, lng: string) => `Location shared (${lat}, ${lng})`,
      why: "We deliver to a GPS pin, not a street address — it's far more reliable here.",
      update: "Update location",
      share: "Share my location",
      notesPlaceholder: "Landmark or directions (optional)",
      notesAria: "Delivery directions",
      unsupported: "This device can't share a location. Choose pickup instead.",
      denied: "We couldn't get your location. Allow location access and try again.",
      /** The line under the summary. Says the same as blocked.location in
       *  different words, on the same screen — reported, not merged. */
      needed: "Share your location to continue.",
    },

    guest: {
      eyebrow: "CHECKING OUT AS A GUEST",
      intro: "No account needed. We'll email your confirmation and a link to track this order.",
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      emailBad: "That email address doesn't look right.",
      emailHint: "Your order confirmation goes here — please check it's correct.",
      haveAccount: "Already have an account?",
      signIn: "Sign in",
      toSave: "to save this order to your history.",
    },

    signedIn: {
      srLabel: "Signed in",
      orderingAs: "Ordering as ",
      signingOut: "Signing out…",
      notYou: "Not you?",
      signOutFailed: "Could not sign out. Please try again.",
    },

    details: {
      eyebrow: "YOUR DETAILS",
      nameLabel: "Full name",
      namePlaceholder: "Full name",
      phoneLabel: "Phone number",
      phonePlaceholder: "Phone number",
      /** Byte-for-byte what SellerVocab.notesPlaceholder said at this site. */
      notesPlaceholder: (s: SellerWords) =>
        `Anything ${s.the} should know? (optional)`,
      notesAria: "Order notes",
    },

    payment: {
      legend: "PAYMENT",
      /** The two radio labels, when the shop takes both. */
      cash: "Cash",
      bankTransfer: "Bank transfer",
      /** One method is a statement, not a question. The emphasised noun is
       *  split out because it is bold inside the sentence. */
      transferOnlyBefore: "Paid by ",
      transferOnlyWord: "bank transfer",
      transferOnlyAfter: " before your order is prepared.",
      cashOnlyBefore: "Paid in ",
      cashOnlyWord: "cash",
      cashOnlyAfter: ".",
      noBankDetails: (s: SellerWords) =>
        `${s.thisCap} has not published bank details yet, so it cannot take orders. Please contact them directly.`,
      // The wall a visitor with a foreign card hits, and the way through it.
      noLocalAccount: "No local bank account?",
      noLocalAccountBody: (who: string) =>
        `Bank transfers are hard from abroad. Message ${who} directly and they will arrange payment with you — many take cash on collection or a card in person.`,
      messageSeller: (s: SellerWords) => `Message ${s.the}`,
      /** What happens next, per receipt rule × guest. */
      expect: {
        guestReceipt: (s: SellerWords) =>
          `You'll see ${s.poss} bank details on your tracking page after placing the order. ${s.thisCap} asks for a photo of your transfer, which you can attach there.`,
        receipt: (s: SellerWords) =>
          `You'll see ${s.poss} bank details after placing the order. ${s.thisCap} asks for a photo of your transfer.`,
        guest: (s: SellerWords) =>
          `You'll see ${s.poss} bank details on your tracking page after placing the order, and you tell ${s.the} once you've sent the transfer.`,
        plain: (s: SellerWords) =>
          `You'll see ${s.poss} bank details and upload your transfer receipt after placing the order.`,
      },
    },

    summary: {
      eyebrow: "SUMMARY",
      /** The other word for form.tryAgain, on the same screen. Reported. */
      retry: "Retry",
      working: "Calculating your total…",
      subtotal: "Subtotal",
      tax: "Tax",
      delivery: "Delivery",
      total: "Total",
    },

    submit: {
      place: "Place order",
      placeWithTotal: (total: string) => `Place order — Rs ${total}`,
    },

    // Fallbacks only. The server sends finished prose in body.error and it wins
    // — so on the common path these are never seen. Reported: a real fix needs
    // codes on the wire, the way t.taxi.errServer was added.
    errors: {
      cartLoad: "We couldn't load your cart.",
      quote: "We couldn't price your order.",
      priceChanged: "The price changed. Please review the new total.",
      failed: "Checkout failed.",
      placed: "Order placed!",
    },
  },

  // ── app/cart/page.tsx ────────────────────────────────────────────────────
  cart: {
    /** The top-left arrow goes BACK now rather than home, so it says so. */
    back: "Back",
    heading: "Your bag",
    /** English pluralises with "s"; the other two do not, which is why this is
     *  a function and not two strings glued together in the JSX. */
    count: (items: number, sellers: number) =>
      `${items} item${items === 1 ? "" : "s"} from ${sellers} seller${sellers === 1 ? "" : "s"}`,
    separately: " · each is paid for separately",
    /** Sits above the seller name on food and ticket baskets. */
    from: "from ",

    // Per-basket words. The icon and the href stay in the page — they are not
    // words. `section.shop.title` is never rendered (a shop basket shows the
    // shop's own name) and is kept only so the three domains stay parallel.
    section: {
      food: { title: "Your food order", browseLabel: "Add more dishes" },
      shop: { title: "From", browseLabel: "Keep shopping" },
      events: { title: "Your tickets", browseLabel: "See what's on" },
    },

    empty: {
      title: "Your bag is waiting for something good",
      body: "Food, shops and tickets each keep their own basket.",
      /** The shop tile says this instead of section.shop.browseLabel — a third
       *  English wording for one action. Frozen as found, and reported. */
      browseProducts: "Browse products",
    },

    error: "We couldn't load this basket just now. Your items are safe — please try again.",
    tryAgain: "Try again",

    unavailable: "No longer available — remove it to continue.",
    lowStock: (left: number) =>
      `Only ${left} left — reduce the quantity to continue.`,
    fewer: (name: string) => `One fewer ${name}`,
    more: (name: string) => `One more ${name}`,
    remove: (name: string) => `Remove ${name}`,

    subtotal: "Subtotal",
    deliveryNote: "Delivery, if you choose it, is added at checkout.",
    fixItems: "Fix the items above to continue",
    checkout: "Checkout",
    /** Appended only for the marketplace, where there is more than one basket. */
    checkoutShopSuffix: " with this shop",
  },
};

/**
 * The shape every language must satisfy, taken from the English.
 *
 * DELIBERATELY NOT `as const`, for the reason written out in
 * lib/delivery/copy.i18n.ts: with it, `typeof EN` types every field as its own
 * string LITERAL, so the French would have to say "Place order" to type-check —
 * the annotation would enforce that nothing is translated. Widened, it enforces
 * the thing worth enforcing: same keys, same types, everywhere.
 */
export type CheckoutCopy = typeof EN;

const FR: CheckoutCopy = {
  seller: {
    shop: {
      the: "le magasin",
      theCap: "Le magasin",
      thisCap: "Ce magasin",
      poss: "du magasin",
    },
    food: {
      the: "le restaurant",
      theCap: "Le restaurant",
      thisCap: "Ce restaurant",
      poss: "du restaurant",
    },
    events: {
      the: "l’organisateur",
      theCap: "L’organisateur",
      thisCap: "Cet organisateur",
      poss: "de l’organisateur",
    },
  },

  page: {
    back: "Retour à votre panier",
    heading: "Paiement",
  },

  form: {
    loading: "Chargement de votre panier…",
    loadFailedTitle: "Nous n’avons pas pu charger votre panier",
    tryAgain: "Réessayer",
    emptyTitle: "Votre panier est vide",
    emptyBody: "Ajoutez quelque chose à votre panier avant de payer.",

    blocked: {
      email:
        "Saisissez un e-mail valide pour que nous puissions envoyer votre confirmation de commande.",
      name: "Saisissez votre nom complet pour continuer.",
      phone: (s: SellerWords) =>
        `Saisissez votre numéro de téléphone pour que ${s.the} puisse vous joindre.`,
      location: "Partagez votre position de livraison pour continuer.",
      zone: "Choisissez votre zone de livraison pour continuer.",
      payment: (s: SellerWords) =>
        `${s.thisCap} n’accepte pas le mode de paiement choisi.`,
      closed: (s: SellerWords) =>
        `${s.theCap} est fermé pour cette option en ce moment.`,
      quote: (s: SellerWords) =>
        `En attente de la confirmation du prix par ${s.the}…`,
    },

    items: {
      eyebrow: "ARTICLES",
      issue: "Certains articles ne sont plus disponibles.",
      issueLink: "Vérifiez votre panier",
    },

    schedule: {
      closedNow: (s: SellerWords) => `${s.thisCap} est fermé en ce moment.`,
      tryOpeningHours: "Veuillez réessayer pendant les heures d’ouverture.",
      todayPrefix: " · Aujourd’hui ",
      openNow: "Ouvert",
      todayLower: " · aujourd’hui ",
    },

    ticket: {
      eyebrow: "COMMENT ÇA MARCHE",
      body: "Vos billets arrivent par e-mail avec un code QR. Montrez-le à l’entrée — rien n’est envoyé ni livré.",
    },

    fulfilment: {
      legend: "MODE DE LIVRAISON",
      closed: (s: SellerWords) => `${s.theCap} est fermé en ce moment.`,
      noRrDelivery: (s: SellerWords) =>
        `${s.thisCap} n’utilise pas notre équipe de livraison.`,
      deliveryOff: "La livraison ne fonctionne pas en ce moment.",
      pickupTitle: "À récupérer ici",
    },

    zone: {
      eyebrow: "ZONE DE LIVRAISON",
      question: "Dans quelle partie de Rodrigues livrons-nous ?",
      choose: "Choisir votre zone…",
      covers: "Couvre : ",
      none: "Aucune zone de livraison n’est encore configurée. Choisissez le retrait ou votre propre livraison.",
      largeLabel: "C’est un objet volumineux — il faut une voiture",
      largeHelp:
        "Cochez ceci pour tout ce qui ne tient pas sur un scooter — meubles, bouteille de gaz, appareil ménager, plusieurs grands cartons. Nous n’enverrons qu’un chauffeur avec une voiture ou une camionnette. Cela ne change pas le prix.",
      within: (hours: number) => `Livré généralement en moins de ${hours} heures.`,
      largeSlower:
        "Les objets volumineux peuvent prendre plus de temps — moins de chauffeurs ont une voiture.",
      agreed:
        "L’heure exacte de livraison se convient entre vous et le chauffeur.",
      today: "Livraison aujourd’hui : ",
    },

    location: {
      eyebrow: "VOTRE POSITION",
      shared: (lat: string, lng: string) => `Position partagée (${lat}, ${lng})`,
      why: "Nous livrons sur un point GPS, pas sur une adresse postale — c’est bien plus fiable ici.",
      update: "Mettre à jour la position",
      share: "Partager ma position",
      notesPlaceholder: "Repère ou indications (facultatif)",
      notesAria: "Indications de livraison",
      unsupported:
        "Cet appareil ne peut pas partager de position. Choisissez plutôt le retrait.",
      denied:
        "Nous n’avons pas pu obtenir votre position. Autorisez l’accès à la position et réessayez.",
      needed: "Partagez votre position pour continuer.",
    },

    guest: {
      eyebrow: "COMMANDE SANS COMPTE",
      intro:
        "Pas besoin de compte. Nous vous enverrons par e-mail votre confirmation et un lien pour suivre cette commande.",
      emailLabel: "E-mail",
      emailPlaceholder: "votre@email.com",
      emailBad: "Cette adresse e-mail ne semble pas correcte.",
      emailHint:
        "Votre confirmation de commande arrivera ici — vérifiez qu’elle est correcte.",
      haveAccount: "Vous avez déjà un compte ?",
      signIn: "Se connecter",
      toSave: "pour enregistrer cette commande dans votre historique.",
    },

    signedIn: {
      srLabel: "Connecté",
      orderingAs: "Vous commandez en tant que ",
      signingOut: "Déconnexion…",
      notYou: "Ce n’est pas vous ?",
      signOutFailed: "Impossible de se déconnecter. Veuillez réessayer.",
    },

    details: {
      eyebrow: "VOS COORDONNÉES",
      nameLabel: "Nom complet",
      namePlaceholder: "Nom complet",
      phoneLabel: "Numéro de téléphone",
      phonePlaceholder: "Numéro de téléphone",
      notesPlaceholder: (s: SellerWords) =>
        `Quelque chose à signaler à ${s.the} ? (facultatif)`,
      notesAria: "Notes de commande",
    },

    payment: {
      legend: "PAIEMENT",
      cash: "Espèces",
      bankTransfer: "Virement bancaire",
      transferOnlyBefore: "Payé par ",
      transferOnlyWord: "virement bancaire",
      transferOnlyAfter: " avant la préparation de votre commande.",
      cashOnlyBefore: "Payé en ",
      cashOnlyWord: "espèces",
      cashOnlyAfter: ".",
      noBankDetails: (s: SellerWords) =>
        `${s.thisCap} n’a pas encore publié de coordonnées bancaires et ne peut donc pas prendre de commandes. Contactez directement le vendeur.`,
      noLocalAccount: "Pas de compte bancaire local ?",
      noLocalAccountBody: (who: string) =>
        `Les virements bancaires sont difficiles depuis l’étranger. Contactez directement ${who} pour convenir d’un paiement — beaucoup acceptent les espèces au retrait ou la carte sur place.`,
      messageSeller: (s: SellerWords) => `Contacter ${s.the}`,
      expect: {
        guestReceipt: (s: SellerWords) =>
          `Vous verrez les coordonnées bancaires ${s.poss} sur votre page de suivi après avoir passé la commande. ${s.thisCap} demande une photo de votre virement, que vous pourrez y joindre.`,
        receipt: (s: SellerWords) =>
          `Vous verrez les coordonnées bancaires ${s.poss} après avoir passé la commande. ${s.thisCap} demande une photo de votre virement.`,
        guest: (s: SellerWords) =>
          `Vous verrez les coordonnées bancaires ${s.poss} sur votre page de suivi après avoir passé la commande, et vous prévenez ${s.the} une fois le virement envoyé.`,
        plain: (s: SellerWords) =>
          `Vous verrez les coordonnées bancaires ${s.poss} et vous enverrez votre reçu de virement après avoir passé la commande.`,
      },
    },

    summary: {
      eyebrow: "RÉCAPITULATIF",
      retry: "Réessayer",
      working: "Calcul de votre total…",
      subtotal: "Sous-total",
      tax: "Taxe",
      delivery: "Livraison",
      total: "Total",
    },

    submit: {
      place: "Passer la commande",
      placeWithTotal: (total: string) => `Passer la commande — Rs ${total}`,
    },

    errors: {
      cartLoad: "Nous n’avons pas pu charger votre panier.",
      quote: "Nous n’avons pas pu calculer le prix de votre commande.",
      priceChanged: "Le prix a changé. Veuillez vérifier le nouveau total.",
      failed: "La commande n’a pas abouti.",
      placed: "Commande passée !",
    },
  },

  cart: {
    back: "Retour",
    heading: "Votre panier",
    count: (items: number, sellers: number) =>
      `${items} article${items === 1 ? "" : "s"} chez ${sellers} vendeur${sellers === 1 ? "" : "s"}`,
    separately: " · chacun se paie séparément",
    from: "de ",

    section: {
      food: { title: "Votre commande de repas", browseLabel: "Ajouter d’autres plats" },
      shop: { title: "De", browseLabel: "Continuer les achats" },
      events: { title: "Vos billets", browseLabel: "À l’affiche" },
    },

    empty: {
      title: "Votre panier attend quelque chose de bon",
      body: "Les repas, les magasins et les billets gardent chacun leur propre panier.",
      browseProducts: "Parcourir les produits",
    },

    error:
      "Nous n’avons pas pu charger ce panier pour l’instant. Vos articles sont en sécurité — veuillez réessayer.",
    tryAgain: "Réessayer",

    unavailable: "Plus disponible — retirez-le pour continuer.",
    lowStock: (left: number) =>
      `Il n’en reste que ${left} — réduisez la quantité pour continuer.`,
    fewer: (name: string) => `Un ${name} de moins`,
    more: (name: string) => `Un ${name} de plus`,
    remove: (name: string) => `Retirer ${name}`,

    subtotal: "Sous-total",
    deliveryNote: "La livraison, si vous la choisissez, est ajoutée au paiement.",
    fixItems: "Corrigez les articles ci-dessus pour continuer",
    checkout: "Payer",
    checkoutShopSuffix: " ce magasin",
  },
};

const CR: CheckoutCopy = {
  seller: {
    shop: {
      the: "laboutik la",
      theCap: "Laboutik la",
      thisCap: "Sa laboutik la",
      poss: "laboutik la",
    },
    food: {
      the: "lakwizinn la",
      theCap: "Lakwizinn la",
      thisCap: "Sa lakwizinn la",
      poss: "lakwizinn la",
    },
    events: {
      the: "organizater la",
      theCap: "Organizater la",
      thisCap: "Sa organizater la",
      poss: "organizater la",
    },
  },

  page: {
    back: "Retour ver ou panye",
    heading: "Peyman",
  },

  form: {
    loading: "Pe sarz ou panye…",
    loadFailedTitle: "Nou pa finn kapav sarz ou panye",
    tryAgain: "Esey ankor",
    emptyTitle: "Ou panye vid",
    emptyBody: "Azout enn zafer dan ou panye avan ou peye.",

    blocked: {
      email: "Met enn email valid pou ki nou kapav avoy ou konfirmasion komann.",
      name: "Met ou non konplet pou kontinie.",
      phone: (s: SellerWords) =>
        `Met ou nimero telefonn pou ki ${s.the} kapav zwenn ou.`,
      location: "Partaz ou pozision livrezon pou kontinie.",
      zone: "Swazir ou zonn livrezon pou kontinie.",
      payment: (s: SellerWords) =>
        `${s.thisCap} pa aksepte sa metod peyman la.`,
      closed: (s: SellerWords) =>
        `${s.theCap} ferme pou sa opsion la aster la.`,
      quote: (s: SellerWords) => `Pe atann ${s.the} konfirm ou pri…`,
    },

    items: {
      eyebrow: "BANN ZAFER",
      issue: "Sertin zafer nepli disponib.",
      issueLink: "Verifie ou panye",
    },

    schedule: {
      closedNow: (s: SellerWords) => `${s.thisCap} ferme aster la.`,
      tryOpeningHours: "Esey ankor pandan ler ouvertir.",
      todayPrefix: " · Zordi ",
      openNow: "Ouver",
      todayLower: " · zordi ",
    },

    ticket: {
      eyebrow: "KOUMA SA MARSE",
      body: "Ou bann tiket ariv par email ar enn kod QR. Montre li kot laport — pena nanye pou poste ouswa livre.",
    },

    fulfilment: {
      legend: "MANIER LIVREZON",
      closed: (s: SellerWords) => `${s.theCap} ferme aster la.`,
      noRrDelivery: (s: SellerWords) =>
        `${s.thisCap} pa servi nou lekip livrezon.`,
      deliveryOff: "Livrezon pa pe marse aster la.",
      pickupTitle: "Pou al pran isi",
    },

    zone: {
      eyebrow: "ZONN LIVREZON",
      question: "Dan ki parti Rodrig nou pe livre ?",
      choose: "Swazir ou zonn…",
      covers: "Kouver : ",
      none: "Pena okenn zonn livrezon ankor. Swazir pou al pran li ouswa ou prop livrezon.",
      largeLabel: "Sa enn gro zafer — li bizin enn loto",
      largeHelp:
        "Tik sa pou nenport ki zafer ki pa rant lor enn skoter — mebl, enn boutey gaz, enn aparey, plizir gro kartron. Nou pou avoy zis enn sofer ar enn loto ouswa enn van. Sa pa sanz pri la.",
      within: (hours: number) => `Normalman livre dan mwins ki ${hours} er.`,
      largeSlower: "Gro zafer kapav pran plis letan — mwins sofer ena enn loto.",
      agreed: "Ler exak livrezon, ou ek sofer la met dakor lor la.",
      today: "Livrezon zordi : ",
    },

    location: {
      eyebrow: "KOT OU ETE",
      shared: (lat: string, lng: string) => `Pozision partaze (${lat}, ${lng})`,
      why: "Nou livre lor enn poin GPS, pa lor enn adres — sa pli fiab isi.",
      update: "Met azour pozision la",
      share: "Partaz kot mo ete la",
      notesPlaceholder: "Landrwa ouswa bann indikasion (opsionel)",
      notesAria: "Indikasion livrezon",
      unsupported:
        "Sa aparey la pa kapav partaz enn pozision. Swazir plito pou al pran li.",
      denied:
        "Nou pa finn kapav gagn ou pozision. Otoriz akse pozision ek esey ankor.",
      needed: "Partaz ou pozision pou kontinie.",
    },

    guest: {
      eyebrow: "KOMANN SAN KONT",
      intro:
        "Pena bezwin kont. Nou pou avoy ou konfirmasion ek enn lien pou swiv sa komann la par email.",
      emailLabel: "Email",
      emailPlaceholder: "ou@email.com",
      emailBad: "Sa adres email la pa paret korek.",
      emailHint: "Ou konfirmasion komann pou ariv isi — verifie ki li korek.",
      haveAccount: "Ou deza ena enn kont ?",
      signIn: "Konekte",
      toSave: "pou gard sa komann la dan ou listorik.",
    },

    signedIn: {
      srLabel: "Konekte",
      orderingAs: "Ou pe komande kouma ",
      signingOut: "Pe dekonekte…",
      notYou: "Pa ou sa ?",
      signOutFailed: "Nou pa finn kapav dekonekte ou. Esey ankor.",
    },

    details: {
      eyebrow: "OU BANN DETAY",
      nameLabel: "Non konplet",
      namePlaceholder: "Non konplet",
      phoneLabel: "Nimero telefonn",
      phonePlaceholder: "Nimero telefonn",
      notesPlaceholder: (s: SellerWords) =>
        `Enn zafer ${s.the} bizin kone ? (opsionel)`,
      notesAria: "Not lor komann",
    },

    payment: {
      legend: "PEYMAN",
      cash: "Kas",
      bankTransfer: "Vireman banker",
      transferOnlyBefore: "Peye par ",
      transferOnlyWord: "vireman banker",
      transferOnlyAfter: " avan ou komann prepare.",
      cashOnlyBefore: "Peye an ",
      cashOnlyWord: "kas",
      cashOnlyAfter: ".",
      noBankDetails: (s: SellerWords) =>
        `${s.thisCap} pa finn ankor pibliye so detay labank, alor li pa kapav pran komann. Kontakte vander la direkteman.`,
      noLocalAccount: "Pena kont labank lokal ?",
      noLocalAccountBody: (who: string) =>
        `Vireman banker difisil depi lot pei. Ekrir direk ${who} ek zot pou aranz enn peyman ar ou — boukou aksepte kas kan ou al pran li, ouswa kart lor plas.`,
      messageSeller: (s: SellerWords) => `Ekrir ${s.the}`,
      expect: {
        guestReceipt: (s: SellerWords) =>
          `Ou pou trouv detay labank ${s.poss} lor ou paz swivi apre ou finn pas komann la. ${s.thisCap} demann enn foto ou vireman, ki ou kapav zwenn laba.`,
        receipt: (s: SellerWords) =>
          `Ou pou trouv detay labank ${s.poss} apre ou finn pas komann la. ${s.thisCap} demann enn foto ou vireman.`,
        guest: (s: SellerWords) =>
          `Ou pou trouv detay labank ${s.poss} lor ou paz swivi apre ou finn pas komann la, ek ou dir ${s.the} kan ou finn avoy vireman la.`,
        plain: (s: SellerWords) =>
          `Ou pou trouv detay labank ${s.poss} ek ou avoy ou resi vireman apre ou finn pas komann la.`,
      },
    },

    summary: {
      eyebrow: "REZIME",
      retry: "Esey ankor",
      working: "Pe kalkil ou total…",
      subtotal: "Sou-total",
      tax: "Tax",
      delivery: "Livrezon",
      total: "Total",
    },

    submit: {
      place: "Konfirm komann",
      placeWithTotal: (total: string) => `Konfirm komann — Rs ${total}`,
    },

    errors: {
      cartLoad: "Nou pa finn kapav sarz ou panye.",
      quote: "Nou pa finn kapav kalkil pri ou komann.",
      priceChanged: "Pri la finn sanze. Silvouple verifie nouvo total la.",
      failed: "Komann la pa finn pase.",
      placed: "Komann konfirme !",
    },
  },

  cart: {
    back: "Retourne",
    heading: "Ou panye",
    count: (items: number, sellers: number) =>
      `${items} zafer depi ${sellers} vander`,
    separately: " · sakenn peye separeman",
    from: "depi ",

    section: {
      food: { title: "Ou komann manze", browseLabel: "Azout lezot plat" },
      shop: { title: "Depi", browseLabel: "Kontinie aste" },
      events: { title: "Ou bann tiket", browseLabel: "Sa ki pou arive" },
    },

    empty: {
      title: "Ou panye pe atann enn bon zafer",
      body: "Manze, laboutik ek tiket, sakenn ena so prop panye.",
      browseProducts: "Get bann prodwi",
    },

    error:
      "Nou pa finn kapav sarz sa panye la pou lemoman. Ou bann zafer an sekirite — esey ankor.",
    tryAgain: "Esey ankor",

    unavailable: "Nepli disponib — tir li pou kontinie.",
    lowStock: (left: number) =>
      `Ena zis ${left} ki reste — diminie kantite pou kontinie.`,
    fewer: (name: string) => `Enn ${name} an mwins`,
    more: (name: string) => `Enn ${name} an plis`,
    remove: (name: string) => `Tir ${name}`,

    subtotal: "Sou-total",
    deliveryNote: "Livrezon, si ou swazir li, azoute kot peyman.",
    fixItems: "Aranz bann zafer anwo pou kontinie",
    checkout: "Peye",
    checkoutShopSuffix: " sa laboutik la",
  },
};

export const CHECKOUT_COPY: Record<Language, CheckoutCopy> = {
  en: EN,
  fr: FR,
  cr: CR,
};

/** The seller words for a resolved domain, in the reader's language. */
export function sellerWords(
  language: Language,
  domain: CartDomain,
): SellerWords {
  return CHECKOUT_COPY[language].seller[domain];
}
