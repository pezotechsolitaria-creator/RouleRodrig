// ── Every word on the Deliver Anything flow, in three languages ─────────────
//
// ── WHY THIS IS NOT IN lib/i18n.ts ─────────────────────────────────────────
// The site dictionary is imported by the navbar, so it is in the bundle of
// every page on roulerodrig.com. These ~150 keys × 3 languages belong to one
// flow and would ride along on the home page, the blog and the map for nothing.
// It reuses the same `Language` union, the same LanguageProvider and the same
// localStorage key, so a person who chose Kreol at the door is still in Kreol
// here — it is the same system, split at the bundle rather than at the concept.
//
// ── WHY FRENCH MATTERS MORE THAN IT LOOKS ──────────────────────────────────
// The research done for this rebuild reversed an assumption worth writing down:
// Kreol is the language of the HOME, and it is what people speak. But the
// language people READ on Rodrigues — forms, notices, government letters, the
// bank — is French. Somebody who left school at fourteen has read French
// documents their whole life and has read almost nothing in Kreol, which has
// only recently had a settled orthography. So Kreol here is a comfort and a
// signal of respect; FRENCH is the accessibility win, and both ship.
//
// ── AND THE PART NO TRANSLATION FIXES ──────────────────────────────────────
// 2022 census Vol. VI Table E2a: 44% of Rodriguans aged 60+ cannot read or
// write, 64% at 75+. For close to half the people this surface was rebuilt for,
// no language reaches them at all. That is why the photo input is a first-class
// answer, why every choice is a picture-and-a-word card, and why the phone
// number at the bottom of the page is not a fallback but a route.
//
// ── ON THE KREOL ───────────────────────────────────────────────────────────
// Written to match the voice already in lib/i18n.ts and using the orthography
// that file established. IT HAS NOT BEEN READ BY A NATIVE SPEAKER. Kreol
// Rodrige differs from Kreol Morisien in ways that matter to a reader, and the
// right people to settle it are on the island. Every string here is a
// placeholder in the honest sense: correct in structure, waiting for an ear.

import type { Language } from "@/lib/i18n";

/** The five things a person can be sending, as one question. */
export type ItemChoice = "general" | "food" | "fragile" | "heavy" | "large";

