// ── Every word on the taxi booking and tracking screens, in three languages ──
//
// /taxi has been translated since it was built. /taxi/book and /taxi/track —
// the two screens that actually take a booking and follow it — were entirely
// hardcoded English, with no useLanguage call anywhere in either file. The
// newest and most important screens were the only untranslated ones in a
// trilingual product, so somebody chose Kreol at the door and then met a wall
// of English at the moment they were asked for their name and their phone.
//
// Split out of lib/i18n.ts for the same reason lib/delivery/copy.i18n.ts is:
// the site dictionary is imported by the navbar and therefore ships on every
// page, and these keys belong to two screens.
//
// ── WHY IT DOES NOT TRANSLATE model.ts IN PLACE ─────────────────────────────
// RIDE_SERVICE_META and CUSTOMER_STATUS live in lib/rides/model.ts, and that
// module has three other consumers: the admin desk, the driver's WhatsApp offer
// (whose text opens "Bonjour {name} — {meta.label} available:"), and the
// confirmation mail. Making those objects language-dependent would have
// translated the DRIVER'S message into the CUSTOMER'S language — a Kreol
// customer would have sent a Kreol job offer to a driver who reads French.
//
// So model.ts keeps its English constants untouched and this file carries the
// display copy beside them, keyed by the same unions. The screens read this;
// the admin, the driver and the mailer go on reading model.ts. Additive, and
// nothing that works today changes.
//
// ── TWO CONFLICTS IN THE EXISTING KREOL, SETTLED HERE ───────────────────────
// The two files that already carry Kreol disagree with each other:
//
//     lib/i18n.ts t.taxi          "chofer", and addresses the reader as "to"
//     lib/delivery/copy.i18n.ts   "sofer",  and addresses the reader as "ou"
//
// This file follows copy.i18n.ts on both counts. It is the newer house file,
// the settled orthography writes <s> rather than the French-influenced <ch>,
// and a stranger booking a taxi is not somebody you address as "to". That does
// mean /taxi says "chofer" while /taxi/book says "sofer" until t.taxi is
// brought across — a real inconsistency, written down here rather than left to
// be discovered.
//
// ── ON THE KREOL, THE SAME WARNING AS THE DELIVERY FLOW ─────────────────────
// IT HAS NOT BEEN READ BY A NATIVE SPEAKER. Correct in structure, matching the
// established orthography, waiting for an ear on the island. Kreol Rodrig
// differs from Kreol Morisien in ways a reader notices.
//
// And the thing worth repeating: FRENCH is the accessibility win here. People
// on Rodrigues READ French — forms, bank letters, government notices — while
// Kreol only recently settled an orthography. Both ship; the French is the one
// that has to be genuinely good.

import type { Language } from "@/lib/i18n";

