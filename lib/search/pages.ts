import type { SearchKind } from "./types";

// ── The site's own doors: services and guides ────────────────────────────────
//
// The catalogue (vehicles, stays, places, dishes, events…) is read live when
// the index is built. These are the PAGES a visitor may be looking for by
// name — "taxi", "map", "manage my booking" — which no table lists.
//
// Every url here is checked against the live site by the search test
// (lib/search/build.test.ts asserts they are routes that exist in app/).
// The eSIM store is deliberately absent while it is closed (M229).

export type StaticPage = {
  id: string;
  k: SearchKind;
  u: string;
  t: { en: string; fr: string; cr: string };
  d: { en: string; fr: string; cr: string };
  /** Words that should find it, in any language. */
  w: string;
  b?: number;
};

export const STATIC_PAGES: StaticPage[] = [
  {
    id: "page:scooter",
    k: "vehicle",
    u: "/browse/scooter",
    t: { en: "Scooter rental", fr: "Location de scooter", cr: "Lokasion scooter" },
    d: { en: "Rent a scooter for the island, delivered to you.", fr: "Louez un scooter pour l'île, livré chez vous.", cr: "Lwe enn scooter pou lil, nou amenn li ou kote." },
    w: "scooter moto motorbike rent hire location louer",
    b: 1,
  },
  {
    id: "page:car",
    k: "vehicle",
    u: "/browse/car",
    t: { en: "Car rental", fr: "Location de voiture", cr: "Lokasion loto" },
    d: { en: "Rent a car in Rodrigues.", fr: "Louez une voiture à Rodrigues.", cr: "Lwe enn loto Rodrig." },
    w: "car voiture loto rent hire location louer 4x4",
    b: 1,
  },
  {
    id: "page:taxi",
    k: "service",
    u: "/taxi",
    t: { en: "Book a taxi", fr: "Réserver un taxi", cr: "Rezerv enn taxi" },
    d: { en: "A local driver, booked in a minute.", fr: "Un chauffeur local, réservé en une minute.", cr: "Enn sofer lokal, rezerve dan enn minit." },
    w: "taxi cab driver chauffeur ride",
    b: 1,
  },
  {
    id: "page:transfers",
    k: "service",
    u: "/transfers",
    t: { en: "Airport transfer", fr: "Transfert aéroport", cr: "Transfer ayropor" },
    d: { en: "Plaine Corail airport to your stay.", fr: "De l'aéroport de Plaine Corail à votre hébergement.", cr: "Depi ayropor Plaine Corail ziska kot ou reste." },
    w: "airport aeroport plaine corail transfer transfert taxi flight arrival",
    b: 1,
  },
  {
    id: "page:deliver",
    k: "service",
    u: "/deliver",
    t: { en: "Get anything delivered", fr: "Livraison de tout", cr: "Livrezon nimport ki" },
    d: { en: "Post what you need moved; local drivers send a price.", fr: "Dites ce qu'il faut transporter ; les chauffeurs proposent un prix.", cr: "Dir seki bizin transporte; bann sofer donn pri." },
    w: "delivery livraison livrezon parcel colis move courier errand",
  },
  {
    id: "page:errands",
    k: "service",
    u: "/errands",
    t: { en: "Errands, done for you", fr: "Commissions faites pour vous", cr: "Komisyon fer pou ou" },
    d: { en: "Someone goes and gets it done.", fr: "Quelqu'un s'en occupe pour vous.", cr: "Enn dimounn al fer li pou ou." },
    w: "errand commission komisyon do it for me",
  },
  {
    id: "page:food",
    k: "eat",
    u: "/food",
    t: { en: "Food & takeaway", fr: "Plats à emporter", cr: "Manze pou anmenn" },
    d: { en: "Order local dishes from island kitchens.", fr: "Commandez des plats locaux.", cr: "Komann manze lokal." },
    w: "food eat manger manze restaurant takeaway dish plat meal",
    b: 1,
  },
  {
    id: "page:shop",
    k: "shop",
    u: "/shop",
    t: { en: "Local shops", fr: "Boutiques locales", cr: "Laboutik lokal" },
    d: { en: "Honey, crafts and island products.", fr: "Miel, artisanat et produits de l'île.", cr: "Dimiel, artizana ek prodwi lil." },
    w: "shop boutique magasin souvenir craft artisanat honey miel",
  },
  {
    id: "page:events",
    k: "event",
    u: "/events",
    t: { en: "What's on", fr: "Agenda", cr: "Seki pe arive" },
    d: { en: "Events, festivals and nights out.", fr: "Événements, festivals et soirées.", cr: "Levennman, festival ek soire." },
    w: "events evenement festival concert party fete",
  },
  {
    id: "page:explore",
    k: "guide",
    u: "/explore",
    t: { en: "Explore Rodrigues", fr: "Explorer Rodrigues", cr: "Explor Rodrig" },
    d: { en: "Beaches, hikes, tours and what's on.", fr: "Plages, randos, excursions et agenda.", cr: "Laplaz, rando, tour ek levennman." },
    w: "explore things to do activities",
  },
  {
    id: "page:map",
    k: "guide",
    u: "/map",
    t: { en: "Island map", fr: "Carte de l'île", cr: "Kart lil" },
    d: { en: "Every beach, viewpoint and fuel station on one map.", fr: "Plages, points de vue et stations sur une carte.", cr: "Tou laplaz, vi ek stasion lor enn kart." },
    w: "map carte kart plan gps directions",
    b: 1,
  },
  {
    id: "page:planner",
    k: "guide",
    u: "/trip-planner",
    t: { en: "Trip planner", fr: "Planificateur de voyage", cr: "Planifie ou vwayaz" },
    d: { en: "Plan your days on the island.", fr: "Organisez vos journées sur l'île.", cr: "Organiz ou bann zour lor lil." },
    w: "planner itinerary itineraire plan days programme",
  },
  {
    id: "page:guide",
    k: "guide",
    u: "/guide/rodrigues",
    t: { en: "Rodrigues travel guide", fr: "Guide de voyage Rodrigues", cr: "Gid vwayaz Rodrig" },
    d: { en: "Everything to know before you go.", fr: "Tout savoir avant de partir.", cr: "Tou seki bizin kone avan ale." },
    w: "guide travel tips conseils rodrigues island",
  },
  {
    id: "page:beaches",
    k: "guide",
    u: "/guide/beaches",
    t: { en: "Beaches guide", fr: "Guide des plages", cr: "Gid laplaz" },
    d: { en: "The island's beaches, one by one.", fr: "Les plages de l'île, une par une.", cr: "Bann laplaz lil, enn par enn." },
    w: "beaches plage laplaz swim",
  },
  {
    id: "page:viewpoints",
    k: "guide",
    u: "/guide/viewpoints",
    t: { en: "Viewpoints guide", fr: "Guide des points de vue", cr: "Gid bann vi" },
    d: { en: "Where to see the lagoon from above.", fr: "Où voir le lagon d'en haut.", cr: "Kot pou trouv lagon depi lao." },
    w: "viewpoint point de vue panorama sunset",
  },
  {
    id: "page:hiking",
    k: "guide",
    u: "/guide/hiking",
    t: { en: "Hiking guide", fr: "Guide des randonnées", cr: "Gid rando" },
    d: { en: "Trails with distance, time and difficulty.", fr: "Sentiers avec distance, durée et difficulté.", cr: "Bann sime avek distans, letan ek difikilte." },
    w: "hike hiking trail randonnee rando sentier walk",
  },
  {
    id: "page:routes",
    k: "guide",
    u: "/guide/routes",
    t: { en: "Scenic rides", fr: "Balades à scooter", cr: "Balad scooter" },
    d: { en: "Road routes to ride around the island.", fr: "Itinéraires pour faire le tour de l'île.", cr: "Bann rout pou fer letour lil." },
    w: "route ride road trip balade itineraire scooter",
  },
  {
    id: "page:cocos",
    k: "guide",
    u: "/guide/ile-aux-cocos",
    t: { en: "Île aux Cocos guide", fr: "Guide de l'Île aux Cocos", cr: "Gid Lil o Koko" },
    d: { en: "The bird island: boats, permits and what to bring.", fr: "L'île aux oiseaux : bateaux, permis et quoi emporter.", cr: "Lil zwazo: bato, permi ek seki pou anmenn." },
    w: "ile aux cocos coco island birds oiseaux boat bateau excursion",
    b: 1,
  },
  {
    id: "page:foodguide",
    k: "guide",
    u: "/guide/rodriguan-food",
    t: { en: "Rodriguan food guide", fr: "Guide de la cuisine rodriguaise", cr: "Gid manze rodrige" },
    d: { en: "Octopus, honey, tourte and what to try.", fr: "Ourite, miel, tourte : que goûter.", cr: "Zourit, dimiel, tourt: seki pou goute." },
    w: "food cuisine ourite octopus honey tourte creole local dishes",
  },
  {
    id: "page:booking",
    k: "help",
    u: "/manage-booking",
    t: { en: "Manage my booking", fr: "Gérer ma réservation", cr: "Zer mo rezervasion" },
    d: { en: "Change dates or check a rental booking.", fr: "Modifier ou vérifier une réservation.", cr: "Sanz dat ouswa get enn rezervasion." },
    w: "booking reservation manage my booking change cancel annuler modifier",
  },
  {
    id: "page:track",
    k: "help",
    u: "/track",
    t: { en: "Track an order", fr: "Suivre une commande", cr: "Swiv enn komann" },
    d: { en: "Where your order or delivery is now.", fr: "Où en est votre commande ou livraison.", cr: "Kot ou komann ete aster." },
    w: "track suivre order commande delivery livraison where",
  },
  {
    id: "page:emergency",
    k: "help",
    u: "/emergency",
    t: { en: "Emergency & useful numbers", fr: "Urgences et numéros utiles", cr: "Ijans ek nimero itil" },
    d: { en: "Police, hospital, pharmacy and taxi numbers.", fr: "Police, hôpital, pharmacie et taxis.", cr: "Polis, lopital, farmasi ek taxi." },
    w: "emergency urgence police hospital hopital pharmacy pharmacie doctor numbers numeros",
    b: 1,
  },
  {
    id: "page:faq",
    k: "help",
    u: "/faq",
    t: { en: "Questions & answers", fr: "Questions fréquentes", cr: "Bann kestion" },
    d: { en: "Licences, deposits, fuel and insurance.", fr: "Permis, caution, carburant et assurance.", cr: "Permi, depo, delwil ek lasirans." },
    w: "faq questions help aide licence permis deposit caution insurance",
  },
  {
    id: "page:list",
    k: "service",
    u: "/list-your-scooter",
    t: { en: "List your scooter", fr: "Proposer votre scooter", cr: "Met ou scooter" },
    d: { en: "Own a vehicle? Rent it out with us.", fr: "Vous avez un véhicule ? Louez-le avec nous.", cr: "Ou ena enn loto ouswa scooter? Lwe li avek nou." },
    w: "owner partner list vehicle earn proprietaire",
  },
];