const EN = {
  // ── The required-field contract, stated once and kept on screen ──────────
  required: {
    /** Sits above every screen of the form, permanently. */
    warning:
      "Fields marked * are required — drivers need them to price accurately.",
    /** Read out by screen readers in place of the asterisk glyph. */
    srMark: "required",
    /** The sticky-bar version: one line at the 16px floor. The long one is
     *  said once, on screen one, where the asterisk is first met. */
    short: "= required for an accurate price",
  },

  progress: (step: number, total: number) => `Step ${step} of ${total}`,
  back: "Back",
  edit: "Change",

  /** The page's h1. /deliver is a server component and the chosen language
   *  lives in localStorage, so this one string is read by a tiny client child
   *  — see app/deliver/DeliverTitle.tsx. */
  pageTitle: "Get anything moved on Rodrigues",

  // ── Screen 1 ─────────────────────────────────────────────────────────────
  what: {
    step: "What",
    question: "What are we moving?",
    kind: {
      package: {
        title: "Collect & deliver",
        body: "It already exists somewhere.",
      },
      shop: {
        title: "Buy & deliver",
        body: "Someone buys it for you first.",
      },
    },
    itemQuestion: "What kind of thing is it?",
    item: {
      general: { label: "Parcel", help: "A box, a bag, anything ordinary." },
      food: { label: "Hot food", help: "A meal, a takeaway." },
      fragile: {
        label: "Fragile",
        help: "Glass, papers, a cake — must stay dry.",
      },
      heavy: { label: "Heavy", help: "Gas bottle, cement, tools." },
      large: { label: "Bigger than a car", help: "Furniture, a mattress." },
    },
    /** Only for the large choice — the one refinement that changes the fleet. */
    largeHeavy: "It is heavy as well",
    describeLabel: "Describe it",
    describeLabelShop: "What should we buy?",
    describePlaceholder: "e.g. A medium box, about 10 kg, from my sister",
    describePlaceholderShop: "e.g. 2 gas bottles, 12 kg, any brand",
    describeOrPhoto: "A few words, or a photo — either is enough.",
    budgetLabel: "The most we may spend on it (Rs)",
    budgetPlaceholder: "e.g. 1500",
    budgetHelp:
      "You repay what was actually spent, up to this. The delivery fee is separate and each driver names their own.",
    budgetBad: "Enter an amount in rupees, like 1500.",
    fleet: (list: string) => `Drivers who can take this: ${list}.`,
    /** When EVERY vehicle qualifies, naming all seven ran to three lines and
     *  said nothing — the list is only information when it is a restriction. */
    fleetAny: "Any driver can take this.",
    fleetNone:
      "No vehicle on the island can take that combination — try again.",
  },

  // ── Screen 2 — the question the flow never asked ─────────────────────────
  when: {
    step: "When",
    question: "When do you need it?",
    kind: {
      asap: {
        label: "As soon as possible",
        help: "A driver comes as soon as one takes it.",
      },
      today: { label: "Today", help: "Later on today." },
      tomorrow: { label: "Tomorrow", help: "Any time tomorrow." },
      date: { label: "Pick a day", help: "Up to three months ahead." },
    },
    dateLabel: "Which day?",
    slotQuestion: "What time of day?",
    slotAny: "Any time between 8am and 8pm.",
    helper: "Drivers only quote if they can make your time.",
    todayGone: "Everything for today has closed — the last slot ends at 8pm.",
    chosen: (window: string) => `Needed ${window}`,
  },

  // ── Choosing how to pay, at the moment a price is accepted ───────────────
  pay: {
    question: "How will you pay?",
    cash: {
      label: "Cash at the door",
      help: "Pay the driver when it arrives.",
    },
    transfer: {
      label: "Bank transfer",
      help: "Send it now, then attach the receipt.",
    },
    cashCapped: (limit: string) =>
      `Over ${limit} we ask for a bank transfer — that is a lot of cash for a driver to carry.`,
    cashTotal: (total: string) =>
      `The driver will collect ${total} at the door.`,
    proofTitle: "Send your transfer receipt",
    proofHelp: "A photo or PDF of the transfer, up to 4 MB.",
    proofWhy: "Your driver cannot set off until this arrives.",
    proofChoose: "Choose a file or take a photo",
    proofSubmit: "I have sent the money",
    proofSending: "Sending…",
    proofDone: "Received. Your driver can start now.",
    referenceLabel: "Reference number",
    referenceHelp: "Optional — it helps us match your transfer.",
    waiting: "Waiting for your transfer receipt.",
    idTitle: "Send a photo of your ID",
    idWhy:
      "For cash payments we ask for your ID. Your driver checks it at the door with your 4-digit code, and it is deleted 30 days later.",
    idChoose: "Take a photo of your ID",
    idSubmit: "Send it",
    idDone: "ID received. Your driver can start now.",
    idWaiting: "Waiting for your ID photo.",
    idBadType: "Send a photo — a JPG, PNG or WebP.",
    tooBig: "That file is too large — the limit is 4 MB.",
    badType: "Use a JPG, PNG, WebP or PDF.",
    failed: "We could not send that. Please try again.",
  },

  // ── Screen 3 ─────────────────────────────────────────────────────────────
  where: {
    step: "Where",
    question: "Where is it going?",
    pickup: "Where do we collect it?",
    pickupShop: "Where should they buy it?",
    dropoff: "Where should it go?",
    anywhere: "Anywhere you can find it",
    anywhereHelp: "The driver picks the shop. Most people choose this.",
    namedShop: "From one particular place",
    namedShopHelp: "Say which, if it has to come from somewhere specific.",
    addNote: "Add a note for the driver",
    pickupNote: "Who to ask for, or how to find it",
    dropoffNote: "Gate colour, floor, anything that helps",
    contact: "How do drivers reach you?",
    name: "Your name",
    namePlaceholder: "Marie",
    phone: "Your phone",
    email: "Your email",
    emailHelp: "How you get back to this request from another phone.",
    /** For an ANSWERED place, where the label shares a line with the
     *  value: "From: Port Mathurin" reads as a route, and the two-line
     *  version of the same row measured 77px against a 56px floor. */
    fromShort: "From",
    toShort: "To",
    searchPlaceholder: "Village, shop or landmark",
    useMyLocation: "Use where I am now",
    nearby: "Common places",
    recent: "You used recently",
    choose: "Choose",
    change: "Change",
    myLocation: "My current location",
    useTyped: (q: string) => `Use “${q}” — we’ll confirm the price`,
  },

  // ── Screen 3 ─────────────────────────────────────────────────────────────
  review: {
    step: "Review",
    question: "Ready to post?",
    rowItem: "What",
    rowWhen: "When",
    rowRoute: "From → to",
    rowContact: "You",
    rowBudget: "Shopping limit",
    promises: [
      "Drivers send their price — you choose.",
      "Free to ask, and nothing to pay yet.",
      "Pay cash at the door, or by transfer.",
      "A 4-digit code proves delivery.",
    ],
    post: "Post request — free",
    posting: "Posting…",
    postedCaption: "Drivers will send prices. You choose.",
  },

  // ── The pinned button ────────────────────────────────────────────────────
  cta: {
    next: "Continue",
    missingWhat: "Say what it is, or add a photo",
    missingBudget: "Say what to buy, and your limit",
    missingWhere: "Add where it starts and ends",
    missingDropoff: "Say where to deliver it",
    missingContact: "Add your name and number",
    /** ONE line at 16px on a 375px phone. */
    freeToAsk: "Free to ask — pay only when you accept.",
  },

  // ── Getting out, and getting help ────────────────────────────────────────
  help: {
    title: "Rather talk to someone?",
    body: "Call or message us and we will post it for you.",
    call: "Call us",
    whatsapp: "WhatsApp us",
  },

  // ── Coming back to something already posted ─────────────────────────────
  mine: {
    title: "Your requests",
    /** Sits after the live status, so it is a fragment and not a sentence. */
    fromPrice: (fee: string) => `from ${fee}`,
    // ── FINISHED WORK IS HISTORY, NOT A TASK ────────────────────────────
    // Collapsed rather than deleted: a customer still needs to find what a
    // driver charged them last month, but not while they are waiting on a
    // quote today.
    pastTitle: (n: number) => `Earlier (${n})`,
    empty: "Nothing waiting on you.",
  },

  // ── The screen where the money is actually agreed ────────────────────────
  //
  // /deliver/[id]: quotes arrive, one is chosen, a driver is followed. The form
  // that leads to it has been trilingual since it was built and this screen was
  // not — so somebody answered five questions in Kreol and then met English at
  // the exact moment they were asked to commit to a price.
  //
  // Anything this screen shares with the form is READ FROM THE FORM'S KEYS
  // rather than repeated here: the two kinds (`what.kind`), the whole payment
  // question (`pay`), the reference and email labels (`find`), the errors
  // (`error`). One idea, one wording, wherever it appears.
  tracker: {
    // ── A guest coming back on a phone that has forgotten them ─────────────
    emailTitle: "Which email did you use?",
    emailWhy:
      "This request was posted without an account, so we check the email against it before showing you anything.",
    emailPlaceholder: "you@example.com",
    emailSubmit: "Show my request",

    // ── We could not load it ───────────────────────────────────────────────
    errorTitle: "We couldn’t load this",
    errorBody: "Your request is safe — this is us, not you. Try again in a moment.",
    errorRetry: "Try again",
    loadFailed: "Could not load that request.",

    // ── It is not there ────────────────────────────────────────────────────
    goneTitle: "We couldn’t find that request",
    goneBody: "The link may be wrong, or it was posted with a different email.",
    goneOtherEmail: "Try another email",
    goneBack: "Back to Deliver anything",
    goneLost: "Lost the link? Find it there with your reference and email.",

    // ── Where this stands ──────────────────────────────────────────────────
    /** `when` is expiresIn(): "in 3 hours". */
    closesIn: (when: string) => `Drivers can quote until it closes ${when}`,
    showingTo: (email: string) => `Showing this request to ${email}.`,

    // ── What was asked for ─────────────────────────────────────────────────
    /** The prefix of when.chosen, kept as its own key only because the screen
     *  greys it and leaves the window in full colour. Same word, one wording. */
    neededLabel: "Needed",
    largeItem: "Large item",
    collectFrom: "Collect from",
    deliverTo: "Deliver to",

    // ── The prices, or the wait ────────────────────────────────────────────
    chooseDriver: "Choose a driver",
    noPricesYet: "No prices yet",
    waitingTitle: "Drivers are being shown your job",
    waitingBody:
      "Prices appear here as drivers send them. Keep this page open, or come back to it any time with your reference.",
    /** On a driver's card, after their vehicle. */
    completedCount: (n: number) => `${n} delivered`,

    // ── The sheet, which is the last screen before money is committed ──────
    bookTitle: (name: string) => `Book ${name}?`,
    bookAria: (name: string, fee: string) => `Book ${name} for ${fee}`,
    bookWhy: "They will be told straight away and will come for it.",
    close: "Close",
    payAtDoor: "You pay at the door",
    paid: "You paid",
    codePromise:
      "You will get a 4-digit code. Read it out only once it is in your hands — it is what proves the delivery happened.",
    booking: "Booking…",
    bookFor: (fee: string) => `Book for ${fee}`,
    othersWithdrawn: "The other prices are withdrawn once you book.",
    booked: (name: string) => `${name} is booked.`,

    // ── The driver who is coming ───────────────────────────────────────────
    noDriverNow: "No driver on this job right now",
    callDriver: (name: string) => `Call ${name}`,
    codeEyebrow: "YOUR CODE",
    codeWhen: "Read this out only when it is in your hands.",

    // ── The receipt, and the ID ────────────────────────────────────────────
    referenceOptional: "Reference number (optional)",
    referencePlaceholder: "e.g. MCB-8891",
    /** DELIBERATELY NOT pay.idWhy, which says something else: the form promises
     *  the driver checks it at the door, this panel promises who can see it and
     *  for how long. Both are true and they are not the same sentence. */
    idWhy:
      "For cash payments we ask for your ID. Only the driver bringing this delivery can see it, only until it arrives, and it is deleted 30 days later.",

    // ── How was it? ────────────────────────────────────────────────────────
    rateTitle: (name: string) => `How was ${name}?`,
    rateThanks: "Thank you",
    rateHelp: "Tap a star. It helps the next person choose a driver.",
    rateSaved: "Your rating helps the next customer choose.",
    rateAria: (name: string) => `Rate ${name}`,
    starAria: (n: number) => `${n} star${n === 1 ? "" : "s"}`,
    rateFailed: "Could not save that.",

    // ── Again, and out ─────────────────────────────────────────────────────
    again: "Post this again",
    cancelling: "Cancelling…",
    cancelDelivery: "Cancel this delivery",
    withdraw: "Withdraw this request",
    withdrawn: "Request withdrawn.",
  },

  // ── Getting back to a request whose link is gone ─────────────────────────
  find: {
    /** The collapsed line — all this is until somebody opens it. */
    open: "Already asked for prices? Find your request",
    title: "Find your request",
    help:
      "The reference is on the request page, like RR-3F9A2B. We check it against the email you used, so neither one on its own opens anything.",
    refLabel: "Reference",
    refBad: "That should be six characters, like RR-3F9A2B.",
    emailLabel: "The email you used",
    cancel: "Cancel",
    submit: "Find it",
    submitting: "Looking…",
    notFound: "We couldn't find that.",
  },

  // ── The photo, which for many people IS the description ─────────────────
  photo: {
    help: "A photo is enough on its own.",
    take: "Take a photo",
    choose: "Choose a photo",
    takeAria: "Take a photo of the item",
    chooseAria: "Choose a photo of the item",
    added: "Photo added. Drivers will see this.",
    remove: "Remove",
    failed: "Could not save the photo.",
    failedNetwork: "Could not save the photo. Check your connection.",
  },

  // ── Offline ──────────────────────────────────────────────────────────────
  offline: {
    banner: "You are offline. Everything you type is saved on this phone.",
    queued: "Saved. We will post it the moment you are back online.",
    resumed: "We kept what you had started.",
    discard: "Start again",
    sending: "You are back online — posting your request…",
  },

  error: {
    generic: "Something went wrong. Please try again.",
    network: "Could not reach us. Check your connection and try again.",
  },
};