const EN = {
  book: {
    chrome: {
      heading: "Book a ride",
      requiredNote: "= required, or we cannot price your ride.",
    },
    services: {
      taxi: {
        label: "Taxi",
        blurb: "A ride across the island",
      },
      airport: {
        label: "Airport transfer",
        blurb: "To or from Plaine Corail",
      },
      ferry: {
        label: "Ferry transfer",
        blurb: "To or from the Port Mathurin terminal",
      },
      hotel: {
        label: "Hotel transfer",
        blurb: "To or from where you are staying",
      },
      private: {
        label: "Private hire",
        blurb: "A driver for the day, or a set route",
      },
    },
    step1: {
      heading: "What do you need?",
    },
    step2: {
      directionGroupLabel: "Direction of travel",
      direction: {
        fromAirport: "From the airport",
        toAirport: "To the airport",
        fromFerry: "From the ferry",
        toFerry: "To the ferry",
      },
      fixedEnd: {
        airport: "Plaine Corail Airport",
        ferry: "Port Mathurin ferry terminal",
      },
      pickupFixedEyebrow: "PICKING YOU UP AT",
      pickupLabel: "PICK ME UP AT",
      pickupPlaceholder: "Hotel, beach, village…",
      dropoffFixedEyebrow: "GOING TO",
      dropoffLabel: "TAKE ME TO",
      dropoffPlaceholder: "Where are you going?",
      privateHireNote:
        "Your driver stays with you — tell them where you would like to go on the day. We will confirm the price with you; no charge until you agree.",
      whenNow: "As soon as possible",
      whenLater: "Book for later",
      whenFieldLabel: "When do you need it",
      passengersLabel: "PEOPLE",
      luggageLabel: "BAGS",
      fewerPassengers: "Fewer people",
      morePassengers: "More people",
      fewerLuggage: "Fewer bags",
      moreLuggage: "More bags",
      ferryRefLabel: "FERRY OR BOAT NUMBER",
      flightRefLabel: "FLIGHT NUMBER",
      ferryRefPlaceholder: "e.g. Anna M",
      flightRefPlaceholder: "e.g. MK034",
      ferryRefWhy:
        "Your driver watches the boat, so they are there when it docks — not an hour early.",
      flightRefWhy:
        "Your driver watches the flight, so they are there when you land — even if you are delayed.",
      meetGreet: "Wait for me inside with a sign",
    },
    price: {
      working: "Working out the price…",
      onRequest: "We'll confirm the price with you.",
      noCharge: "Nothing is charged until you agree.",
      eyebrow: "YOUR FARE",
      unpriced: "Price on request",
      nightRate: "night rate",
      paidToDriver: "Paid directly to your driver",
      distance: (km: number) => `about ${km} km`,
      duration: (min: number) => `~${min} min`,
    },
    cta: {
      back: "Back",
      continue: "Continue",
      book: "Find me a driver",
    },
    step3: {
      heading: "Almost done",
      intro:
        "Your driver needs a name and a number to find you. No account, no password.",
      nameLabel: "YOUR NAME",
      namePlaceholder: "e.g. Marie Perrine",
      phoneLabel: "YOUR PHONE",
      phonePlaceholder: "+230 5XXX XXXX",
      emailLabel: "EMAIL (OPTIONAL)",
      emailPlaceholder: "you@example.com",
      notesLabel: "ANYTHING THE DRIVER SHOULD KNOW (OPTIONAL)",
      notesPlaceholder: "e.g. baby seat, wheelchair, two stops",
      summaryWhenNow: "As soon as possible",
      payNote: "You pay the driver directly. Nothing is charged here.",
    },
    errors: {
      generic: "Something went wrong. Please try again.",
    },
    done: {
      heading: "We're finding your driver",
      body: "No need to call anyone. A driver will accept in the next few minutes and you'll see their name and number here.",
      referenceEyebrow: "YOUR REFERENCE",
      follow: "Follow my ride",
      keepReference:
        "Keep this reference. You'll need it and this phone number to check on the ride.",
    },
    summary: {
      route: (pickup: string, dropoff: string) => `${pickup} → ${dropoff}`,
      dayHire: (pickup: string) => `${pickup} → driver for the day`,
      passengers: (n: number) => (n === 1 ? "1 person" : `${n} people`),
    },
  },
  track: {
    chrome: {
      pageTitle: "Follow your ride | Roulé Rodrigues",
      header: "My ride",
    },
    step1: {
      title: "Follow your ride",
      help: "Your reference and the phone number you booked with.",
      refPlaceholder: "RR-4F2A91",
      refLabel: "Your reference",
      phonePlaceholder: "+230 5XXX XXXX",
      phoneLabel: "The phone number you booked with",
    },
    cta: {
      find: "Find my ride",
      call: "Call",
      whatsapp: "WhatsApp",
      checkAnother: "Check a different ride",
      bookAnother: "Book another ride",
    },
    errors: {
      notFound: "We couldn't find that.",
      missingFields:
        "Enter your reference and the phone number you booked with.",
      notFoundFull:
        "We couldn't find that. Check the reference and the phone number you used.",
      server: "Something went wrong. Please try again.",
      offline: "No connection. Please try again.",
    },
    status: {
      new: "We have your request",
      dispatching: "Finding your driver…",
      assigned: "Driver found",
      driver_on_way: "Your driver is on the way",
      arrived: "Your driver has arrived",
      on_trip: "On the way to your destination",
      completed: "Trip complete",
      cancelled: "Cancelled",
      no_driver: "We're arranging this for you by hand",
      searching: {
        round1: "Checking drivers near you…",
        round2: "Still looking nearby…",
        round3: "Checking more drivers across the island…",
        round4: "Still working on it — we'll call you if we need to.",
      },
    },
    step2: {
      noDriverHelp:
        "Every driver is busy right now, so a person is arranging this. We'll call you.",
      driverEyebrow: "YOUR DRIVER",
      steps: {
        requested: "Requested",
        driverFound: "Driver found",
        onTheWay: "On the way",
        arrived: "Arrived",
        onTrip: "On your trip",
        finished: "Finished",
      },
      rideEyebrow: "YOUR RIDE",
      payNote: "Paid directly to your driver.",
    },
    service: {
      taxi: "Taxi",
      airport: "Airport transfer",
      ferry: "Ferry transfer",
      hotel: "Hotel transfer",
      private: "Private hire",
    },
    price: {
      onRequest: "Price on request",
    },
  },
};

