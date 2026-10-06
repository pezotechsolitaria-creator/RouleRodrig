// ── The words of the cars & scooters surfaces: cards, sheet, vehicle page ───
//
// English, French and Kreol in one place, so the three stay in parity by
// construction (lib/rentals/copy.test.ts). No exclamation marks, no emoji, no
// "estimated", no "request": a selected range has ONE price, and the button
// reserves. Kreol is this repo's "cr".

export type RentLang = "en" | "fr" | "cr";

export const rentLang = (l: string): RentLang => (l === "fr" || l === "cr" ? l : "en");

/** Intl locale for dates and month names. Kreol readers read French dates. */
export const DATE_LOCALE: Record<RentLang, string> = { en: "en-GB", fr: "fr-FR", cr: "fr-FR" };

type Copy = {
  reserve: string;
  selectDates: string;
  tapHint: string;
  tapReturnHint: string;
  dates: string;
  vehicle: string;
  change: string;
  done: string;
  clear: string;
  total: string;
  dueNow: (pct: number) => string;
  /** The same, without the percentage: the summary bar has one line for it. */
  dueNowShort: string;
  dueAtPickup: string;
  holdAtPickup: string;
  holdNote: string;
  delivery: string;
  included: string;
  deliveryIncluded: string;
  perDay: string;
  days: (n: number) => string;
  rentalLine: (noun: string, days: number, rate: string) => string;
  scooterNoun: string;
  carNoun: string;
  scooterSub: string;
  cars: string;
  scooters: string;
  details: string;
  yourDetails: string;
  pickupTime: string;
  returnTime: string;
  name: string;
  namePh: string;
  email: string;
  phone: string;
  phonePh: string;
  message: string;
  messagePh: string;
  messagePhCar: string;
  referral: string;
  referralPh: string;
  referralHint: string;
  referredBy: (code: string) => string;
  payInPerson: string;
  payInPersonNote: string;
  agree: string;
  agreeLink: string;
  payments: string;
  messageUs: string;
  close: string;
  back: string;
  sending: string;
  unavailable: string;
  available: string;
  selected: string;
  today: string;
  prevMonth: string;
  nextMonth: string;
  outToday: string;
  withdrawn: string;
  stillToDo: string;
  err: {
    vehicle: string;
    date: string;
    overlap: string;
    name: string;
    email: string;
    phone: string;
    agree: string;
    failed: string;
  };
  datesHeld: string;
  datesHeldBody: string;
  datesHeldCash: string;
  paidTitle: string;
  paidBody: string;
  receipt: string;
  trust: [string, string, string, string];
  rateTable: string;
  rateTableNote: string;
  oneWeek: string;
  whatsIncluded: string;
  tripPrefill: (n: number) => string;
  /** The scooter list's third row: "3 days or more". */
  threePlus: string;
  /** One more day on a 1- or 2-day scooter rental: what it adds, and the new total. */
  addDayLine: (extra: string, days: number, total: string) => string;
  addDay: string;
};

