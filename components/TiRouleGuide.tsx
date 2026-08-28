"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Send,
  Compass,
  UtensilsCrossed,
  Waves,
  Mountain,
  Bike,
  Footprints,
  Car,
  Languages,
  Volume2,
  Square,
  Wallet,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/lib/i18n";
import { resolvePose } from "@/lib/mascot";
import { loc } from "@/lib/localize";
import {
  matchKnowledge,
  type KnowledgeCta,
  type KnowledgeEntry,
} from "@/lib/rodrigues-knowledge";
import { tirouleOpened, tirouleQuestionAsked } from "@/lib/analytics/flows";
import {
  parseCurrencyQuery,
  estimateConvert,
  formatConversion,
} from "@/lib/currency-convert";
import { speakText, stopSpeaking, primeVoices } from "@/lib/speak";

/**
 * Ti Roulé — the Roule Rodrigues mascot as an animated island-guide chat.
 * He greets, "types", swaps expression pose-by-pose, answers common questions
 * from the site's own island data, and routes people into the real tools.
 *
 * "Costless text superpowers": visitors can also TYPE anything — a local,
 * multilingual intent matcher (matchIntent) maps free text to the right answer
 * with zero LLM/API cost, so there's nothing to bill and nothing to hallucinate.
 * Renders nothing until at least one mascot image is uploaded in admin.
 */

type LocName = { name: string; nameFr?: string; nameCr?: string };
export type MascotData = { beaches: LocName[]; viewpoints: LocName[] };

type TopicKey =
  | "plan"
  | "eat"
  | "beaches"
  | "viewpoints"
  | "rent"
  | "hike"
  | "taxi"
  | "creole";
type SpecialKey = "hello" | "thanks" | "help" | "contact" | "weather";
type IntentKey = TopicKey | SpecialKey;
type Answer = {
  text: string;
  pose: string;
  cta?: { label: string; href: string };
};
type Msg =
  | {
      id: number;
      who: "bot";
      text: string;
      pose?: string;
      cta?: { label: string; href: string };
    }
  | { id: number; who: "user"; text: string };

const TOPIC_ICON: Record<TopicKey, typeof Compass> = {
  plan: Compass,
  eat: UtensilsCrossed,
  beaches: Waves,
  viewpoints: Mountain,
  rent: Bike,
  hike: Footprints,
  taxi: Car,
  creole: Languages,
};
const TOPIC_ORDER: TopicKey[] = [
  "plan",
  "eat",
  "beaches",
  "viewpoints",
  "rent",
  "hike",
  "taxi",
  "creole",
];

const CREOLE: { p: string; en: string; fr: string }[] = [
  { p: "Bonzur!", en: "Hello / good day", fr: "Bonjour" },
  { p: "Koman ou lé?", en: "How are you?", fr: "Comment ça va ?" },
  { p: "Mo byen, mersi", en: "I'm well, thank you", fr: "Je vais bien, merci" },
  { p: "Kot sa été?", en: "Where is it?", fr: "Où est-ce ?" },
  { p: "Mersi boukou", en: "Thank you very much", fr: "Merci beaucoup" },
  { p: "Zoli sa!", en: "That's beautiful!", fr: "C'est magnifique !" },
  { p: "Ale dousman", en: "Take it easy / drive safe", fr: "Vas-y doucement" },
];