export type RidesCopy = typeof EN;

const FR: RidesCopy = {
  book: {
    chrome: {
      heading: "Réserver une course",
      requiredNote:
        "= obligatoire, sans quoi nous ne pouvons pas calculer votre prix.",
    },
    services: {
      taxi: {
        label: "Taxi",
        blurb: "Une course à travers l’île",
      },
      airport: {
        label: "Transfert aéroport",
        blurb: "Vers ou depuis Plaine Corail",
      },
      ferry: {
        label: "Transfert ferry",
        blurb: "Vers ou depuis le terminal de Port Mathurin",
      },
      hotel: {
        label: "Transfert hôtel",
        blurb: "Vers ou depuis votre logement",
      },
      private: {
        label: "Chauffeur privé",
        blurb: "Un chauffeur pour la journée, ou un trajet fixe",
      },
    },
    step1: {
      heading: "De quoi avez-vous besoin ?",
    },
    step2: {
      directionGroupLabel: "Sens du trajet",
      direction: {
        fromAirport: "Depuis l’aéroport",
        toAirport: "Vers l’aéroport",
        fromFerry: "Depuis le ferry",
        toFerry: "Vers le ferry",
      },
      fixedEnd: {
        airport: "Aéroport de Plaine Corail",
        ferry: "Terminal ferry de Port Mathurin",
      },
      pickupFixedEyebrow: "PRISE EN CHARGE À",
      pickupLabel: "OÙ VOUS PRENDRE",
      pickupPlaceholder: "Hôtel, plage, village…",
      dropoffFixedEyebrow: "DESTINATION",
      dropoffLabel: "OÙ VOUS EMMENER",
      dropoffPlaceholder: "Où allez-vous ?",
      privateHireNote:
        "Votre chauffeur reste avec vous — dites-lui le jour même où vous voulez aller. Nous confirmerons le prix avec vous — rien n’est débité avant votre accord.",
      whenNow: "Dès que possible",
      whenLater: "Réserver pour plus tard",
      whenFieldLabel: "Quand en avez-vous besoin",
      passengersLabel: "PERSONNES",
      luggageLabel: "BAGAGES",
      fewerPassengers: "Moins de personnes",
      morePassengers: "Plus de personnes",
      fewerLuggage: "Moins de bagages",
      moreLuggage: "Plus de bagages",
      ferryRefLabel: "NUMÉRO DU FERRY OU DU BATEAU",
      flightRefLabel: "NUMÉRO DE VOL",
      ferryRefPlaceholder: "ex. Anna M",
      flightRefPlaceholder: "ex. MK034",
      ferryRefWhy:
        "Votre chauffeur suit le bateau, pour être là quand il accoste — pas une heure trop tôt.",
      flightRefWhy:
        "Votre chauffeur suit le vol, pour être là à votre atterrissage — même en cas de retard.",
      meetGreet: "M’attendre à l’intérieur avec une pancarte",
    },
    price: {
      working: "Calcul du prix…",
      onRequest: "Nous confirmerons le prix avec vous.",
      noCharge: "Rien n’est débité avant votre accord.",
      eyebrow: "VOTRE TARIF",
      unpriced: "Prix sur demande",
      nightRate: "tarif de nuit",
      paidToDriver: "Payé directement à votre chauffeur",
      distance: (km: number) => `environ ${km} km`,
      duration: (min: number) => `~${min} min`,
    },
    cta: {
      back: "Retour",
      continue: "Continuer",
      book: "Trouvez-moi un chauffeur",
    },
    step3: {
      heading: "Presque fini",
      intro:
        "Votre chauffeur a besoin d’un nom et d’un numéro pour vous trouver. Pas de compte, pas de mot de passe.",
      nameLabel: "VOTRE NOM",
      namePlaceholder: "ex. Marie Perrine",
      phoneLabel: "VOTRE TÉLÉPHONE",
      phonePlaceholder: "+230 5XXX XXXX",
      emailLabel: "E-MAIL (FACULTATIF)",
      emailPlaceholder: "vous@exemple.com",
      notesLabel: "À SAVOIR POUR LE CHAUFFEUR (FACULTATIF)",
      notesPlaceholder: "ex. siège bébé, fauteuil roulant, deux arrêts",
      summaryWhenNow: "Dès que possible",
      payNote: "Vous payez le chauffeur directement. Rien n’est débité ici.",
    },
    errors: {
      generic: "Une erreur s’est produite. Veuillez réessayer.",
    },
    done: {
      heading: "Nous cherchons votre chauffeur",
      body: "Pas besoin d’appeler. Un chauffeur acceptera dans les prochaines minutes et vous verrez son nom et son numéro ici.",
      referenceEyebrow: "VOTRE RÉFÉRENCE",
      follow: "Suivre ma course",
      keepReference:
        "Gardez cette référence. Elle et ce numéro de téléphone vous serviront à suivre la course.",
    },
    summary: {
      route: (pickup: string, dropoff: string) => `${pickup} → ${dropoff}`,
      dayHire: (pickup: string) => `${pickup} → chauffeur pour la journée`,
      passengers: (n: number) => (n === 1 ? "1 personne" : `${n} personnes`),
    },
  },
  track: {
    chrome: {
      pageTitle: "Suivre votre course | Roulé Rodrigues",
      header: "Ma course",
    },
    step1: {
      title: "Suivre votre course",
      help: "Votre référence et le numéro de téléphone utilisé pour réserver.",
      refPlaceholder: "RR-4F2A91",
      refLabel: "Votre référence",
      phonePlaceholder: "+230 5XXX XXXX",
      phoneLabel: "Le numéro de téléphone utilisé pour réserver",
    },
    cta: {
      find: "Trouver ma course",
      call: "Appeler",
      whatsapp: "WhatsApp",
      checkAnother: "Suivre une autre course",
      bookAnother: "Réserver une autre course",
    },
    errors: {
      notFound: "Nous n’avons pas trouvé cette course.",
      missingFields:
        "Entrez votre référence et le numéro de téléphone utilisé pour réserver.",
      notFoundFull:
        "Nous n’avons pas trouvé cette course. Vérifiez la référence et le numéro que vous avez utilisé.",
      server: "Une erreur s’est produite. Veuillez réessayer.",
      offline: "Pas de connexion. Vérifiez votre réseau et réessayez.",
    },
    status: {
      new: "Nous avons votre demande",
      dispatching: "Nous cherchons votre chauffeur…",
      assigned: "Chauffeur trouvé",
      driver_on_way: "Votre chauffeur est en route",
      arrived: "Votre chauffeur est arrivé",
      on_trip: "En route vers votre destination",
      completed: "Course terminée",
      cancelled: "Annulée",
      no_driver: "Quelqu’un s’en occupe personnellement",
      searching: {
        round1: "Nous demandons aux chauffeurs près de vous…",
        round2: "Nous continuons dans les environs…",
        round3: "Nous élargissons à toute l’île…",
        round4:
          "Nous y travaillons toujours — nous vous appellerons si besoin.",
      },
    },
    step2: {
      noDriverHelp:
        "Tous les chauffeurs sont pris pour le moment — quelqu’un s’en occupe. Nous vous appellerons.",
      driverEyebrow: "VOTRE CHAUFFEUR",
      steps: {
        requested: "Demande reçue",
        driverFound: "Chauffeur trouvé",
        onTheWay: "En route",
        arrived: "Arrivé",
        onTrip: "En trajet",
        finished: "Terminée",
      },
      rideEyebrow: "VOTRE COURSE",
      payNote: "Payable directement au chauffeur.",
    },
    service: {
      taxi: "Taxi",
      airport: "Transfert aéroport",
      ferry: "Transfert bateau",
      hotel: "Transfert hôtel",
      private: "Chauffeur privé",
    },
    price: {
      onRequest: "Prix sur demande",
    },
  },
};

