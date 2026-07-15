// Ti Roulé's Rodrigues knowledge base — costless, no LLM. Each entry is matched
// by keyword (accent-folded) and answered in the visitor's language. Facts are
// researched from public sources (Rodrigues Tourism Office, Wikipedia,
// Tripadvisor, climate guides) — keep to well-established facts, never invent.
// Matched AFTER the core intents in TiRouleGuide, so it only handles the
// "island question" topics the core topics don't cover.

export type KnowledgeCta = "plan" | "map" | "rent" | "taxi" | "eat";

export type KnowledgeEntry = {
  id: string;
  kw: string[];
  pose: string;
  cta?: KnowledgeCta;
  // A named place → deep-links the answer to Google Maps (accurately geocoded,
  // so no risk of a wrong custom pin). Takes precedence over `cta`.
  place?: string;
  en: string;
  fr: string;
  cr: string;
};

export const RODRIGUES_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "getThere",
    kw: ["get to rodrigues", "getting to rodrigues", "how to get", "how do i get", "fly to", "flight to", "flights", "airport", "plane", "air mauritius", "ferry", "boat from mauritius", "from mauritius", "reach rodrigues", "travel to rodrigues"],
    pose: "holdingMap",
    cta: "plan",
    en: "Easiest is a short flight from Mauritius — about 1h30 with Air Mauritius into Plaine Corail airport, several times a day. There's also a ferry from Port Louis to Port Mathurin (roughly weekly, about a day and a half at sea).",
    fr: "Le plus simple : un vol court depuis Maurice — environ 1h30 avec Air Mauritius jusqu'à l'aéroport de Plaine Corail, plusieurs fois par jour. Il y a aussi un ferry de Port-Louis à Port Mathurin (environ une fois par semaine, un jour et demi en mer).",
    cr: "Pli fasil se enn ti vol depi Moris — apepre 1er30 ek Air Mauritius ziska laeropor Plaine Corail, plizir fwa par zour. Ena osi enn ferry depi Port-Louis ziska Port Mathurin (apepre enn fwa par semenn, enn zour edmi lor lamer).",
  },
  {
    id: "bestTime",
    kw: ["best time", "when to visit", "when to go", "when should", "best month", "best season", "which month", "time of year", "high season", "low season"],
    pose: "lookingAround",
    cta: "plan",
    en: "The sweet spot is the cooler, drier season — roughly May to November (around 20–25°C). December to April is warmer and wetter with a cyclone risk, while June–September brings strong trade winds that windsurfers love.",
    fr: "La meilleure période est la saison plus fraîche et sèche — de mai à novembre environ (20–25°C). De décembre à avril, il fait plus chaud et humide avec un risque de cyclone, tandis que de juin à septembre les alizés ravissent les véliplanchistes.",
    cr: "Pli bon moman se sezon pli fre ek sek — apepre Me ziska Novam (20–25°C). Desam ziska Avril pli so ek pli mouye ek risk siklonn, ek Zin ziska Septam ena bann aliz for ki bann windsurfer kontan.",
  },
  {
    id: "money",
    kw: ["currency", "cash", "rupee", "rupees", "atm", "credit card", "debit card", "exchange money", "local money", "pay with card"],
    pose: "thinking",
    en: "The currency is the Mauritian rupee (Rs). Bring some cash — many small shops, markets and stalls don't take cards.",
    fr: "La monnaie est la roupie mauricienne (Rs). Prévoyez du liquide — beaucoup de petits commerces, marchés et stands n'acceptent pas la carte.",
    cr: "Larzan se roupi morisien (Rs). Amenn kas — boukou ti laboutik, bazar ek stand pa pran kart.",
  },
  {
    id: "budget",
    kw: ["budget", "daily budget", "how expensive", "expensive", "affordable", "travel budget", "spending money", "cost of a trip", "how much for a trip", "budget per day", "daily spend"],
    pose: "thinking",
    cta: "plan",
    en: "Rodrigues is gentle on the wallet. As a rough mid-range guide, plan for around $70–120 (about Rs 3,000–5,500) a day covering a room, food, a scooter and a few activities — less if you keep it simple. Bring cash for small shops and markets.",
    fr: "Rodrigues est douce pour le portefeuille. À titre indicatif (gamme moyenne), comptez environ 70–120 $ (env. Rs 3 000–5 500) par jour avec logement, repas, scooter et quelques activités — moins en restant simple. Prévoyez du liquide pour les petits commerces et marchés.",
    cr: "Rodrigues pa tro ser. Kouma enn gid apepre (mwayen), plann apepre 70–120 $ (apepre Rs 3,000–5,500) par zour ek lozman, manze, skooter ek detrwa aktivite — mwins si ou res senp. Amenn kas pou ti laboutik ek bazar.",
  },
  {
    id: "gettingAround",
    kw: ["road", "roads", "drive", "driving", "bus", "buses", "public transport", "how to move around", "move around", "getting around the island"],
    pose: "onScooter",
    cta: "rent",
    en: "Roads are winding and hilly, so a scooter or a car gives you the most freedom (buses are limited). I can sort you a rental in minutes.",
    fr: "Les routes sont sinueuses et vallonnées : un scooter ou une voiture offre le plus de liberté (les bus sont limités). Je peux vous trouver une location en quelques minutes.",
    cr: "Bann sime sinye ek ena monte — enn skooter ou enn loto donn ou pli boukou liberte (bis limite). Mo kapav aranz ou enn lokasion dan de minit.",
  },
  {
    id: "tortoises",
    kw: ["tortoise", "tortoises", "turtle reserve", "giant tortoise", "francois leguat", "leguat", "aldabra", "turtles"],
    pose: "excited",
    place: "Francois Leguat Reserve, Rodrigues",
    en: "Head to the François Leguat Reserve at Anse Quitor — you can walk among hundreds of giant tortoises and tour the Grande Caverne cave with a guide.",
    fr: "Rendez-vous à la Réserve François Leguat à Anse Quitor — vous marcherez parmi des centaines de tortues géantes et visiterez la grotte Grande Caverne avec un guide.",
    cr: "Al Rezerv François Leguat dan Anse Quitor — ou pou mars parmi santenn torti zean ek vizit lagrot Grande Caverne ek enn gid.",
  },
  {
    id: "cocos",
    kw: ["ile aux cocos", "cocos", "coco island", "bird island", "bird sanctuary", "islet", "boat trip", "island hopping", "ile aux chats", "hermitage"],
    pose: "atViewpoint",
    place: "Ile aux Cocos, Rodrigues",
    en: "Île aux Cocos is a protected bird-sanctuary islet reached by boat with a licensed guide — pure white sand and thousands of seabirds. Book the excursion ahead.",
    fr: "L'Île aux Cocos est un îlot-réserve d'oiseaux qu'on rejoint en bateau avec un guide agréé — sable blanc et milliers d'oiseaux marins. Réservez l'excursion à l'avance.",
    cr: "Île aux Cocos se enn ti lil rezerv zwazo ki ou al an bato ek enn gid — disab blan ek milye zwazo lamer. Rezerv exkursion la davans.",
  },
  {
    id: "caves",
    kw: ["cave", "caves", "caverne", "patate", "stalactite", "stalagmite", "grande caverne", "underground"],
    pose: "lookingAround",
    place: "Caverne Patate, Rodrigues",
    en: "Caverne Patate is a ~600m limestone cave — a guided, torch-lit walk past dramatic stalactites and stalagmites. Wear comfy shoes.",
    fr: "La Caverne Patate est une grotte calcaire d'environ 600 m — une visite guidée à la lampe torche parmi stalactites et stalagmites. Prévoyez de bonnes chaussures.",
    cr: "Caverne Patate se enn lagrot ~600m — enn vizit gide ek latorse parmi stalactit ek stalagmit. Met bon soulie.",
  },
  {
    id: "trouDArgent",
    kw: ["trou d argent", "trou dargent", "secret beach", "hidden beach", "graviers", "saint francois beach", "st francois"],
    pose: "atBeach",
    place: "Trou d'Argent, Rodrigues",
    en: "Trou d'Argent is the island's most famous hidden beach — tucked between cliffs and reachable only on foot, hiking from Graviers or Saint-François. Bring water and good shoes.",
    fr: "Trou d'Argent est la plage cachée la plus célèbre de l'île — nichée entre les falaises et accessible uniquement à pied, depuis Graviers ou Saint-François. Emportez de l'eau et de bonnes chaussures.",
    cr: "Trou d'Argent se pli fame laplaz kachiet lor lil — ant falez ek zis aksesib apie, depi Graviers ou Saint-François. Amenn delo ek bon soulie.",
  },
  {
    id: "montLimon",
    kw: ["mont limon", "highest point", "highest peak", "summit", "limon", "highest mountain"],
    pose: "atViewpoint",
    place: "Mont Limon, Rodrigues",
    en: "Mont Limon is the highest point (~398m) with a sweeping view over the island — an easy stop just south of Port Mathurin.",
    fr: "Le Mont Limon est le point culminant (~398 m) avec une vue panoramique sur l'île — un arrêt facile juste au sud de Port Mathurin.",
    cr: "Mont Limon se pwin pli o (~398m) ek enn zoli vi lor lil — enn are fasil zis dan sid Port Mathurin.",
  },
  {
    id: "food",
    kw: ["octopus", "ourite", "mourgate", "local dish", "local food", "typical dish", "typical food", "specialty", "speciality", "famous dish", "what to eat"],
    pose: "happy",
    cta: "eat",
    en: "You have to try ourite (octopus) — Rodrigues' signature, slow-cooked in a tomato-and-spice sauce. Look out for smoked sausages, limes, honey and local Creole dishes too. Want me to sort you a table?",
    fr: "Il faut goûter l'ourite (poulpe) — la spécialité de Rodrigues, mijotée dans une sauce tomate épicée. Cherchez aussi les saucisses fumées, les citrons, le miel et les plats créoles locaux. Je vous réserve une table ?",
    cr: "Bizin gout ourite (poulp) — spesialite Rodrigues, kwi dousman dan enn sos tomat epise. Rod osi sosis fime, sitron, dimiel ek bann manze kreol. Ou anvi mo aranz enn latab?",
  },
  {
    id: "culture",
    kw: ["culture", "sega", "tambour", "music", "dance", "tradition", "market", "port mathurin", "saturday market", "souvenir", "craft", "crafts"],
    pose: "excited",
    en: "Rodrigues runs on Creole culture and sega tambour — its own music and dance. Don't miss the lively Saturday-morning market in Port Mathurin for crafts, fruit, honey and chilli.",
    fr: "Rodrigues vit au rythme de la culture créole et du séga tambour — sa propre musique et danse. Ne manquez pas le marché animé du samedi matin à Port Mathurin : artisanat, fruits, miel et piment.",
    cr: "Rodrigues viv ek kiltir kreol ek sega tambour — so prop lamizik ek ladans. Pa rat bazar samdi gramatin dan Port Mathurin: lartizana, frwi, dimiel ek piman.",
  },
  {
    id: "activities",
    kw: ["snorkel", "snorkeling", "diving", "scuba", "kitesurf", "kite surf", "windsurf", "surf", "zip line", "zipline", "excursion", "activities", "activity"],
    pose: "hiking",
    cta: "plan",
    en: "Beyond the beaches: snorkelling and diving in the huge lagoon, kayaking, and kitesurfing or windsurfing — best June–September when the trade winds pick up.",
    fr: "Au-delà des plages : snorkeling et plongée dans l'immense lagon, kayak, et kitesurf ou planche à voile — surtout de juin à septembre avec les alizés.",
    cr: "Apar laplaz: snorkeling ek plonze dan gran lagon, kayak, ek kitesurf ou windsurf — sirtou Zin ziska Septam ek bann aliz.",
  },
  {
    id: "safety",
    kw: ["safe", "safety", "dangerous", "danger", "crime", "currents", "reef shoes", "sunburn", "precaution", "is it safe", "stonefish", "stone fish", "jellyfish", "pollution", "litter", "rubbish", "conservation", "sustainable", "eco", "protect"],
    pose: "pointing",
    en: "Rodrigues is very safe and laid-back. In the water, watch for strong currents and stonefish — wear reef shoes and never step on the coral. Bring good sun protection. And please take your litter home and keep your distance from the wildlife, so the island stays beautiful for everyone. 🌱",
    fr: "Rodrigues est très sûre et paisible. Dans l'eau, méfiez-vous des courants forts et des poissons-pierres — portez des chaussures d'eau et ne marchez jamais sur le corail. Protégez-vous bien du soleil. Et merci de remporter vos déchets et de garder vos distances avec la faune, pour préserver la beauté de l'île. 🌱",
    cr: "Rodrigues bien sekirize ek trankil. Dan dilo, fer atansion ar bann kouran for ek pwason ros (stonefish) — met soulie delo ek zame pil lor koray. Protez ou byen ar soley. Ek silvouple ramas ou salte ek res lwin ar bann zanimo, pou lil res zoli pou tou dimoun. 🌱",
  },
  {
    id: "hiddenGems",
    kw: ["hidden gem", "hidden gems", "off the beaten", "secret spot", "secret spots", "lesser known", "authentic", "quiet beach", "less crowded", "local secret"],
    pose: "atBeach",
    cta: "plan",
    en: "For quieter magic, try Trou d'Argent, Graviers and Anse Bouteille in the east, or a sandbank picnic off Île aux Chats — fewer crowds, pure Rodrigues.",
    fr: "Pour plus de tranquillité : Trou d'Argent, Graviers et Anse Bouteille à l'est, ou un pique-nique sur un banc de sable près de l'Île aux Chats — moins de monde, Rodrigues authentique.",
    cr: "Pou pli trankilite: Trou d'Argent, Graviers ek Anse Bouteille dan les, ou enn pik-nik lor enn bank disab pre Île aux Chats — mwins dimoun, vre Rodrigues.",
  },
];

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Same matching rules as the core intents: multi-word keywords match as a
// substring; short words (<4 chars) need an exact token to avoid false hits.
export function matchKnowledge(text: string): KnowledgeEntry | null {
  const norm = normalize(text);
  if (!norm) return null;
  const tokens = new Set(norm.split(" "));
  for (const entry of RODRIGUES_KNOWLEDGE) {
    for (const kwRaw of entry.kw) {
      const kw = normalize(kwRaw);
      if (kw.includes(" ")) {
        if (norm.includes(kw)) return entry;
      } else if (kw.length < 4) {
        if (tokens.has(kw)) return entry;
      } else if (tokens.has(kw) || norm.includes(kw)) {
        return entry;
      }
    }
  }
  return null;
}