/**
 * The shape every language must satisfy, taken from the English.
 *
 * DELIBERATELY NOT `as const`. With it, `typeof EN` types every field as its own
 * string LITERAL, so the French entry would have to say "Collect & deliver" to
 * type-check — the annotation would enforce that nothing is translated. Widened,
 * it enforces the thing actually worth enforcing: same keys, same types,
 * everywhere. The test file checks the rest, including that no string is empty.
 */
export type DeliverCopy = typeof EN;

const FR: DeliverCopy = {
  required: {
    warning:
      "Les champs marqués * sont obligatoires — les chauffeurs en ont besoin pour un prix juste.",
    srMark: "obligatoire",
    short: "= obligatoire pour un prix juste",
  },

  progress: (step: number, total: number) => `Étape ${step} sur ${total}`,
  back: "Retour",
  edit: "Modifier",

  pageTitle: "Faites transporter n’importe quoi à Rodrigues",

  what: {
    step: "Quoi",
    /** Short enough for ONE line at 26px on a 375px phone. The longer
     *  "Que transportons-nous ?" wrapped to two and put screen 1 over the
     *  fold in French only. */
    question: "Que transporter ?",
    kind: {
      package: {
        title: "Récupérer et livrer",
        body: "La chose existe déjà quelque part.",
      },
      shop: {
        title: "Acheter et livrer",
        body: "Quelqu’un l’achète pour vous d’abord.",
      },
    },
    itemQuestion: "De quel genre de chose s’agit-il ?",
    item: {
      general: {
        label: "Colis",
        help: "Un carton, un sac, quelque chose d’ordinaire.",
      },
      food: { label: "Plat chaud", help: "Un repas, un plat à emporter." },
      fragile: {
        label: "Fragile",
        help: "Verre, papiers, un gâteau — doit rester au sec.",
      },
      heavy: { label: "Lourd", help: "Bouteille de gaz, ciment, outils." },
      large: {
        label: "Plus grand qu’une voiture",
        help: "Meubles, un matelas.",
      },
    },
    largeHeavy: "C’est lourd aussi",
    describeLabel: "Décrivez-le",
    describeLabelShop: "Que faut-il acheter ?",
    describePlaceholder: "ex. Un carton moyen, environ 10 kg, de ma sœur",
    describePlaceholderShop:
      "ex. 2 bouteilles de gaz, 12 kg, n’importe quelle marque",
    describeOrPhoto: "Quelques mots, ou une photo — l’un ou l’autre suffit.",
    budgetLabel: "Le maximum que nous pouvons dépenser (Rs)",
    budgetPlaceholder: "ex. 1500",
    budgetHelp:
      "Vous remboursez ce qui a été réellement dépensé, jusqu’à ce montant. Les frais de livraison sont séparés et chaque chauffeur fixe les siens.",
    budgetBad: "Entrez un montant en roupies, comme 1500.",
    fleet: (list: string) => `Chauffeurs qui peuvent le prendre : ${list}.`,
    fleetAny: "N’importe quel chauffeur peut le prendre.",
    fleetNone:
      "Aucun véhicule de l’île ne peut prendre cette combinaison — réessayez.",
  },

  when: {
    step: "Quand",
    question: "Quand en avez-vous besoin ?",
    kind: {
      asap: {
        label: "Dès que possible",
        help: "Un chauffeur vient dès qu’il accepte.",
      },
      today: { label: "Aujourd’hui", help: "Plus tard dans la journée." },
      tomorrow: { label: "Demain", help: "À n’importe quelle heure demain." },
      date: {
        label: "Choisir un jour",
        help: "Jusqu’à trois mois à l’avance.",
      },
    },
    dateLabel: "Quel jour ?",
    slotQuestion: "À quel moment de la journée ?",
    slotAny: "N’importe quand entre 8h et 20h.",
    helper:
      "Les chauffeurs ne proposent un prix que s’ils peuvent respecter votre horaire.",
    todayGone:
      "Tout est terminé pour aujourd’hui — le dernier créneau finit à 20h.",
    chosen: (window: string) => `Pour ${window}`,
  },

  pay: {
    question: "Comment allez-vous payer ?",
    cash: {
      label: "Espèces à la porte",
      help: "Vous payez le chauffeur à l’arrivée.",
    },
    transfer: {
      label: "Virement bancaire",
      help: "Envoyez maintenant, puis joignez le reçu.",
    },
    cashCapped: (limit: string) =>
      `Au-delà de ${limit} nous demandons un virement — cela fait beaucoup d’espèces à transporter.`,
    cashTotal: (total: string) =>
      `Le chauffeur encaissera ${total} à la porte.`,
    proofTitle: "Envoyez votre reçu de virement",
    proofHelp: "Une photo ou un PDF du virement, jusqu’à 4 Mo.",
    proofWhy: "Votre chauffeur ne peut pas partir avant de l’avoir reçu.",
    proofChoose: "Choisir un fichier ou prendre une photo",
    proofSubmit: "J’ai envoyé l’argent",
    proofSending: "Envoi…",
    proofDone: "Bien reçu. Votre chauffeur peut partir.",
    referenceLabel: "Numéro de référence",
    referenceHelp: "Facultatif — cela nous aide à retrouver votre virement.",
    waiting: "En attente de votre reçu de virement.",
    idTitle: "Envoyez une photo de votre pièce d’identité",
    idWhy:
      "Pour les paiements en espèces nous demandons votre pièce d’identité. Le chauffeur la vérifie à la porte avec votre code à 4 chiffres, et elle est supprimée 30 jours après.",
    idChoose: "Photographier ma pièce d’identité",
    idSubmit: "Envoyer",
    idDone: "Pièce reçue. Votre chauffeur peut partir.",
    idWaiting: "En attente de votre pièce d’identité.",
    idBadType: "Envoyez une photo — JPG, PNG ou WebP.",
    tooBig: "Ce fichier est trop lourd — la limite est de 4 Mo.",
    badType: "Utilisez un JPG, PNG, WebP ou PDF.",
    failed: "L’envoi n’a pas abouti. Veuillez réessayer.",
  },

  where: {
    step: "Où",
    question: "Où cela doit-il aller ?",
    pickup: "Où le récupérons-nous ?",
    pickupShop: "Où faut-il l’acheter ?",
    dropoff: "Où faut-il le livrer ?",
    anywhere: "N’importe où vous le trouvez",
    anywhereHelp:
      "Le chauffeur choisit le magasin. La plupart des gens choisissent ceci.",
    namedShop: "À un endroit précis",
    namedShopHelp: "Dites lequel, si cela doit venir d’un endroit particulier.",
    addNote: "Ajouter une précision pour le chauffeur",
    pickupNote: "Qui demander, ou comment trouver l’endroit",
    dropoffNote: "Couleur du portail, étage, tout ce qui aide",
    contact: "Comment les chauffeurs vous joignent-ils ?",
    name: "Votre nom",
    namePlaceholder: "Marie",
    phone: "Votre téléphone",
    email: "Votre e-mail",
    emailHelp: "Pour retrouver cette demande depuis un autre téléphone.",
    fromShort: "De",
    toShort: "À",
    searchPlaceholder: "Village, magasin ou lieu-dit",
    useMyLocation: "Utiliser où je suis maintenant",
    nearby: "Lieux courants",
    recent: "Utilisés récemment",
    choose: "Choisir",
    change: "Modifier",
    myLocation: "Ma position actuelle",
    useTyped: (q: string) => `Utiliser « ${q} » — nous confirmerons le prix`,
  },

  review: {
    step: "Vérifier",
    question: "Prêt à publier ?",
    rowItem: "Quoi",
    rowWhen: "Quand",
    rowRoute: "De → à",
    rowContact: "Vous",
    rowBudget: "Limite d’achat",
    promises: [
      "Les chauffeurs proposent leur prix — vous choisissez.",
      "Gratuit, et rien à payer pour l’instant.",
      "En espèces à la porte, ou par virement.",
      "Un code à 4 chiffres prouve la livraison.",
    ],
    post: "Publier la demande — gratuit",
    posting: "Publication…",
    postedCaption: "Les chauffeurs enverront leurs prix. Vous choisissez.",
  },

  cta: {
    next: "Continuer",
    missingWhat: "Dites ce que c’est, ou ajoutez une photo",
    missingBudget: "Dites quoi acheter, et votre limite",
    missingWhere: "Indiquez le départ et l’arrivée",
    missingDropoff: "Dites où le livrer",
    missingContact: "Ajoutez votre nom et votre numéro",
    freeToAsk: "Gratuit — vous ne payez qu’en acceptant.",
  },

  help: {
    title: "Vous préférez parler à quelqu’un ?",
    body: "Appelez-nous ou écrivez-nous et nous publierons la demande pour vous.",
    call: "Appelez-nous",
    whatsapp: "Écrivez sur WhatsApp",
  },

  mine: {
    title: "Vos demandes",
    fromPrice: (fee: string) => `à partir de ${fee}`,
    pastTitle: (n: number) => `Précédentes (${n})`,
    empty: "Rien n’attend après vous.",
  },

  tracker: {
    emailTitle: "Quel e-mail avez-vous utilisé ?",
    emailWhy:
      "Cette demande a été publiée sans compte : nous vérifions l’e-mail avant de vous montrer quoi que ce soit.",
    emailPlaceholder: "vous@exemple.com",
    emailSubmit: "Afficher ma demande",

    errorTitle: "Nous n’avons pas pu charger ceci",
    errorBody:
      "Votre demande est en sécurité — le problème vient de nous, pas de vous. Réessayez dans un instant.",
    errorRetry: "Réessayer",
    loadFailed: "Impossible de charger cette demande.",

    goneTitle: "Nous n’avons pas trouvé cette demande",
    goneBody:
      "Le lien est peut-être erroné, ou la demande a été publiée avec un autre e-mail.",
    goneOtherEmail: "Essayer un autre e-mail",
    goneBack: "Retour à la page Livraison",
    goneLost:
      "Lien perdu ? Retrouvez la demande là-bas avec votre référence et votre e-mail.",

    closesIn: (when: string) =>
      `Les chauffeurs peuvent proposer un prix jusqu’à la fermeture, ${when}`,
    showingTo: (email: string) => `Cette demande est affichée pour ${email}.`,

    neededLabel: "Pour",
    largeItem: "Objet volumineux",
    collectFrom: "Récupérer à",
    deliverTo: "Livrer à",

    chooseDriver: "Choisissez un chauffeur",
    noPricesYet: "Pas encore de prix",
    waitingTitle: "Votre demande est montrée aux chauffeurs",
    waitingBody:
      "Les prix apparaissent ici au fur et à mesure que les chauffeurs les envoient. Gardez cette page ouverte, ou revenez-y à tout moment avec votre référence.",
    completedCount: (n: number) => `${n} livraison${n === 1 ? "" : "s"}`,

    bookTitle: (name: string) => `Réserver ${name} ?`,
    bookAria: (name: string, fee: string) => `Réserver ${name} pour ${fee}`,
    bookWhy: "Il sera prévenu tout de suite et viendra la chercher.",
    close: "Fermer",
    payAtDoor: "Vous payez à la porte",
    paid: "Vous avez payé",
    codePromise:
      "Vous recevrez un code à 4 chiffres. Ne le donnez qu’une fois la livraison entre vos mains — c’est lui qui prouve qu’elle a bien eu lieu.",
    booking: "Réservation…",
    bookFor: (fee: string) => `Réserver pour ${fee}`,
    othersWithdrawn: "Les autres prix sont retirés dès que vous réservez.",
    booked: (name: string) => `${name} est réservé.`,

    noDriverNow: "Aucun chauffeur sur cette livraison pour le moment",
    callDriver: (name: string) => `Appeler ${name}`,
    codeEyebrow: "VOTRE CODE",
    codeWhen: "Ne le donnez qu’une fois la livraison entre vos mains.",

    referenceOptional: "Numéro de référence (facultatif)",
    referencePlaceholder: "ex. MCB-8891",
    idWhy:
      "Pour les paiements en espèces nous demandons votre pièce d’identité. Seul le chauffeur qui apporte cette livraison peut la voir, seulement jusqu’à son arrivée, et elle est supprimée 30 jours après.",

    rateTitle: (name: string) => `Comment était ${name} ?`,
    rateThanks: "Merci",
    rateHelp:
      "Touchez une étoile. Cela aide la prochaine personne à choisir un chauffeur.",
    rateSaved: "Votre note aidera le prochain client à choisir.",
    rateAria: (name: string) => `Noter ${name}`,
    starAria: (n: number) => `${n} étoile${n === 1 ? "" : "s"}`,
    rateFailed: "Impossible d’enregistrer votre note.",

    again: "Publier à nouveau",
    cancelling: "Annulation…",
    cancelDelivery: "Annuler cette livraison",
    withdraw: "Retirer cette demande",
    withdrawn: "Demande retirée.",
  },

  find: {
    open: "Déjà demandé des prix ? Trouvez votre demande",
    title: "Trouvez votre demande",
    help:
      "La référence est sur la page de la demande, comme RR-3F9A2B. Nous la vérifions avec l’e-mail que vous avez utilisé : aucun des deux n’ouvre quoi que ce soit tout seul.",
    refLabel: "Référence",
    refBad: "Cela doit faire six caractères, comme RR-3F9A2B.",
    emailLabel: "L’e-mail que vous avez utilisé",
    cancel: "Annuler",
    submit: "Trouver ma demande",
    submitting: "Recherche…",
    notFound: "Nous n’avons pas trouvé cette demande.",
  },

  photo: {
    help: "Une photo suffit à elle seule.",
    take: "Prendre une photo",
    choose: "Choisir une photo",
    takeAria: "Prendre une photo de l’objet",
    chooseAria: "Choisir une photo de l’objet",
    added: "Photo ajoutée. Les chauffeurs la verront.",
    remove: "Retirer",
    failed: "Impossible d’enregistrer la photo.",
    failedNetwork:
      "Impossible d’enregistrer la photo. Vérifiez votre connexion.",
  },

  offline: {
    banner:
      "Vous êtes hors ligne. Tout ce que vous tapez est gardé sur ce téléphone.",
    queued: "Enregistré. Nous publierons dès votre retour en ligne.",
    resumed: "Nous avons gardé ce que vous aviez commencé.",
    discard: "Recommencer",
    sending: "Vous êtes de nouveau en ligne — publication de votre demande…",
  },

  error: {
    generic: "Une erreur s’est produite. Veuillez réessayer.",
    network:
      "Impossible de nous joindre. Vérifiez votre connexion et réessayez.",
  },
};