const CR: RidesCopy = {
  book: {
    chrome: {
      heading: "Rezerv enn kours",
      requiredNote: "= obligatwar, sinon nou pa kapav kalkil ou pri.",
    },
    services: {
      taxi: {
        label: "Taksi",
        blurb: "Enn kours dan zil la",
      },
      airport: {
        label: "Transfer erport",
        blurb: "Ver ouswa depi Plaine Corail",
      },
      ferry: {
        label: "Transfer ferry",
        blurb: "Ver ouswa depi terminal Port Mathurin",
      },
      hotel: {
        label: "Transfer otel",
        blurb: "Ver ouswa depi kot ou reste",
      },
      private: {
        label: "Sofer prive",
        blurb: "Enn sofer pou lazourne, ouswa enn trazet fixe",
      },
    },
    step1: {
      heading: "Ki ou bizin ?",
    },
    step2: {
      directionGroupLabel: "Direksion trazet la",
      direction: {
        fromAirport: "Depi erport",
        toAirport: "Ver erport",
        fromFerry: "Depi ferry",
        toFerry: "Ver ferry",
      },
      fixedEnd: {
        airport: "Erport Plaine Corail",
        ferry: "Terminal ferry Port Mathurin",
      },
      pickupFixedEyebrow: "KOT NOU PRAN OU",
      pickupLabel: "KOT PRAN OU",
      pickupPlaceholder: "Otel, laplaz, vilaz…",
      dropoffFixedEyebrow: "KOT OU PE ALE",
      dropoffLabel: "KOT AMENN OU",
      dropoffPlaceholder: "Kot ou pe ale ?",
      privateHireNote:
        "Ou sofer res ar ou — dir li lor plas kot ou anvi ale. Nou pou konfirm pri-la ar ou — nanye pa debite avan ou dakor.",
      whenNow: "Pli vit posib",
      whenLater: "Rezerv pou pli tar",
      whenFieldLabel: "Kan ou bizin li",
      passengersLabel: "DIMOUNN",
      luggageLabel: "BAGAZ",
      fewerPassengers: "Mwins dimounn",
      morePassengers: "Plis dimounn",
      fewerLuggage: "Mwins bagaz",
      moreLuggage: "Plis bagaz",
      ferryRefLabel: "NIMERO FERRY OUSWA BATO",
      flightRefLabel: "NIMERO VOL",
      ferryRefPlaceholder: "ex. Anna M",
      flightRefPlaceholder: "ex. MK034",
      ferryRefWhy:
        "Ou sofer swiv bato la, pou li la kan bato akoste — pa enn ertan tro boner.",
      flightRefWhy:
        "Ou sofer swiv vol la, pou li la kan ou ateri — mem si ou an retar.",
      meetGreet: "Atann mwa andan ar enn pankart",
    },
    price: {
      working: "Pe kalkil pri la…",
      onRequest: "Nou pou konfirm pri-la ar ou.",
      noCharge: "Nanye pa debite avan ou dakor.",
      eyebrow: "OU PRI",
      unpriced: "Pri lor demann",
      nightRate: "tarif lanwit",
      paidToDriver: "Peye direk ar ou sofer",
      distance: (km: number) => `apepre ${km} km`,
      duration: (min: number) => `~${min} min`,
    },
    cta: {
      back: "Retour",
      continue: "Kontinie",
      book: "Trouv mwa enn sofer",
    },
    step3: {
      heading: "Preske fini",
      intro:
        "Ou sofer bizin enn non ek enn nimero pou trouv ou. Pena kont, pena modpas.",
      nameLabel: "OU NON",
      namePlaceholder: "ex. Marie Perrine",
      phoneLabel: "OU TELEFONN",
      phonePlaceholder: "+230 5XXX XXXX",
      emailLabel: "EMAIL (OPSIONEL)",
      emailPlaceholder: "ou@exemple.com",
      notesLabel: "ENN ZAFER SOFER BIZIN KONE (OPSIONEL)",
      notesPlaceholder: "ex. sez bebe, sez roulan, de aret",
      summaryWhenNow: "Pli vit posib",
      payNote: "Ou peye sofer la direk. Nanye pa debite isi.",
    },
    errors: {
      generic: "Enn zafer finn mal pase. Esey ankor.",
    },
    done: {
      heading: "Nou pe rod ou sofer",
      body: "Pena bizin apel personn. Enn sofer pou aksepte dan bann minit ki vini ek ou pou trouv so non ek so nimero isi.",
      referenceEyebrow: "OU REFERANS",
      follow: "Swiv mo kours",
      keepReference:
        "Gard sa referans la. Ou pou bizin li ek sa nimero telefonn la pou swiv kours la.",
    },
    summary: {
      route: (pickup: string, dropoff: string) => `${pickup} → ${dropoff}`,
      dayHire: (pickup: string) => `${pickup} → sofer pou lazourne`,
      passengers: (n: number) => `${n} dimounn`,
    },
  },
  track: {
    chrome: {
      pageTitle: "Swiv ou kours | Roulé Rodrigues",
      header: "Mo kours",
    },
    step1: {
      title: "Swiv ou kours",
      help: "Ou referans ek nimero telefonn ki ou finn servi pou rezerve.",
      refPlaceholder: "RR-4F2A91",
      refLabel: "Ou referans",
      phonePlaceholder: "+230 5XXX XXXX",
      phoneLabel: "Nimero telefonn ki ou finn servi pou rezerve",
    },
    cta: {
      find: "Trouv mo kours",
      call: "Apele",
      whatsapp: "WhatsApp",
      checkAnother: "Swiv enn lot kours",
      bookAnother: "Rezerv enn lot kours",
    },
    errors: {
      notFound: "Nou pa finn trouv sa kours la.",
      missingFields:
        "Met ou referans ek nimero telefonn ki ou finn servi pou rezerve.",
      notFoundFull:
        "Nou pa finn trouv sa kours la. Verifie referans ek nimero ki ou finn servi.",
      server: "Enn zafer finn mal pase. Esey ankor.",
      offline: "Pa ena koneksion. Verifie ou koneksion ek esey ankor.",
    },
    status: {
      new: "Nou finn gagn ou demann",
      dispatching: "Nou pe rod ou sofer…",
      assigned: "Sofer trouve",
      driver_on_way: "Ou sofer pe vini",
      arrived: "Ou sofer finn arive",
      on_trip: "Lor sime ver ou destinasion",
      completed: "Trazet fini",
      cancelled: "Anile",
      no_driver: "Enn dimounn pe arranz sa pou ou",
      searching: {
        round1: "Nou pe demann bann sofer pre kot ou…",
        round2: "Nou pe touzour rode dan zonn la…",
        round3: "Nou pe rod bann sofer partou lor zil la…",
        round4: "Nou pe touzour lor la — nou pou apel ou si bizin.",
      },
    },
    step2: {
      noDriverHelp:
        "Tou bann sofer okipe la — enn dimounn pe arranz sa. Nou pou apel ou.",
      driverEyebrow: "OU SOFER",
      steps: {
        requested: "Demann resevwar",
        driverFound: "Sofer trouve",
        onTheWay: "Lor sime",
        arrived: "Finn arive",
        onTrip: "Dan trazet",
        finished: "Fini",
      },
      rideEyebrow: "OU KOURS",
      payNote: "Peye direk ar ou sofer.",
    },
    service: {
      taxi: "Taksi",
      airport: "Transfer erport",
      ferry: "Transfer bato",
      hotel: "Transfer otel",
      private: "Sofer prive",
    },
    price: {
      onRequest: "Pri lor demann",
    },
  },
};

export const RIDES_COPY: Record<Language, RidesCopy> = {
  en: EN,
  fr: FR,
  cr: CR,
};