// Multilingual keyword → intent. Order matters (first match wins). Keywords are
// accent-stripped and lower-cased before comparison (see normalize()).
const INTENTS: { key: IntentKey; kw: string[] }[] = [
  {
    key: "thanks",
    kw: ["thank", "thanks", "thx", "merci", "mersi", "gramersi"],
  },
  {
    key: "hello",
    kw: [
      "hello",
      "hi",
      "hey",
      "yo",
      "bonjour",
      "bonzur",
      "bonzour",
      "salut",
      "koman ou le",
      "good morning",
      "good evening",
      "good afternoon",
    ],
  },
  {
    key: "help",
    kw: [
      "help",
      "what can you do",
      "what do you do",
      "who are you",
      "aide",
      "aider",
      "ki ou kapav",
      "options",
      "menu",
    ],
  },
  {
    key: "plan",
    kw: [
      "plan",
      "itinerary",
      "itineraire",
      "schedule",
      "program",
      "days",
      "day trip",
      "what to do",
      "things to do",
      "quoi faire",
      "ki pou fer",
      "organise",
      "organize",
      "3 days",
      "week",
    ],
  },
  {
    key: "eat",
    kw: [
      "eat",
      "food",
      "restaurant",
      "resto",
      "hungry",
      "dinner",
      "lunch",
      "breakfast",
      "manger",
      "manze",
      "table",
      "cuisine",
      "snack",
      "drink",
      "bar",
      "cafe",
      "coffee",
      "seafood",
    ],
  },
  {
    key: "beaches",
    kw: [
      "beach",
      "beaches",
      "plage",
      "laplaz",
      "swim",
      "swimming",
      "lagoon",
      "lagon",
      "sand",
      "snorkel",
      "snorkeling",
      "baignade",
      "naze",
      "sea",
      "mer",
      "lamer",
      "island guide",
      "kayak",
    ],
  },
  {
    key: "viewpoints",
    kw: [
      "view",
      "viewpoint",
      "viewpoints",
      "vue",
      "point de vue",
      "pwin vi",
      "panorama",
      "scenic",
      "scenery",
      "photo spot",
      "sunset",
      "coucher",
      "landscape",
      "paysage",
      "lookout",
    ],
  },
  {
    key: "rent",
    kw: [
      "rent",
      "rental",
      "hire",
      "scooter",
      "scoot",
      "moto",
      "motorbike",
      "bike",
      "car",
      "cars",
      "voiture",
      "loue",
      "louer",
      "loto",
      "veikil",
      "vehicle",
      "price",
      "prices",
      "cost",
      "how much",
      "prix",
      "combien",
      "konbien",
      "tarif",
      "rate",
      "rates",
      "booking",
      "reserve",
    ],
  },
  {
    key: "hike",
    kw: [
      "hike",
      "hiking",
      "trail",
      "trails",
      "trek",
      "trekking",
      "walk",
      "walking",
      "randonnee",
      "rando",
      "marche",
      "santie",
      "mountain",
      "montagne",
    ],
  },
  {
    key: "taxi",
    kw: [
      "taxi",
      "cab",
      "driver",
      "chauffeur",
      "sofer",
      "lift",
      "transport",
      "transpor",
      "transfer",
      "pickup",
      "pick up",
      "airport",
      "aeroport",
    ],
  },
  {
    key: "creole",
    kw: [
      "creole",
      "kreol",
      "language",
      "langue",
      "word",
      "phrase",
      "speak",
      "parler",
      "aprann",
      "translate",
      "traduire",
    ],
  },
  {
    key: "contact",
    kw: [
      "contact",
      "phone",
      "call",
      "whatsapp",
      "number",
      "numero",
      "telephone",
      "tel",
      "email",
      "reach",
      "message",
      "hours",
      "open",
      "opening",
      "heures",
      "horaires",
      "ouvert",
      "address",
      "adresse",
      "location",
    ],
  },
  {
    key: "weather",
    kw: [
      "weather",
      "forecast",
      "rain",
      "raining",
      "meteo",
      "temps",
      "pluie",
      "lapli",
      "climate",
      "climat",
      "windy",
      "cyclone",
    ],
  },
];

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "") // strip accents in place so "métro" → "metro"
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build a wa.me link for the "talk to a human" escalation. Returns null for a
// missing or placeholder (5XXX) number so we can fall back to the contact page.
function waLink(raw: string | undefined, message: string): string | null {
  if (!raw) return null;
  if (!raw.includes("http") && /x/i.test(raw)) return null;
  let href: string;
  if (raw.includes("http")) {
    href = raw;
  } else {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return null;
    href = `https://wa.me/${digits}`;
  }
  return href.includes("?")
    ? href
    : `${href}?text=${encodeURIComponent(message)}`;
}

// Live rates with a browser cache: instant on repeat, and still works offline
// (falls back to the last saved rates, labelled with their date).
async function getRatesCached(): Promise<{
  rates: Record<string, number>;
  updated: string | null;
} | null> {
  const KEY = "rr_rates_v1";
  const now = Date.now();
  const read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.rates)
          return c as {
            rates: Record<string, number>;
            updated: string | null;
            cachedAt: number;
          };
      }
    } catch {
      /* ignore */
    }
    return null;
  };
  const cached = read();
  if (cached?.cachedAt && now - cached.cachedAt < 6 * 3600 * 1000)
    return { rates: cached.rates, updated: cached.updated };
  try {
    const res = await fetch("/api/rates");
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        try {
          localStorage.setItem(
            KEY,
            JSON.stringify({
              rates: data.rates,
              updated: data.updated ?? null,
              cachedAt: now,
            }),
          );
        } catch {
          /* ignore */
        }
        return { rates: data.rates, updated: data.updated ?? null };
      }
    }
  } catch {
    /* ignore */
  }
  return cached?.rates
    ? { rates: cached.rates, updated: cached.updated }
    : null;
}

// A budget question = a money amount + a number of days ("€500 for 4 days").
function parseBudget(
  text: string,
): {
  cur: NonNullable<ReturnType<typeof parseCurrencyQuery>>;
  days: number;
} | null {
  const dm = text.match(/(\d+)\s*(?:days?|jours?|zour|nights?|nuits?)/i);
  if (!dm) return null;
  const days = parseInt(dm[1], 10);
  if (!days || days < 1 || days > 60) return null;
  const cur = parseCurrencyQuery(text.replace(dm[0], " "));
  if (!cur) return null;
  return { cur, days };
}

function matchIntent(text: string): IntentKey | null {
  const norm = normalize(text);
  if (!norm) return null;
  const tokens = new Set(norm.split(" "));
  for (const intent of INTENTS) {
    for (const kwRaw of intent.kw) {
      const kw = normalize(kwRaw);
      if (kw.includes(" ")) {
        if (norm.includes(kw)) return intent.key;
      } else if (kw.length < 4) {
        if (tokens.has(kw)) return intent.key; // short words need an exact token
      } else if (tokens.has(kw) || norm.includes(kw)) {
        return intent.key;
      }
    }
  }
  return null;
}

type Copy = {
  role: string;
  online: string;
  bubble: string;
  open: string;
  close: string;
  greet: string;
  placeholder: string;
  send: string;
  topics: Record<TopicKey, string>;
  plan: string;
  planCta: string;
  eat: string;
  eatCta: string;
  beachesLead: string;
  viewpointsLead: string;
  mapCta: string;
  guideFallback: string;
  rent: string;
  rentCta: string;
  hike: string;
  hikeCta: string;
  taxi: string;
  taxiCta: string;
  creoleLead: string;
  means: string;
  hello: string;
  thanks: string;
  help: string;
  contact: string;
  contactCta: string;
  weather: string;
  fallback: string;
  waCta: string;
  waPrefill: string;
  openMap: string;
  curError: string;
  budgetChip: string;
  budgetPrompt: string;
  budgetDay: string;
  budgetScooter: string;
  budgetRest: string;
  budgetCta: string;
  curChip: string;
  curPrompt: string;
};