export const RENT_COPY: Record<RentLang, Copy> = {
  en: {
    reserve: "Reserve",
    selectDates: "Select dates",
    tapHint: "Tap pickup, then return.",
    tapReturnHint: "Tap another day to set the return.",
    dates: "Dates",
    vehicle: "Vehicle",
    change: "Change",
    done: "Done",
    clear: "Clear",
    total: "Total",
    dueNow: (p) => `Due now (${p}%)`,
    dueNowShort: "Due now",
    dueAtPickup: "Due at pickup",
    holdAtPickup: "Hold at pickup",
    holdNote: "Returned when you bring the car back. Not part of the price.",
    delivery: "Delivery",
    included: "Included",
    deliveryIncluded: "Delivery included",
    perDay: "/ day",
    days: (n) => (n === 1 ? "1 day" : `${n} days`),
    rentalLine: (noun, d, rate) => `${noun} · ${d === 1 ? "1 day" : `${d} days`} × ${rate}`,
    scooterNoun: "Scooter",
    carNoun: "Car",
    scooterSub: "3 days or more · delivery included",
    cars: "Cars",
    scooters: "Scooters",
    details: "Details",
    yourDetails: "Your details",
    pickupTime: "Pickup time",
    returnTime: "Return time",
    name: "Name",
    namePh: "Your full name",
    email: "Email",
    phone: "Phone",
    phonePh: "5 123 4567",
    message: "Anything we should know",
    messagePh: "Where you are staying, a second helmet size…",
    messagePhCar: "Where you are staying, a child seat…",
    referral: "Referral code",
    referralPh: "e.g. HOTEL-PARADIS",
    referralHint: "From your hotel or guest house, if they gave you one.",
    referredBy: (c) => `Referred by ${c}`,
    payInPerson: "I'd rather pay in cash at pickup",
    payInPersonNote: "Only if we agree it with you — we will tell you after you reserve.",
    agree: "I accept the",
    agreeLink: "rental terms",
    payments: "After you reserve: bank transfer, MCB Juice, PayPal, or cash in person when agreed.",
    messageUs: "Message us",
    close: "Close",
    back: "Back",
    sending: "Reserving…",
    unavailable: "Unavailable",
    available: "Available",
    selected: "Selected",
    today: "Today",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    outToday: "Out today · other dates open",
    withdrawn: "Not available to rent at the moment",
    stillToDo: "Still to do:",
    err: {
      vehicle: "Choose a vehicle.",
      date: "Choose your dates.",
      overlap: "Those dates are taken — choose another range.",
      name: "Enter your name.",
      email: "Enter a valid email address.",
      phone: "Enter a valid phone number.",
      agree: "Accept the rental terms to continue.",
      failed: "We could not reserve this. Please try again, or message us.",
    },
    datesHeld: "Dates held",
    datesHeldBody: "We confirm availability, then you pay the amount due now.",
    datesHeldCash: "We confirm availability and tell you whether cash at pickup is fine.",
    paidTitle: "Paid — you're booked",
    paidBody: "See you on the day. The rest is due at pickup.",
    receipt: "Download receipt",
    trust: ["Insured", "Delivered to your stay", "No mileage cap", "WhatsApp if you need us"],
    rateTable: "Prices",
    rateTableNote: "Per day, delivery included.",
    oneWeek: "1 week",
    whatsIncluded: "What's included",
    tripPrefill: (n) => `Dates set for your ${n}-day trip — change them if you like.`,
    threePlus: "3 days or more",
    addDayLine: (extra, d, total) => `One more day costs ${extra}: ${d} days for ${total}.`,
    addDay: "Add a day",
  },
  fr: {
    reserve: "Réserver",
    selectDates: "Choisir les dates",
    tapHint: "Touchez le retrait, puis le retour.",
    tapReturnHint: "Touchez un autre jour pour le retour.",
    dates: "Dates",
    vehicle: "Véhicule",
    change: "Changer",
    done: "OK",
    clear: "Effacer",
    total: "Total",
    dueNow: (p) => `À payer maintenant (${p} %)`,
    dueNowShort: "À payer maintenant",
    dueAtPickup: "Au retrait",
    holdAtPickup: "Caution au retrait",
    holdNote: "Rendue au retour de la voiture. Elle ne fait pas partie du prix.",
    delivery: "Livraison",
    included: "Incluse",
    deliveryIncluded: "Livraison incluse",
    perDay: "/ jour",
    days: (n) => (n === 1 ? "1 jour" : `${n} jours`),
    rentalLine: (noun, d, rate) => `${noun} · ${d === 1 ? "1 jour" : `${d} jours`} × ${rate}`,
    scooterNoun: "Scooter",
    carNoun: "Voiture",
    scooterSub: "3 jours ou plus · livraison incluse",
    cars: "Voitures",
    scooters: "Scooters",
    details: "Détails",
    yourDetails: "Vos coordonnées",
    pickupTime: "Heure de retrait",
    returnTime: "Heure de retour",
    name: "Nom",
    namePh: "Votre nom complet",
    email: "E-mail",
    phone: "Téléphone",
    phonePh: "5 123 4567",
    message: "Quelque chose à nous dire",
    messagePh: "Votre hébergement, la taille d'un second casque…",
    messagePhCar: "Votre hébergement, un siège enfant…",
    referral: "Code de parrainage",
    referralPh: "ex. HOTEL-PARADIS",
    referralHint: "De votre hôtel ou maison d'hôtes, s'ils vous en ont donné un.",
    referredBy: (c) => `Recommandé par ${c}`,
    payInPerson: "Je préfère payer en espèces au retrait",
    payInPersonNote: "Seulement si nous en convenons — nous vous le dirons après la réservation.",
    agree: "J'accepte les",
    agreeLink: "conditions de location",
    payments: "Après la réservation : virement, MCB Juice, PayPal, ou espèces en personne si convenu.",
    messageUs: "Écrivez-nous",
    close: "Fermer",
    back: "Retour",
    sending: "Réservation…",
    unavailable: "Indisponible",
    available: "Disponible",
    selected: "Sélectionné",
    today: "Aujourd'hui",
    prevMonth: "Mois précédent",
    nextMonth: "Mois suivant",
    outToday: "Loué aujourd'hui · autres dates libres",
    withdrawn: "Pas disponible à la location pour le moment",
    stillToDo: "Il reste à faire :",
    err: {
      vehicle: "Choisissez un véhicule.",
      date: "Choisissez vos dates.",
      overlap: "Ces dates sont prises — choisissez une autre période.",
      name: "Indiquez votre nom.",
      email: "Indiquez une adresse e-mail valide.",
      phone: "Indiquez un numéro de téléphone valide.",
      agree: "Acceptez les conditions de location pour continuer.",
      failed: "La réservation n'a pas abouti. Réessayez ou écrivez-nous.",
    },
    datesHeld: "Dates bloquées",
    datesHeldBody: "Nous confirmons la disponibilité, puis vous réglez le montant à payer maintenant.",
    datesHeldCash: "Nous confirmons la disponibilité et vous disons si le paiement en espèces convient.",
    paidTitle: "Payé — c'est réservé",
    paidBody: "À bientôt. Le reste se règle au retrait.",
    receipt: "Télécharger le reçu",
    trust: ["Assuré", "Livré à votre hébergement", "Kilométrage illimité", "WhatsApp si besoin"],
    rateTable: "Tarifs",
    rateTableNote: "Par jour, livraison incluse.",
    oneWeek: "1 semaine",
    whatsIncluded: "Ce qui est inclus",
    tripPrefill: (n) => `Dates réglées pour votre séjour de ${n} jours — modifiez-les si besoin.`,
    threePlus: "3 jours ou plus",
    addDayLine: (extra, d, total) => `Un jour de plus coûte ${extra} : ${d} jours pour ${total}.`,
    addDay: "Ajouter un jour",
  },
  cr: {
    reserve: "Rezerve",
    selectDates: "Swazir bann dat",
    tapHint: "Tap zour retre, apre zour retour.",
    tapReturnHint: "Tap enn lot zour pou retour.",
    dates: "Bann dat",
    vehicle: "Veikil",
    change: "Sanze",
    done: "OK",
    clear: "Efase",
    total: "Total",
    dueNow: (p) => `Pou pey aster (${p}%)`,
    dueNowShort: "Pou pey aster",
    dueAtPickup: "Kan ou pran li",
    holdAtPickup: "Garanti kan ou pran li",
    holdNote: "Nou rann li kan ou ramenn loto la. Li pa form parti pri la.",
    delivery: "Livrezon",
    included: "Inkli",
    deliveryIncluded: "Livrezon inkli",
    perDay: "/ zour",
    days: (n) => (n === 1 ? "1 zour" : `${n} zour`),
    rentalLine: (noun, d, rate) => `${noun} · ${d === 1 ? "1 zour" : `${d} zour`} × ${rate}`,
    scooterNoun: "Skooter",
    carNoun: "Loto",
    scooterSub: "3 zour ou plis · livrezon inkli",
    cars: "Loto",
    scooters: "Skooter",
    details: "Detay",
    yourDetails: "Ou detay",
    pickupTime: "Ler retre",
    returnTime: "Ler retour",
    name: "Nom",
    namePh: "Ou nom konple",
    email: "Email",
    phone: "Telefonn",
    phonePh: "5 123 4567",
    message: "Kitsoz pou nou kone",
    messagePh: "Kot ou reste, gran kask pou dezyem dimounn…",
    messagePhCar: "Kot ou reste, enn sez zanfan…",
    referral: "Kod referans",
    referralPh: "ex. HOTEL-PARADIS",
    referralHint: "Depi ou lotel ou pansion, si zot inn donn ou enn.",
    referredBy: (c) => `Referans ${c}`,
    payInPerson: "Mo prefer pey kas kan mo pran li",
    payInPersonNote: "Zis si nou dakor — nou pou dir ou apre ou rezerve.",
    agree: "Mo aksepte",
    agreeLink: "kondision lokasion",
    payments: "Apre ou rezerve: virman, MCB Juice, PayPal, ouswa kas an personn si dakor.",
    messageUs: "Ekrir nou",
    close: "Ferm",
    back: "Retour",
    sending: "Pe rezerve…",
    unavailable: "Pa disponib",
    available: "Disponib",
    selected: "Swazir",
    today: "Zordi",
    prevMonth: "Mwa avan",
    nextMonth: "Mwa apre",
    outToday: "Loue zordi · lezot dat disponib",
    withdrawn: "Pa disponib pou loue pou lemoman",
    stillToDo: "Ankor bizin:",
    err: {
      vehicle: "Swazir enn veikil.",
      date: "Swazir ou bann dat.",
      overlap: "Sa bann dat la fini pran — swazir enn lot peryod.",
      name: "Met ou nom.",
      email: "Met enn adres email valab.",
      phone: "Met enn nimero telefonn valab.",
      agree: "Aksepte kondision lokasion pou kontinie.",
      failed: "Rezervasion la pa finn pase. Seye ankor ouswa ekrir nou.",
    },
    datesHeld: "Bann dat bloke",
    datesHeldBody: "Nou konfirm si li disponib, apre ou pey montan pou pey aster.",
    datesHeldCash: "Nou konfirm si li disponib ek nou dir ou si kas kan ou pran li korek.",
    paidTitle: "Pey — ou finn rezerve",
    paidBody: "Ziska talerla. Reste la ou pey kan ou pran li.",
    receipt: "Telesarz resi",
    trust: ["Asire", "Livre kot ou reste", "Pena limit kilometraz", "WhatsApp si ou bizin"],
    rateTable: "Pri",
    rateTableNote: "Par zour, livrezon inkli.",
    oneWeek: "1 semenn",
    whatsIncluded: "Seki inkli",
    tripPrefill: (n) => `Bann dat pare pou ou vwayaz ${n} zour — sanz zot si ou anvi.`,
    threePlus: "3 zour ek plis",
    addDayLine: (extra, d, total) => `Enn zour anplis kout ${extra} : ${d} zour pou ${total}.`,
    addDay: "Azout enn zour",
  },
};

/** "Rs 1,899" — the site's one money format, tabular in the UI. */
export function rs(n: number | null | undefined, lang: RentLang = "en"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // French groups thousands with a narrow no-break space ("Rs 1 899"), as the
  // /fr pages do; Kreol keeps "Rs 1,899", the way prices are written on the
  // island. lib/currency convertPrice reads both.
  return `Rs ${Math.round(n).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}`;
}
