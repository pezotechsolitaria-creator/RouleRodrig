// UI strings for the eSIM store and install page. English and French; Kreol
// readers get French, because the phone screens they will be following are in
// French or English, never Kreol (lib/email.ts makes the same call).

export type UiLang = "en" | "fr";

export const toUiLang = (l: string | null | undefined): UiLang => (l === "en" || !l ? "en" : "fr");

export const COPY = {
  en: {
    // ── Hero (M226: one screen holds the promise AND the four plans) ──
    // The h1 is two lines of one heading: the keyword line ("… eSIM") and the
    // promise. Both were MEASURED at 375px in Syne: the promise holds 2 lines
    // at 30px; "Mobile data on Rodrigues, before you land" needed 4.
    h1Kicker: "Rodrigues & Mauritius eSIM",
    h1: "Ready before you land",
    sub: "An instant eSIM on my.t 4G, the network that really covers Rodrigues — and you keep your WhatsApp number.",
    // Three facts in one row; measured to fit 335px at 12px.
    micro: ["Delivered in seconds", "my.t 4G", "Hotspot"],
    plansTitle: "Choose your data",
    plansNote: "Final prices · card or PayPal · QR in seconds",
    badges: { popular: "Our pick", best_value: "Best value", short_trip: "Short stay", long_stay: "Heavy use" } as Record<string, string>,
    choose: "Choose",
    noPlans: "Plans are being updated. Please check back in a few minutes.",
    loadError: "We couldn't load the plans just now. Please refresh the page.",
    howTitle: "How it works",
    how: [
      { t: "Buy in a minute", b: "Card or PayPal" },
      { t: "Install at home", b: "On Wi-Fi, before you fly" },
      { t: "Land, switch on", b: "Data roaming on — done" },
    ],
    trustStrong: "Every plan runs on my.t 4G.",
    trustRest: "Chili has no signal on Rodrigues, so we never sell it.",
    compatTitle: "Will it work on my phone?",
    compatUnlocked: "It must also be carrier-unlocked. Phones sold in mainland China, Hong Kong and Macau usually have no eSIM.",
    compatSearch: "Search your model, e.g. iPhone 13",
    compatNone: "Not on our list — try the *#06# test above before buying.",
    faqTitle: "Questions travellers ask",
    findTitle: "Already bought one?",
    findBody: "Enter your order number and email to open your install page again.",
    findRef: "Order number (ES-…)",
    findEmail: "Email used to pay",
    findGo: "Find my eSIM",
    alsoTitle: "Sort the rest of your arrival",
    also: [
      { href: "/transfers", label: "Airport transfer" },
      { href: "/browse/scooter", label: "Rent a scooter" },
      { href: "/guide/rodrigues", label: "Rodrigues travel guide" },
    ],
    // Checkout
    sheetTitle: "Your eSIM",
    email: "Email",
    emailHelp: "Your QR code and install link are sent here.",
    emailBad: "Please enter a valid email — your eSIM is sent there.",
    compatConfirm: "My phone supports eSIM and is unlocked",
    compatConfirmNeeded: "Please confirm your phone supports eSIM.",
    compatCheck: "Not sure? Check",
    payLoading: "Loading secure payment…",
    payFail: "The payment could not start. You have not been charged — please try again.",
    processing: "Payment received — preparing your eSIM…",
    processingSub: "This usually takes a few seconds. Please keep this page open.",
    secure: "Secure payment by PayPal · card accepted, no account needed",
    guarantee: "If we can't deliver your eSIM, you get a full refund.",
    close: "Close",
    soonTitle: "eSIM sales open very soon",
    soonBody: "Leave your email and we'll tell you the moment you can buy.",
    soonCta: "Notify me",
    soonDone: "Thank you — we'll email you as soon as it opens.",
    // ── Other destinations (M224) ──
    world: {
      h1Kicker: (name: string) => `${name} eSIM`,
      sub: (name: string, _inPlace: string) =>
        `An instant eSIM for ${name} that connects to a local network the moment you land — no SIM shop, no roaming bill.`,
      localNetworks: "Local 4G/5G",
      // "whichever has the best signal" only makes sense with a choice.
      netBody: (list: string, inPlace: string, many: boolean) =>
        many ? `This eSIM connects to ${list} ${inPlace}, whichever has the best signal where you are.` : `This eSIM connects to ${list} ${inPlace}.`,
      alsoTitle: "Before or after Rodrigues",
      also: [
        { href: "/esim", label: "Mauritius & Rodrigues eSIM" },
        { href: "/transfers", label: "Airport transfer" },
        { href: "/guide/rodrigues", label: "Rodrigues travel guide" },
      ],
    },
    destTitleHome: "Travelling beyond Mauritius?",
    destTitleWorld: "Other destinations",
    destCount: (n: number) => `${n} countries`,
    destFrom: (price: string) => `from ${price}`,
    destSearch: "Search a country",
    destNone: "Not on our list yet. Tell us where you're going on WhatsApp and we'll add it.",
    heroCtaNoPrice: "See plans",
    heroCompat: "Will my phone work?",
    perDayDays: (days: string) => `per day · ${days}`,
    compatDial: "Dial",
    compatCleared: "An EID number appears? Your phone takes eSIMs.",
    barFrom: (price: string) => `From ${price}`,
    // The bar leaves 138px for this line (MEASURED at 375px): "my.t 4G ·
    // Instant QR · hotspot included" (195px) was cut to "…". Keep it short.
    barSub: "Instant QR · hotspot",
    barQr: "instant QR",
    barCta: "See plans",
    help: "Questions? Ask us on WhatsApp",
    helpShort: "WhatsApp",
    helpMsg: (plan: string, inPlace: string) => `Hello! A question about the ${plan} eSIM for use ${inPlace}.`,
    helpMsgGeneric: "Hello! A question about the eSIM.",
    payTitle: "Pay securely",
    payMethods: "Visa · Mastercard · Amex · PayPal — no PayPal account needed",
    pass: "DATA PASS",
  },
  fr: {
    h1Kicker: "eSIM Rodrigues & Maurice",
    h1: "Prête avant l'atterrissage",
    sub: "Une eSIM instantanée sur my.t 4G, le réseau qui couvre vraiment Rodrigues — et vous gardez votre numéro WhatsApp.",
    // "Livrée en secondes" + "Partage de connexion" measured 352px: too wide.
    micro: ["QR en secondes", "my.t 4G", "Partage de connexion"],
    plansTitle: "Choisissez vos données",
    plansNote: "Prix finaux · carte ou PayPal · QR en secondes",
    badges: { popular: "Notre choix", best_value: "Meilleur prix", short_trip: "Court séjour", long_stay: "Gros usage" } as Record<string, string>,
    choose: "Choisir",
    noPlans: "Les forfaits sont en cours de mise à jour. Revenez dans quelques minutes.",
    loadError: "Impossible de charger les forfaits pour le moment. Rechargez la page.",
    howTitle: "Comment ça marche",
    how: [
      { t: "Achetez en 1 minute", b: "Carte ou PayPal" },
      { t: "Installez chez vous", b: "En Wi-Fi, avant le départ" },
      { t: "Atterrissez, activez", b: "Itinérance activée — c'est tout" },
    ],
    trustStrong: "Tous nos forfaits utilisent my.t 4G.",
    trustRest: "Chili n'a aucun signal à Rodrigues : nous ne le vendons jamais.",
    compatTitle: "Mon téléphone est-il compatible ?",
    compatUnlocked: "Il doit aussi être désimlocké. Les téléphones vendus en Chine continentale, à Hong Kong et Macao n'ont généralement pas d'eSIM.",
    compatSearch: "Cherchez votre modèle, ex. iPhone 13",
    compatNone: "Absent de notre liste — faites le test *#06# ci-dessus avant d'acheter.",
    faqTitle: "Les questions des voyageurs",
    findTitle: "Déjà acheté ?",
    findBody: "Entrez votre numéro de commande et votre email pour rouvrir votre page d'installation.",
    findRef: "Numéro de commande (ES-…)",
    findEmail: "Email utilisé pour payer",
    findGo: "Retrouver mon eSIM",
    alsoTitle: "Organisez le reste de votre arrivée",
    also: [
      { href: "/fr/taxi-rodrigues", label: "Transfert aéroport" },
      { href: "/fr/location-scooter-rodrigues", label: "Louer un scooter" },
      { href: "/fr/se-deplacer-a-rodrigues", label: "Se déplacer à Rodrigues" },
    ],
    sheetTitle: "Votre eSIM",
    email: "Email",
    emailHelp: "Votre QR code et votre lien d'installation y sont envoyés.",
    emailBad: "Entrez un email valide — votre eSIM y est envoyée.",
    compatConfirm: "Mon téléphone accepte l'eSIM et est désimlocké",
    compatConfirmNeeded: "Confirmez que votre téléphone accepte l'eSIM.",
    compatCheck: "Pas sûr ? Vérifier",
    payLoading: "Chargement du paiement sécurisé…",
    payFail: "Le paiement n'a pas pu démarrer. Vous n'avez pas été débité — réessayez.",
    processing: "Paiement reçu — préparation de votre eSIM…",
    processingSub: "Cela prend généralement quelques secondes. Gardez cette page ouverte.",
    secure: "Paiement sécurisé par PayPal · carte acceptée, sans compte",
    guarantee: "Si nous ne pouvons pas livrer votre eSIM, vous êtes remboursé intégralement.",
    close: "Fermer",
    soonTitle: "La vente d'eSIM ouvre très bientôt",
    soonBody: "Laissez votre email, nous vous prévenons dès l'ouverture.",
    soonCta: "Me prévenir",
    soonDone: "Merci — nous vous écrivons dès l'ouverture.",
    world: {
      h1Kicker: (name: string) => `eSIM ${name}`,
      // French countries take articles ("la France", "les Seychelles"), so
      // the sentence uses the stored preposition form ("en France",
      // "aux Seychelles") instead of the bare name.
      sub: (_name: string, inPlace: string) =>
        `Une eSIM instantanée à utiliser ${inPlace}, connectée à un réseau local dès l'arrivée — sans boutique ni facture d'itinérance.`,
      localNetworks: "4G/5G local",
      netBody: (list: string, inPlace: string, many: boolean) =>
        many ? `Cette eSIM se connecte à ${list} ${inPlace}, selon le meilleur signal là où vous êtes.` : `Cette eSIM se connecte à ${list} ${inPlace}.`,
      alsoTitle: "Avant ou après Rodrigues",
      also: [
        { href: "/fr/esim-maurice-rodrigues", label: "eSIM Maurice et Rodrigues" },
        { href: "/fr/taxi-rodrigues", label: "Transfert aéroport" },
        { href: "/fr/guide-rodrigues", label: "Le guide de Rodrigues" },
      ],
    },
    destTitleHome: "Vous voyagez au-delà de Maurice ?",
    destTitleWorld: "Autres destinations",
    destCount: (n: number) => `${n} pays`,
    destFrom: (price: string) => `dès ${price}`,
    destSearch: "Chercher un pays",
    destNone: "Pas encore dans notre liste. Dites-nous où vous allez sur WhatsApp, nous l'ajouterons.",
    heroCtaNoPrice: "Voir les forfaits",
    // Beside "Choisissez vos données" (227px) only 96px are left at 375px:
    // the full question dropped to its own line and pushed the 4th plan under
    // the nav. MEASURED.
    heroCompat: "Compatibilité ?",
    perDayDays: (days: string) => `par jour · ${days}`,
    compatDial: "Composez",
    compatCleared: "Un numéro EID s'affiche ? Votre téléphone accepte les eSIM.",
    barFrom: (price: string) => `Dès ${price}`,
    barSub: "QR instantané",
    barQr: "QR instantané",
    barCta: "Forfaits",
    help: "Une question ? Écrivez-nous sur WhatsApp",
    helpShort: "WhatsApp",
    helpMsg: (plan: string, inPlace: string) => `Bonjour ! Une question sur l'eSIM ${plan} à utiliser ${inPlace}.`,
    helpMsgGeneric: "Bonjour ! Une question sur l'eSIM.",
    payTitle: "Paiement sécurisé",
    payMethods: "Visa · Mastercard · Amex · PayPal — sans compte PayPal",
    pass: "PASS DATA",
  },
};

export type Copy = (typeof COPY)["en"];