// Proactive seasonal tip, based on the visitor's current month (client-side).
function seasonNote(lang: Language): string {
  const m = new Date().getMonth() + 1; // 1–12
  const pick = (en: string, fr: string, cr: string) =>
    lang === "fr" ? fr : lang === "cr" ? cr : en;
  if (m >= 6 && m <= 9)
    return pick(
      "🪁 It's windy season right now — perfect for kitesurfing and windsurfing!",
      "🪁 C'est la saison du vent en ce moment — parfait pour le kitesurf et la planche à voile !",
      "🪁 Se sezon divan la — top pou kitesurf ek windsurf!",
    );
  if (m >= 12 || m <= 3)
    return pick(
      "🌴 It's the warm, greener season — just keep an eye on the forecast during the cyclone months.",
      "🌴 C'est la saison chaude et verdoyante — surveillez simplement la météo pendant la période cyclonique.",
      "🌴 Se sezon so ek pli ver — zis get meteo pandan bann mwa siklonn.",
    );
  return pick(
    "☀️ Lovely time to visit — cooler, drier and calm seas.",
    "☀️ Belle période pour visiter — plus frais, sec et mer calme.",
    "☀️ Zoli moman pou vizite — pli fre, sek ek lamer kalm.",
  );
}

const COPY: Record<Language, Copy> = {
  en: {
    role: "Island guide",
    online: "online",
    bubble: "Koman ou lé?",
    open: "Chat with Ti Roulé",
    close: "Close chat",
    greet:
      "Bonzur! 👋 I'm Ti Roulé, your Rodrigues guide. Ask me anything, or tap a topic below.",
    placeholder: "Ask me anything…",
    send: "Send",
    topics: {
      plan: "Plan my trip",
      eat: "Where should I eat?",
      beaches: "Best beaches",
      viewpoints: "Best viewpoints",
      rent: "Rent a scooter or car",
      hike: "Hiking trails",
      taxi: "Find a taxi",
      creole: "Teach me a Creole word",
    },
    plan: "Tell me what you love and I'll build a day-by-day island route in seconds — beaches, food, viewpoints, the lot.",
    planCta: "Open the trip planner",
    eat: "Hungry? Our food concierge finds you the right table and sorts it all on WhatsApp — no endless searching.",
    eatCta: "Ask the food concierge",
    beachesLead: "Rodrigues has stunning beaches. Try these:",
    viewpointsLead: "For the best views on the island, head to:",
    mapCta: "See them on the map",
    guideFallback: "Explore every beach and viewpoint in the island guide.",
    rent: "Scooter to feel the breeze, or a car for the family — pick your dates and you'll see live prices for each one.",
    rentCta: "Browse the vehicles",
    hike: "Lace up! Rodrigues has gorgeous trails with big ocean views.",
    hikeCta: "See the trails",
    taxi: "Need a lift? I'll connect you with trusted local drivers.",
    taxiCta: "Find a taxi",
    creoleLead: "Here's a Creole word to sound like a local:",
    means: "means",
    hello:
      "Bonzur! 😄 Lovely to see you. What are you dreaming of — beaches, food, a scooter, a plan for the day?",
    thanks: "Anytime — mo la pou ou! 🐢 Anything else I can help with?",
    help: "I'm your island guide 🗺️ I can plan your trip, find you food, suggest beaches and viewpoints, sort a scooter or car, point you to trails and taxis, convert money & size your budget 💱, and even teach you Creole. What would you like?",
    contact:
      "Happy to connect you with the Roule Rodrigues team — they'll sort you out personally.",
    contactCta: "Contact the team",
    weather:
      "Rodrigues stays warm and breezy most of the year 🌴. Check your weather app for today's forecast — and if it rains, the food concierge and island spots make great backups.",
    fallback:
      "Hmm, I didn't quite catch that one 🤔 — I'm best with trips, food, beaches, viewpoints, rentals, trails and taxis. Tap a topic below, or let a real person help:",
    waCta: "Chat with a human on WhatsApp",
    waPrefill: "Hi! I have a question about visiting Rodrigues 🐢",
    openMap: "See it on Google Maps",
    curError:
      "I couldn't fetch the exchange rate just now 🤔 — please try again in a moment.",
    budgetChip: "Plan by budget",
    budgetPrompt:
      "Tell me your budget and how many days and I'll do the maths — e.g. “€500 for 4 days” 💰",
    budgetDay: "a day",
    budgetScooter:
      "A scooter for {days} days is about Rs {total} (from Rs {price}/day)",
    budgetRest:
      ", leaving roughly Rs {rest} for food, fuel and activities — comfortable! 👍",
    budgetCta: "Plan my days",
    curChip: "Convert money",
    curPrompt:
      "I'm your pocket currency converter too 💱 Type any amount and I'll give you the live rate — e.g. “100 EUR”, “50 GBP to MUR” or “2500 MUR to USD”.",
  },
  fr: {
    role: "Guide de l'île",
    online: "en ligne",
    bubble: "Koman ou lé ?",
    open: "Discuter avec Ti Roulé",
    close: "Fermer le chat",
    greet:
      "Bonzur ! 👋 Moi c'est Ti Roulé, votre guide de Rodrigues. Demandez-moi ce que vous voulez, ou choisissez un sujet.",
    placeholder: "Demandez-moi…",
    send: "Envoyer",
    topics: {
      plan: "Planifier mon séjour",
      eat: "Où manger ?",
      beaches: "Plus belles plages",
      viewpoints: "Plus beaux points de vue",
      rent: "Louer un scooter ou une voiture",
      hike: "Sentiers de randonnée",
      taxi: "Trouver un taxi",
      creole: "Apprends-moi un mot créole",
    },
    plan: "Dites-moi ce que vous aimez et je crée un itinéraire jour par jour en quelques secondes — plages, restos, points de vue, tout.",
    planCta: "Ouvrir le planificateur",
    eat: "Faim ? Notre concierge culinaire vous trouve la bonne table et gère tout sur WhatsApp — sans recherches interminables.",
    eatCta: "Demander au concierge",
    beachesLead: "Rodrigues a des plages magnifiques. Essayez :",
    viewpointsLead: "Pour les plus belles vues de l'île, rendez-vous à :",
    mapCta: "Voir sur la carte",
    guideFallback:
      "Découvrez toutes les plages et points de vue dans le guide de l'île.",
    rent: "Un scooter pour sentir la brise, ou une voiture pour la famille — choisissez vos dates et vous verrez les prix en direct.",
    rentCta: "Voir les véhicules",
    hike: "En route ! Rodrigues a de superbes sentiers avec vue sur l'océan.",
    hikeCta: "Voir les sentiers",
    taxi: "Besoin d'un transport ? Je vous mets en relation avec des chauffeurs locaux de confiance.",
    taxiCta: "Trouver un taxi",
    creoleLead: "Voici un mot créole pour parler comme un local :",
    means: "veut dire",
    hello:
      "Bonzur ! 😄 Ravi de vous voir. De quoi rêvez-vous — plages, restos, un scooter, un programme pour la journée ?",
    thanks:
      "Avec plaisir — mo la pou ou ! 🐢 Puis-je vous aider avec autre chose ?",
    help: "Je suis votre guide de l'île 🗺️ Je peux planifier votre séjour, vous trouver un resto, suggérer plages et points de vue, réserver un scooter ou une voiture, indiquer sentiers et taxis, convertir vos devises & calculer votre budget 💱, et même vous apprendre le créole. Que souhaitez-vous ?",
    contact:
      "Je vous mets volontiers en relation avec l'équipe Roule Rodrigues — ils s'occuperont de vous personnellement.",
    contactCta: "Contacter l'équipe",
    weather:
      "Rodrigues reste chaude et venteuse presque toute l'année 🌴. Consultez votre app météo pour aujourd'hui — et s'il pleut, le concierge culinaire et les sites de l'île sont de bonnes options.",
    fallback:
      "Hmm, je n'ai pas bien saisi 🤔 — je suis meilleur pour les séjours, la nourriture, les plages, les points de vue, la location, les sentiers et les taxis. Choisissez un sujet, ou parlez à une vraie personne :",
    waCta: "Parler à un humain sur WhatsApp",
    waPrefill: "Bonjour ! J'ai une question sur Rodrigues 🐢",
    openMap: "Voir sur Google Maps",
    curError:
      "Je n'ai pas pu récupérer le taux de change à l'instant 🤔 — réessayez dans un moment.",
    budgetChip: "Planifier par budget",
    budgetPrompt:
      "Dites-moi votre budget et le nombre de jours et je fais le calcul — ex. « 500 € pour 4 jours » 💰",
    budgetDay: "par jour",
    budgetScooter:
      "Un scooter pour {days} jours coûte environ Rs {total} (à partir de Rs {price}/jour)",
    budgetRest:
      ", il vous reste environ Rs {rest} pour la nourriture, l'essence et les activités — confortable ! 👍",
    budgetCta: "Planifier mes journées",
    curChip: "Convertir une devise",
    curPrompt:
      "Je suis aussi votre convertisseur de poche 💱 Tapez un montant et je vous donne le taux en direct — ex. « 100 EUR », « 50 GBP to MUR » ou « 2500 MUR to USD ».",
  },
  cr: {
    role: "Gid lil",
    online: "online",
    bubble: "Koman ou lé?",
    open: "Koz ek Ti Roulé",
    close: "Ferm chat la",
    greet:
      "Bonzur! 👋 Mo Ti Roulé, ou gid Rodrigues. Demann mwa nenport, ou swazir enn size.",
    placeholder: "Demann mwa…",
    send: "Avoye",
    topics: {
      plan: "Plann mo vwayaz",
      eat: "Kot pou manze?",
      beaches: "Pli zoli laplaz",
      viewpoints: "Pli zoli pwin vi",
      rent: "Loue enn skooter ou loto",
      hike: "Santie rando",
      taxi: "Trouv enn taxi",
      creole: "Aprann mwa enn mo kreol",
    },
    plan: "Dir mwa ki ou kontan ek mo pou fer enn program zour par zour dan de segond — laplaz, manze, pwin vi, tou.",
    planCta: "Ouver planifikater la",
    eat: "Ou fin? Nou konsierz manze trouv ou bon plas ek aranz tou lor WhatsApp — pa bizin rode partou.",
    eatCta: "Demann konsierz la",
    beachesLead: "Rodrigues ena bann zoli laplaz. Sey sa bann la:",
    viewpointsLead: "Pou pli zoli vi lor lil, al:",
    mapCta: "Get lor lakart",
    guideFallback: "Explor tou laplaz ek pwin vi dan gid lil la.",
    rent: "Enn skooter pou santi labriz, ou enn loto pou fami — swazir ou bann dat ek ou pou trouv pri an direk.",
    rentCta: "Get bann veikil",
    hike: "Met ou soulie! Rodrigues ena bann zoli santie ek gran vi lor lamer.",
    hikeCta: "Get bann santie",
    taxi: "Bizin enn transpor? Mo konekt ou ek bann sofer lokal ou kapav fer konfians.",
    taxiCta: "Trouv enn taxi",
    creoleLead: "Ala enn mo kreol pou koz kouma enn lokal:",
    means: "vedir",
    hello:
      "Bonzur! 😄 Kontan trouv ou. Ki ou anvi — laplaz, manze, enn skooter, enn program pou lazourne?",
    thanks: "Nanye — mo la pou ou! 🐢 Ena lezot kitsoz mo kapav ed ou?",
    help: "Mo ou gid lil 🗺️ Mo kapav plann ou vwayaz, trouv ou manze, propoz laplaz ek pwin vi, aranz enn skooter ou loto, montre ou santie ek taxi, konverti larzan & kalkil ou bidze 💱, ek mem aprann ou kreol. Ki ou anvi?",
    contact:
      "Mo kontan konekt ou ek lekip Roule Rodrigues — zot pou okip ou personelman.",
    contactCta: "Kontakt lekip la",
    weather:
      "Rodrigues res so ek ena divan preske tou lane 🌴. Get ou app meteo pou zordi — ek si lapli tonbe, konsierz manze ek bann plas lil bon losion.",
    fallback:
      "Hmm, mo pa finn byen konpran 🤔 — mo pli bon ek vwayaz, manze, laplaz, pwin vi, lokasion, santie ek taxi. Swazir enn size, ou koz ek enn vre dimoun:",
    waCta: "Koz ek enn dimoun lor WhatsApp",
    waPrefill: "Bonzur! Mo ena enn kestion lor Rodrigues 🐢",
    openMap: "Get lor Google Maps",
    curError:
      "Mo pa finn kapav gagn to de sanz la aster 🤔 — sey ankor dan enn ti moman.",
    budgetChip: "Plann par bidze",
    budgetPrompt:
      "Dir mwa ou bidze ek konbien zour ek mo fer kalkil — par ex. « 500 € pou 4 zour » 💰",
    budgetDay: "par zour",
    budgetScooter:
      "Enn skooter pou {days} zour koute apepre Rs {total} (depi Rs {price}/zour)",
    budgetRest:
      ", res apepre Rs {rest} pou manze, karbiran ek aktivite — konfortab! 👍",
    budgetCta: "Plann mo bann zour",
    curChip: "Konverti larzan",
    curPrompt:
      "Mo osi ou konvertiser larzan 💱 Tap enn montan ek mo donn ou to an direk — par ex. « 100 EUR », « 50 GBP to MUR » ou « 2500 MUR to USD ».",
  },
};