const CR: DeliverCopy = {
  required: {
    warning:
      "Bann kaz ar * obligatwar — bann sofer bizin sa pou donn enn bon pri.",
    srMark: "obligatwar",
    short: "= obligatwar pou enn bon pri",
  },

  progress: (step: number, total: number) => `Etap ${step} lor ${total}`,
  back: "Retour",
  edit: "Sanze",

  pageTitle: "Fer transporte nenport ki zafer dan Rodrig",

  what: {
    step: "Ki",
    question: "Ki nou pe transporte ?",
    kind: {
      package: {
        title: "Al pran ek livre",
        body: "Zafer la deza existe enn plas.",
      },
      shop: {
        title: "Aste ek livre",
        body: "Enn dimounn aste li pou ou avan.",
      },
    },
    itemQuestion: "Ki kalite zafer sa ete ?",
    item: {
      general: {
        label: "Pake",
        help: "Enn kartron, enn sak, nenport ki zafer ordiner.",
      },
      food: { label: "Manze so", help: "Enn repa, enn plat pou amene." },
      fragile: {
        label: "Frazil",
        help: "Ver, papie, enn gato — bizin res sek.",
      },
      heavy: { label: "Lour", help: "Boutey gaz, siman, zouti." },
      large: { label: "Pli gro ki enn loto", help: "Mebl, enn matla." },
    },
    largeHeavy: "Li lour osi",
    describeLabel: "Dekrir li",
    describeLabelShop: "Ki nou bizin aste ?",
    describePlaceholder: "ex. Enn kartron mwayen, apepre 10 kg, kot mo ser",
    describePlaceholderShop: "ex. 2 boutey gaz, 12 kg, nenport ki mark",
    describeOrPhoto: "De trwa mo, ou enn foto — enn ou lot ase.",
    budgetLabel: "Maximum ki nou kapav depanse (Rs)",
    budgetPlaceholder: "ex. 1500",
    budgetHelp:
      "Ou rambours seki finn vremem depanse, ziska sa montan la. Fre livrezon separe ek sak sofer fix so prop pri.",
    budgetBad: "Met enn montan an roupi, kouma 1500.",
    fleet: (list: string) => `Bann sofer ki kapav pran sa : ${list}.`,
    fleetAny: "Nenport ki sofer kapav pran sa.",
    fleetNone:
      "Okenn veikil lor zil la pa kapav pran sa konbinezon la — esey ankor.",
  },

  when: {
    step: "Kan",
    question: "Kan ou bizin li ?",
    kind: {
      asap: {
        label: "Pli vit posib",
        help: "Enn sofer vini deswit ki li aksepte.",
      },
      today: { label: "Zordi", help: "Pli tar zordi." },
      tomorrow: { label: "Demen", help: "Nenport ler demen." },
      date: { label: "Swazir enn zour", help: "Ziska trwa mwa alavans." },
    },
    dateLabel: "Ki zour ?",
    slotQuestion: "Ki moman dan lazourne ?",
    slotAny: "Nenport ler ant 8er gramatin ek 8er aswar.",
    helper: "Bann sofer donn enn pri zis si zot kapav respekte ou ler.",
    todayGone: "Tou finn ferme pou zordi — dernie kreno fini 8er aswar.",
    chosen: (window: string) => `Bizin ${window}`,
  },

  pay: {
    question: "Kouma ou pou peye ?",
    cash: { label: "Kas kot laport", help: "Ou peye sofer la kan li arive." },
    transfer: {
      label: "Vireman banker",
      help: "Avoy kas la aster, apre zwenn resi la.",
    },
    cashCapped: (limit: string) =>
      `Plis ki ${limit} nou demann enn vireman — sa fer boukou kas pou enn sofer transporte.`,
    cashTotal: (total: string) => `Sofer la pou pran ${total} kot laport.`,
    proofTitle: "Avoy ou resi vireman",
    proofHelp: "Enn foto ouswa PDF vireman la, ziska 4 Mo.",
    proofWhy: "Ou sofer pa kapav demare avan li ariv.",
    proofChoose: "Swazir enn fisye ouswa pran enn foto",
    proofSubmit: "Mo finn avoy kas la",
    proofSending: "Pe avoye…",
    proofDone: "Nou finn gagne li. Ou sofer kapav koumanse.",
    referenceLabel: "Nimero referans",
    referenceHelp: "Opsionel — sa ed nou retrouv ou vireman.",
    waiting: "Pe atann ou resi vireman.",
    idTitle: "Avoy enn foto ou kart idantite",
    idWhy:
      "Pou peyman kas nou demann ou kart idantite. Sofer la verifie li kot laport ar ou kod 4 sif, ek li efase 30 zour apre.",
    idChoose: "Pran enn foto mo kart",
    idSubmit: "Avoye",
    idDone: "Kart resevwar. Ou sofer kapav koumanse.",
    idWaiting: "Pe atann foto ou kart idantite.",
    idBadType: "Avoy enn foto — JPG, PNG ouswa WebP.",
    tooBig: "Sa fisye la tro lour — limit se 4 Mo.",
    badType: "Servi enn JPG, PNG, WebP ouswa PDF.",
    failed: "Nou pa finn kapav avoy sa. Esey ankor.",
  },

  where: {
    step: "Kot",
    question: "Kot li bizin ale ?",
    pickup: "Kot nou al pran li ?",
    pickupShop: "Kot bizin aste li ?",
    dropoff: "Kot bizin livre li ?",
    anywhere: "Nenport kot ou trouve li",
    anywhereHelp: "Sofer la swazir laboutik. Laplipar dimounn swazir sa.",
    namedShop: "Depi enn plas presi",
    namedShopHelp: "Dir kotsanla, si li bizin sorti enn plas spesifik.",
    addNote: "Azout enn presizion pou sofer la",
    pickupNote: "Ki dimounn demande, ou kouma trouv plas la",
    dropoffNote: "Kouler baryer, letaz, tou seki ede",
    contact: "Kouma bann sofer kontakt ou ?",
    name: "Ou non",
    namePlaceholder: "Marie",
    phone: "Ou telefonn",
    email: "Ou email",
    emailHelp: "Pou retrouv sa demann la depi enn lot telefonn.",
    fromShort: "Depi",
    toShort: "Ver",
    searchPlaceholder: "Vilaz, laboutik ou landrwa",
    useMyLocation: "Servi kot mo ete la",
    nearby: "Bann plas kouran",
    recent: "Servi dernierman",
    choose: "Swazir",
    change: "Sanze",
    myLocation: "Kot mo ete la",
    useTyped: (q: string) => `Servi « ${q} » — nou pou konfirm pri la`,
  },

  review: {
    step: "Verifie",
    question: "Pare pou avoye ?",
    rowItem: "Ki",
    rowWhen: "Kan",
    rowRoute: "Depi → ziska",
    rowContact: "Ou",
    rowBudget: "Limit aste",
    promises: [
      "Bann sofer propoz zot pri — ou swazir.",
      "Gratis, ek nanye pou peye ankor.",
      "Kas kot laport, ouswa par vireman.",
      "Enn kod 4 sif prouve livrezon.",
    ],
    post: "Avoy demann — gratis",
    posting: "Pe avoye…",
    postedCaption: "Bann sofer pou avoy zot pri. Ou swazir.",
  },

  cta: {
    next: "Kontinie",
    missingWhat: "Dir ki sa ete, ou azout enn foto",
    missingBudget: "Dir ki pou aste, ek ou limit",
    missingWhere: "Met kot li koumanse ek kot li fini",
    missingDropoff: "Dir kot bizin livre li",
    missingContact: "Met ou non ek ou nimero",
    freeToAsk: "Gratis — ou peye zis kan ou aksepte.",
  },

  help: {
    title: "Ou prefer koz ar enn dimounn ?",
    body: "Apel nou ou ekrir nou, ek nou pou avoy demann la pou ou.",
    call: "Apel nou",
    whatsapp: "Ekrir lor WhatsApp",
  },

  mine: {
    title: "Ou bann demann",
    fromPrice: (fee: string) => `apartir ${fee}`,
    pastTitle: (n: number) => `Avan (${n})`,
    empty: "Nanye pe atann ou.",
  },

  tracker: {
    emailTitle: "Ki email ou finn servi ?",
    emailWhy:
      "Sa demann la ti avoye san kont, alor nou verifie email la avan nou montre ou nanye.",
    emailPlaceholder: "ou@exemple.com",
    emailSubmit: "Montre mo demann",

    errorTitle: "Nou pa finn kapav sarz sa",
    errorBody:
      "Ou demann la an sekirite — problem la kot nou, pa kot ou. Esey ankor dan enn ti moman.",
    errorRetry: "Esey ankor",
    loadFailed: "Pa finn kapav sarz sa demann la.",

    goneTitle: "Nou pa finn trouv sa demann la",
    goneBody: "Kitfwa lien la pa bon, ouswa demann la ti avoye ar enn lot email.",
    goneOtherEmail: "Esey enn lot email",
    goneBack: "Retourn lor paz Livrezon",
    goneLost:
      "Ou finn perdi lien la ? Trouv demann la laba ar ou referans ek ou email.",

    closesIn: (when: string) =>
      `Bann sofer kapav donn enn pri ziska demann la ferme, ${when}`,
    showingTo: (email: string) => `Sa demann la pe montre pou ${email}.`,

    neededLabel: "Bizin",
    largeItem: "Gro zafer",
    collectFrom: "Al pran kot",
    deliverTo: "Livre kot",

    chooseDriver: "Swazir enn sofer",
    noPricesYet: "Pankor ena pri",
    waitingTitle: "Bann sofer pe trouv ou travay la",
    waitingBody:
      "Bann pri paret isi amizir bann sofer avoy zot. Gard sa paz la ouver, ouswa revini nenport ler ar ou referans.",
    completedCount: (n: number) => `${n} livrezon fini`,

    bookTitle: (name: string) => `Rezerv ${name} ?`,
    bookAria: (name: string, fee: string) => `Rezerv ${name} pou ${fee}`,
    bookWhy: "Nou dir li deswit ek li pou vinn pran li.",
    close: "Ferme",
    payAtDoor: "Ou peye kot laport",
    paid: "Ou finn peye",
    codePromise:
      "Ou pou gagn enn kod 4 sif. Dir li zis kan zafer la dan ou lame — se li ki prouve livrezon la finn fer.",
    booking: "Pe rezerve…",
    bookFor: (fee: string) => `Rezerv pou ${fee}`,
    othersWithdrawn: "Bann lot pri retire deswit ki ou rezerve.",
    booked: (name: string) => `${name} finn rezerve.`,

    noDriverNow: "Pena okenn sofer lor sa travay la aster",
    callDriver: (name: string) => `Apel ${name}`,
    codeEyebrow: "OU KOD",
    codeWhen: "Dir li zis kan zafer la dan ou lame.",

    referenceOptional: "Nimero referans (opsionel)",
    referencePlaceholder: "ex. MCB-8891",
    idWhy:
      "Pou peyman kas nou demann ou kart idantite. Zis sofer ki amenn sa livrezon la kapav trouv li, zis ziska li arive, ek li efase 30 zour apre.",

    rateTitle: (name: string) => `Kouma ti ${name} ?`,
    rateThanks: "Mersi",
    rateHelp: "Tous enn zetwal. Sa ed prosen dimounn swazir enn sofer.",
    rateSaved: "Ou not ed prosen klian swazir.",
    rateAria: (name: string) => `Note ${name}`,
    starAria: (n: number) => `${n} zetwal`,
    rateFailed: "Pa finn kapav sov sa.",

    again: "Avoy sa ankor",
    cancelling: "Pe anile…",
    cancelDelivery: "Anil sa livrezon la",
    withdraw: "Retir sa demann la",
    withdrawn: "Demann retire.",
  },

  find: {
    open: "Ou fin deza demann pri ? Trouv ou demann",
    title: "Trouv ou demann",
    help:
      "Referans la lor paz demann la, kouma RR-3F9A2B. Nou verifie li ar email ki ou finn servi : okenn ladan pa ouver nanye tousel.",
    refLabel: "Referans",
    refBad: "Sa bizin ena sis karakter, kouma RR-3F9A2B.",
    emailLabel: "Email ki ou finn servi",
    cancel: "Anile",
    submit: "Trouv mo demann",
    submitting: "Pe rode…",
    notFound: "Nou pa finn trouv sa demann la.",
  },

  photo: {
    help: "Enn foto tousel ase.",
    take: "Pran enn foto",
    choose: "Swazir enn foto",
    takeAria: "Pran enn foto zafer la",
    chooseAria: "Swazir enn foto zafer la",
    added: "Foto azoute. Bann sofer pou trouv li.",
    remove: "Tire",
    failed: "Pa finn kapav sov foto la.",
    failedNetwork: "Pa finn kapav sov foto la. Verifie ou koneksion.",
  },

  offline: {
    banner: "Ou pa konekte. Tou seki ou tape reste lor sa telefonn la.",
    queued: "Sove. Nou pou avoy li deswit ki ou re-konekte.",
    resumed: "Nou finn gard seki ou ti koumanse.",
    discard: "Rekoumanse",
    sending: "Ou re-konekte — pe avoy ou demann…",
  },

  error: {
    generic: "Enn zafer finn mal pase. Esey ankor.",
    network: "Nou pa kapav zwenn ou. Verifie ou koneksion ek esey ankor.",
  },
};