export default function TiRouleGuide({
  image,
  poses,
  data,
  whatsapp,
  scooterDailyMur,
  hideFab,
}: {
  image?: string;
  poses?: Record<string, string>;
  data?: MascotData;
  whatsapp?: string;
  scooterDailyMur?: number;
  hideFab?: boolean; // hide the floating orb (e.g. when Ti Roulé is in a nav bar)
}) {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [pose, setPose] = useState("welcome");
  const [input, setInput] = useState("");
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [firstTime, setFirstTime] = useState(false);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const avatar = (key?: string) => resolvePose(key, poses, image);
  const hasMascot = !!avatar("welcome");
  const nextId = () => (idRef.current += 1);

  // Reveal on scroll — stay out of the way of the hero, glide in as you explore.
  // Short pages that barely scroll show him right away.
  useEffect(() => {
    const check = () => {
      const scrolled = window.scrollY > 320;
      const barelyScrollable =
        document.documentElement.scrollHeight - window.innerHeight < 500;
      setRevealed(scrolled || barelyScrollable);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // Show a one-time "New" nudge until the visitor first opens the chat.
  useEffect(() => {
    try {
      if (!localStorage.getItem("rr_tiroule_seen")) setFirstTime(true);
    } catch {
      /* ignore */
    }
  }, []);
  const markSeen = () => {
    setFirstTime(false);
    try {
      localStorage.setItem("rr_tiroule_seen", "1");
    } catch {
      /* ignore */
    }
  };
  const openChat = () => {
    setRevealed(true);
    setOpen(true);
    markSeen();
    // Where they were standing when they gave up looking and asked instead.
    tirouleOpened(
      typeof window === "undefined" ? "" : window.location.pathname,
    );
  };

  // Let other parts of the site open Ti Roulé (e.g. the hero "Ask Ti Roulé" button).
  useEffect(() => {
    window.addEventListener("tiroule:open", openChat);
    return () => window.removeEventListener("tiroule:open", openChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast open/close so the WhatsApp FAB can step aside while the chat is up.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("tiroule:visibility", { detail: { open } }),
    );
  }, [open]);

  // Seed the greeting (+ a proactive seasonal tip) the first time the chat opens.
  useEffect(() => {
    if (open && messages.length === 0) {
      setPose("welcome");
      setMessages([
        {
          id: nextId(),
          who: "bot",
          text: `${c.greet}\n\n${seasonNote(language)}`,
          pose: "welcome",
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const names = useCallback(
    (list: LocName[] | undefined) =>
      (list ?? [])
        .map((l) => loc(language, l.name, l.nameFr, l.nameCr))
        .filter(Boolean),
    [language],
  );

  const buildAnswer = useCallback(
    (topic: TopicKey): Answer => {
      switch (topic) {
        case "plan":
          return {
            text: c.plan,
            pose: "holdingMap",
            cta: { label: c.planCta, href: "/trip-planner" },
          };
        case "eat":
          return {
            text: c.eat,
            pose: "happy",
            cta: { label: c.eatCta, href: "/food" },
          };
        case "beaches": {
          const b = names(data?.beaches);
          return {
            text: b.length
              ? `${c.beachesLead} ${b.join(", ")}.`
              : c.guideFallback,
            pose: "atBeach",
            cta: { label: c.mapCta, href: "/#map" },
          };
        }
        case "viewpoints": {
          const v = names(data?.viewpoints);
          return {
            text: v.length
              ? `${c.viewpointsLead} ${v.join(", ")}.`
              : c.guideFallback,
            pose: "atViewpoint",
            cta: { label: c.mapCta, href: "/#map" },
          };
        }
        case "rent":
          return {
            text: c.rent,
            pose: "onScooter",
            cta: { label: c.rentCta, href: "/#explore" },
          };
        case "hike":
          return {
            text: c.hike,
            pose: "hiking",
            cta: { label: c.hikeCta, href: "/#routes" },
          };
        case "taxi":
          return {
            text: c.taxi,
            pose: "pointing",
            cta: { label: c.taxiCta, href: "/taxi" },
          };
        case "creole": {
          const w = CREOLE[Math.floor(Math.random() * CREOLE.length)];
          const meaning = language === "fr" ? w.fr : w.en;
          return {
            text: `${c.creoleLead}\n“${w.p}” — ${c.means} “${meaning}”.`,
            pose: "excited",
          };
        }
      }
    },
    [c, data, language, names],
  );

  // When Ti Roulé is stuck, hand off to a real human — WhatsApp if a number is
  // configured, otherwise the contact page.
  const escalationCta = useMemo(() => {
    const link = waLink(whatsapp, c.waPrefill);
    return link
      ? { label: c.waCta, href: link }
      : { label: c.contactCta, href: "/#contact" };
  }, [whatsapp, c]);

  const answerFor = useCallback(
    (key: IntentKey | null): Answer => {
      switch (key) {
        case "plan":
        case "eat":
        case "beaches":
        case "viewpoints":
        case "rent":
        case "hike":
        case "taxi":
        case "creole":
          return buildAnswer(key);
        case "hello":
          return { text: c.hello, pose: "welcome" };
        case "thanks":
          return { text: c.thanks, pose: "happy" };
        case "help":
          return { text: c.help, pose: "pointing" };
        case "contact":
          return { text: c.contact, pose: "happy", cta: escalationCta };
        case "weather":
          return { text: c.weather, pose: "lookingAround" };
        default:
          return { text: c.fallback, pose: "surprised", cta: escalationCta };
      }
    },
    [buildAnswer, c, escalationCta],
  );

  const deliver = (userText: string, getAnswer: () => Answer) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessages((m) => [...m, { id: nextId(), who: "user", text: userText }]);
    setTyping(true);
    setPose("thinking");
    timerRef.current = setTimeout(() => {
      const a = getAnswer();
      setTyping(false);
      setPose(a.pose);
      setMessages((m) => [
        ...m,
        { id: nextId(), who: "bot", text: a.text, pose: a.pose, cta: a.cta },
      ]);
    }, 850);
  };

  const askTopic = (topic: TopicKey) =>
    deliver(c.topics[topic], () => buildAnswer(topic));

  // Quietly log a question Ti Roulé couldn't answer, so the owner can see the
  // gaps and grow the knowledge base. Fire-and-forget, no PII.
  const logMiss = (q: string) => {
    try {
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "tiroule_miss",
          target_name: q.slice(0, 160),
          category: "tiroule",
          type: "link",
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const knowledgeAnswer = (k: KnowledgeEntry): Answer => {
    const kt = language === "fr" ? k.fr : language === "cr" ? k.cr : k.en;
    const CTA: Record<KnowledgeCta, { label: string; href: string }> = {
      plan: { label: c.planCta, href: "/trip-planner" },
      map: { label: c.mapCta, href: "/#map" },
      rent: { label: c.rentCta, href: "/#explore" },
      taxi: { label: c.taxiCta, href: "/taxi" },
      eat: { label: c.eatCta, href: "/food" },
    };
    const cta = k.place
      ? {
          label: c.openMap,
          href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(k.place)}`,
        }
      : k.cta
        ? CTA[k.cta]
        : undefined;
    return { text: kt, pose: k.pose, cta };
  };

  // Read a message aloud — shared robust engine (per-language voice, no cut-off).
  const speak = (id: number, text: string) => {
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(id);
    speakText(text, language, () =>
      setSpeakingId((cur) => (cur === id ? null : cur)),
    );
  };

  // Prime voices once; stop narration when the chat closes / unmounts.
  useEffect(() => {
    primeVoices();
  }, []);
  useEffect(() => {
    if (!open) {
      stopSpeaking();
      setSpeakingId(null);
    }
  }, [open]);
  useEffect(() => () => stopSpeaking(), []);

  // Currency question → fetch live rates (with an honest estimate fallback).
  const handleCurrency = async (
    userText: string,
    q: ReturnType<typeof parseCurrencyQuery>,
  ) => {
    if (!q) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessages((m) => [...m, { id: nextId(), who: "user", text: userText }]);
    setTyping(true);
    setPose("thinking");
    let answer: Answer;
    try {
      const data = await getRatesCached();
      const rates = data?.rates;
      if (rates?.[q.from] && rates?.[q.to]) {
        const rate = rates[q.to] / rates[q.from];
        const text = formatConversion(q, q.amount * rate, rate, language, {
          live: true,
          scooterDailyMur,
          updated: data?.updated,
        });
        answer = {
          text,
          pose: "happy",
          cta:
            q.to === "MUR"
              ? { label: c.rentCta, href: "/#explore" }
              : undefined,
        };
      } else {
        throw new Error("no rate");
      }
    } catch {
      const est = estimateConvert(q);
      answer = est
        ? {
            text: formatConversion(q, est.converted, est.rate, language, {
              live: false,
            }),
            pose: "lookingAround",
          }
        : { text: c.curError, pose: "surprised" };
    }
    setTyping(false);
    setPose(answer.pose);
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        who: "bot",
        text: answer.text,
        pose: answer.pose,
        cta: answer.cta,
      },
    ]);
  };

  // "€500 for 4 days" → a grounded budget breakdown (real scooter cost, no
  // fabricated food prices).
  const handleBudget = async (
    userText: string,
    cur: NonNullable<ReturnType<typeof parseCurrencyQuery>>,
    days: number,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessages((m) => [...m, { id: nextId(), who: "user", text: userText }]);
    setTyping(true);
    setPose("thinking");
    let totalMur: number | null = null;
    if (cur.from === "MUR") {
      totalMur = cur.amount;
    } else {
      const data = await getRatesCached();
      if (data?.rates?.[cur.from] && data.rates.MUR)
        totalMur = cur.amount * (data.rates.MUR / data.rates[cur.from]);
      else {
        const est = estimateConvert({
          amount: cur.amount,
          from: cur.from,
          to: "MUR",
        });
        if (est) totalMur = est.converted;
      }
    }
    let answer: Answer;
    if (totalMur == null) {
      answer = { text: c.curError, pose: "surprised" };
    } else {
      const rs = (n: number) => Math.round(n).toLocaleString("en-US");
      const lines = [
        `${cur.amount.toLocaleString("en-US")} ${cur.from} ≈ Rs ${rs(totalMur)}`,
        "",
        `≈ Rs ${rs(totalMur / days)} ${c.budgetDay}`,
      ];
      if (scooterDailyMur && scooterDailyMur > 0) {
        const scoot = days * scooterDailyMur;
        const rest = totalMur - scoot;
        let s = c.budgetScooter
          .replace("{days}", String(days))
          .replace("{total}", rs(scoot))
          .replace("{price}", rs(scooterDailyMur));
        s += rest > 0 ? c.budgetRest.replace("{rest}", rs(rest)) : ".";
        lines.push("", s);
      }
      answer = {
        text: lines.join("\n"),
        pose: "holdingMap",
        cta: { label: c.budgetCta, href: "/trip-planner" },
      };
    }
    setTyping(false);
    setPose(answer.pose);
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        who: "bot",
        text: answer.text,
        pose: answer.pose,
        cta: answer.cta,
      },
    ]);
  };

  // A prompt-style bot message (used by the budget & convert chips).
  const prompt = (text: string, pose = "holdingMap") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTyping(true);
    setPose("thinking");
    timerRef.current = setTimeout(() => {
      setTyping(false);
      setPose(pose);
      setMessages((m) => [...m, { id: nextId(), who: "bot", text, pose }]);
    }, 500);
  };
  const askBudget = () => prompt(c.budgetPrompt);
  const askConvert = () => prompt(c.curPrompt, "excited");

  // Free text: budget → currency → core intent → knowledge base → human hand-off.
  // Log the misses. All local (except the live rate lookup) — no LLM, nothing to bill.
  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    const budget = parseBudget(text);
    if (budget) {
      void handleBudget(text, budget.cur, budget.days);
      return;
    }
    const money = parseCurrencyQuery(text);
    if (money) {
      void handleCurrency(text, money);
      return;
    }
    const key = matchIntent(text);
    const k = key ? null : matchKnowledge(text);
    if (!key && !k) logMiss(text);
    // The RATE, so "is Ti Roulé getting better" has an answer. The question
    // text itself stays out of analytics — free text is where somebody types a
    // phone number — and lives in lead_events behind the admin password.
    tirouleQuestionAsked(Boolean(key || k));
    const answer: Answer = key
      ? answerFor(key)
      : k
        ? knowledgeAnswer(k)
        : answerFor(null);
    deliver(text, () => answer);
  };

  if (!hasMascot) return null;

  return (
    <>
      {/* Floating mascot button — reveals on scroll, bottom-left (WhatsApp owns bottom-right) */}
      <AnimatePresence>
        {revealed && !open && !hideFab && (
          <motion.button
            type="button"
            onClick={openChat}
            aria-label={c.open}
            initial={{ opacity: 0, y: 24, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-[76px] left-4 z-[85] md:bottom-4"
          >
            {firstTime && (
              <span className="absolute -top-2 right-0 z-10 flex">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow/60" />
                <span className="relative inline-flex rounded-full bg-yellow px-2 py-0.5 font-syne text-[10px] font-bold text-dark shadow-lg">
                  {language === "fr"
                    ? "Nouveau"
                    : language === "cr"
                      ? "Nouvo"
                      : "New"}
                </span>
              </span>
            )}
            <span className="relative block rr-mascot-bob">
              <span className="block h-16 w-16 overflow-hidden rounded-full bg-dark-card ring-2 ring-yellow ring-offset-2 ring-offset-dark shadow-[0_10px_24px_rgba(0,0,0,0.5)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatar("welcome")}
                  alt=""
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
              </span>
              <span className="absolute -top-1 left-[3.25rem] whitespace-nowrap rounded-full rounded-bl-sm bg-white px-2.5 py-1 font-dm text-[11px] font-medium text-dark shadow-lg">
                {c.bubble}
              </span>
              <span className="absolute top-1 right-2 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500 border-2 border-dark" />
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[86] bg-black/50 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-label={`Ti Roulé — ${c.role}`}
              className="fixed bottom-4 left-4 right-4 sm:right-auto sm:w-[380px] z-[87] flex max-h-[80vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-dark-card shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]"
            >
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-b from-yellow/[0.08] to-transparent p-4">
                <span className="relative shrink-0">
                  <span className="block h-12 w-12 overflow-hidden rounded-full bg-black/20 ring-2 ring-yellow/70">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatar(typing ? "thinking" : pose)}
                      alt=""
                      className="h-full w-full object-cover object-top"
                    />
                  </span>
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-dark-card" />
                </span>
                <div className="min-w-0">
                  <p className="font-syne font-extrabold text-offwhite leading-tight">
                    Ti Roulé
                  </p>
                  <p className="font-dm text-[11px] text-green-400 leading-tight">
                    ● {c.online} · {c.role}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={c.close}
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted transition-colors hover:bg-white/10 hover:text-offwhite"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 space-y-3 overflow-y-auto p-4"
              >
                {messages.map((m) =>
                  m.who === "bot" ? (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-end gap-2"
                    >
                      <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-black/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={avatar(m.pose)}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      </span>
                      <div className="max-w-[80%]">
                        <div className="whitespace-pre-line rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2.5 font-dm text-sm leading-relaxed text-offwhite/90">
                          {m.text}
                        </div>
                        {m.cta && (
                          <a
                            href={m.cta.href}
                            {...(m.cta.href.startsWith("http")
                              ? { target: "_blank", rel: "noopener noreferrer" }
                              : {})}
                            onClick={() => setOpen(false)}
                            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-dm text-xs font-semibold transition-transform hover:scale-[1.03] ${
                              m.cta.href.includes("wa.me")
                                ? "bg-[#25D366] text-white"
                                : "bg-yellow text-dark"
                            }`}
                          >
                            {m.cta.label}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => speak(m.id, m.text)}
                          aria-label={
                            language === "fr"
                              ? "Écouter"
                              : language === "cr"
                                ? "Ekoute"
                                : "Read aloud"
                          }
                          className="mt-1.5 flex items-center gap-1 font-dm text-[10px] text-muted/50 transition-colors hover:text-yellow"
                        >
                          {speakingId === m.id ? (
                            <Square size={11} />
                          ) : (
                            <Volume2 size={12} />
                          )}
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-yellow px-3.5 py-2.5 font-dm text-sm font-medium leading-relaxed text-dark">
                        {m.text}
                      </div>
                    </motion.div>
                  ),
                )}
                {typing && (
                  <div className="flex items-end gap-2">
                    <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar("thinking")}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    </span>
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                    </div>
                  </div>
                )}
              </div>

              {/* Quick-reply chips + free-text input */}
              <div className="space-y-2.5 border-t border-white/10 p-3">
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={askConvert}
                    disabled={typing}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-dm text-xs text-offwhite/85 transition-colors hover:border-yellow/40 hover:bg-yellow/10 hover:text-offwhite disabled:opacity-40"
                  >
                    <span className="text-yellow" aria-hidden="true">
                      💱
                    </span>
                    {c.curChip}
                  </button>
                  <button
                    type="button"
                    onClick={askBudget}
                    disabled={typing}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-dm text-xs text-offwhite/85 transition-colors hover:border-yellow/40 hover:bg-yellow/10 hover:text-offwhite disabled:opacity-40"
                  >
                    <Wallet size={13} className="text-yellow" strokeWidth={2} />
                    {c.budgetChip}
                  </button>
                  {TOPIC_ORDER.map((topic) => {
                    const Icon = TOPIC_ICON[topic];
                    return (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => askTopic(topic)}
                        disabled={typing}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-dm text-xs text-offwhite/85 transition-colors hover:border-yellow/40 hover:bg-yellow/10 hover:text-offwhite disabled:opacity-40"
                      >
                        <Icon
                          size={13}
                          className="text-yellow"
                          strokeWidth={2}
                        />
                        {c.topics[topic]}
                      </button>
                    );
                  })}
                </div>
                <form onSubmit={submitText} className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={c.placeholder}
                    aria-label={c.placeholder}
                    enterKeyHint="send"
                    className="flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label={c.send}
                    disabled={typing || !input.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow text-dark transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