export const DELIVER_COPY: Record<Language, DeliverCopy> = {
  en: EN,
  fr: FR,
  cr: CR,
};

/**
 * The item question collapses TWO database columns into ONE choice.
 *
 * size_class and cargo_kind are genuinely separate facts — a gas bottle is
 * heavy and small, a mattress is large and light — and the old form asked them
 * as two questions, which is correct and which cost a whole screen of height.
 *
 * Five chips answer both for every combination people actually post, and the
 * one combination that stays ambiguous (large AND heavy: a fridge, a cooker)
 * gets a single follow-up toggle that appears only under the large chip. That
 * is progressive disclosure doing real work rather than hiding a field.
 */
export function itemToColumns(
  item: ItemChoice,
  largeAndHeavy = false,
): {
  sizeClass: "standard" | "large";
  cargoKind: "general" | "food" | "fragile" | "heavy";
} {
  if (item === "large") {
    return {
      sizeClass: "large",
      cargoKind: largeAndHeavy ? "heavy" : "general",
    };
  }
  return { sizeClass: "standard", cargoKind: item };
}

/** The inverse, for restoring a saved draft. */
export function columnsToItem(
  sizeClass: string,
  cargoKind: string,
): { item: ItemChoice; largeAndHeavy: boolean } {
  if (sizeClass === "large")
    return { item: "large", largeAndHeavy: cargoKind === "heavy" };
  const k = cargoKind as ItemChoice;
  return {
    item: k === "food" || k === "fragile" || k === "heavy" ? k : "general",
    largeAndHeavy: false,
  };
}

export const ITEM_CHOICES: ItemChoice[] = [
  "general",
  "food",
  "fragile",
  "heavy",
  "large",
];
