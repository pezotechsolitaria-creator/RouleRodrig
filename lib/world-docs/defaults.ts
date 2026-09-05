// Client-safe: the seed document for the Curated world.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
//
// This is the FIRST-RUN document, not the live one. The moment the owner saves
// anything in /admin/worlds, the stored row wins and this file stops being
// rendered — exactly like lib/defaults.ts and `site_content`. Editing it will
// not change the live page. (See the note in CLAUDE.md; the same trap.)
//
// Every card here points at something that really exists in the owner's
// catalogue today — the Île aux Cocos excursion, Chez Banane, Mont Limon — read
// out of the live `site_content` row when this was written. Nothing is invented
// copy attached to an invented photo. If one of them is later deleted in
// /admin, its card DISAPPEARS rather than 404s (see resolveCard), and the
// section tops itself up from the same catalogue.

import {
  T,
  type WorldDoc,
  type WorldCard,
  type EditorialLabel,
} from "./types";

const card = (
  id: string,
  source: WorldCard["source"],
  extra: Omit<WorldCard, "id" | "source"> = {},
): WorldCard => ({ id, source, ...extra });

// ── The label library ───────────────────────────────────────────────────────
//
// Deliberately short. A label means something only while it is scarce: eight
// labels on a page of six cards is a taxonomy, not a recommendation. `pick` is
// the loud one and there is exactly one card wearing it below.
export const DEFAULT_LABELS: EditorialLabel[] = [
  { id: "lbl-pick", tone: "pick", text: T("Ti Roulé pick", "Le choix Ti Roulé", "Swa Ti Roulé") },
  { id: "lbl-locals", tone: "warm", text: T("Locals love it", "Les locaux adorent", "Bann dimoun isi kontan") },
  { id: "lbl-hidden", tone: "quiet", text: T("Hidden gem", "Trésor caché", "Trezor kase") },
  { id: "lbl-sunset", tone: "warm", text: T("Best at sunset", "Au coucher du soleil", "Pli zoli kan soley kouse") },
  { id: "lbl-two", tone: "quiet", text: T("Perfect for two", "Parfait à deux", "Parfe pou de") },
  { id: "lbl-dontmiss", tone: "warm", text: T("Don't miss", "À ne pas manquer", "Pa rat sa") },
];

export const DEFAULT_CURATED: WorldDoc = {
  version: 1,

  hero: {
    eyebrow: T("Curated Rodrigues", "Rodrigues, choisi pour vous", "Rodrig swazir pou ou"),
    // Split in two so the last word can carry the italic without the editor
    // having to write HTML into a text field.
    headline: T("Experience Rodrigues,", "Vivez Rodrigues,", "Viv Rodrig,"),
    headlineAccent: T("elevated.", "autrement.", "otreman."),
    subheadline: T(
      "Handpicked stays, tables and days out.",
      "Séjours, tables et journées choisis un par un.",
      "Lozman, latab ek zourne swazir enn par enn.",
    ),
    ctaLabel: T("Explore curated picks", "Voir notre sélection", "Get nou seleksion"),
    ctaHref: "#curated-featured",
    // Empty on purpose: the resolver fills the hero from the owner's real
    // photography (the site hero, then the best-photographed places) so the
    // page is never seeded with stock imagery it would have to be talked out of
    // later. The owner can pin exact stills in /admin/worlds.
    images: [],
    intervalSeconds: 7,
  },

  // ── WHAT THE PHOTO CARDS DO NOT ALREADY SAY ──────────────────────────────
  // These were seven, and three of them — Stays, Dining, Boutiques — pointed at
  // exactly where the large photo cards a few hundred pixels below already led.
  // A second, smaller route to the same place is not a shortcut; it is the same
  // decision asked twice, and it made the row look like a menu rather than a
  // set of offers.
  //
  // What is left is the five things Curated ARRANGES and the cards do not
  // cover: a private day, wellness, a chauffeur, an airport transfer, a car.
  // Five fit one row on a 392px phone with nothing hidden.
  quickActions: {
    enabled: true,
    items: [
      { id: "qa-exp", icon: "experience", href: "/browse/tours", label: T("Private", "Privé", "Prive") },
      { id: "qa-wellness", icon: "wellness", href: "/experiences/massage", label: T("Wellness", "Bien-être", "Byennet") },
      // Its OWN product, not /taxi. A taxi is a fare between two points; this
      // is a car and a driver for a day. Pointing here at /taxi was selling the
      // second thing with the first thing's page — see SERVICE_TYPES.
      { id: "qa-chauffeur", icon: "taxi", href: "/experiences/chauffeur", label: T("Chauffeur", "Chauffeur", "Sofer") },
      { id: "qa-transfers", icon: "transfer", href: "/transfers", label: T("Transfers", "Transferts", "Transfer") },
      { id: "qa-car", icon: "car", href: "/browse/car", label: T("Car hire", "Voiture", "Loto") },
    ],
  },

  labels: DEFAULT_LABELS,

  sections: [
    // ── CURATED'S OWN CARDS ────────────────────────────────────────────────
    // Not the homepage's. Same six destinations a visitor has to be able to
    // reach, named the way this world names things — "Villas & stays" rather
    // than "Stays", "The table" rather than "Restaurant" — and ordered by what
    // Curated argues matters: where you sleep, then what has been arranged,
    // then the ways to move. Editing any of it leaves the homepage alone.
    {
      id: "sec-cards",
      type: "cards",
      enabled: true,
      items: [
        {
          id: "wc-stays",
          label: T("Villas & stays", "Villas & séjours", "Villa & lozman"),
          icon: "stay",
          imageSource: "stays",
          href: "/browse/stays",
          action: "link",
          popular: true,
          enabled: true,
        },
        {
          id: "wc-exp",
          label: T("Private days", "Journées privées", "Zourne prive"),
          icon: "experience",
          imageSource: "exp",
          href: "/browse/tours",
          action: "link",
          enabled: true,
        },
        {
          id: "wc-table",
          label: T("The table", "La table", "Latab"),
          icon: "restaurant",
          imageSource: "food",
          href: "/food",
          action: "link",
          enabled: true,
        },
        {
          id: "wc-car",
          label: T("Cars", "Voitures", "Loto"),
          icon: "car",
          imageSource: "car",
          href: "/browse/car",
          action: "link",
          enabled: true,
        },
        {
          id: "wc-scooter",
          label: T("Scooters", "Scooters", "Skooter"),
          icon: "scooter",
          imageSource: "scooter",
          href: "/browse/scooter",
          action: "link",
          enabled: true,
        },
        {
          id: "wc-shops",
          label: T("Boutiques", "Boutiques", "Laboutik"),
          icon: "store",
          imageSource: "stores",
          href: "/shop",
          action: "link",
          enabled: true,
        },
      ],
    },

    {
      id: "sec-featured",
      type: "featured",
      enabled: true,
      seeAll: "/browse/tours",
      title: T("Handpicked for you", "Choisis pour vous", "Swazir pou ou"),
      subtitle: T(
        "A few worth making time for.",
        "Quelques-uns qui valent le détour.",
        "Detrwa ki vo lapenn.",
      ),
      limit: 6,
      // ── THE SAME LISTINGS AS AUTHENTIC, FRAMED DIFFERENTLY ───────────────
      // Chez Banane and Île aux Cocos appear on BOTH world pages, and that is
      // the design rather than an oversight: the island has one catalogue. What
      // changes is the pill and the order — "Gastronomy" here, "The table"
      // there. Two catalogues would have meant two things to keep true.
      //
      // The traditional fishing trip that used to lead this rail has moved to
      // Authentic, where it belongs, and a car has taken a place on it: hiring
      // one IS part of an elevated stay here, and leaving it out was the gap
      // the owner spotted.
      cards: [
        card("fc-villa", { kind: "place", id: "svc-1786553125959" }, {
          category: T("Private villa", "Villa privée", "Villa prive"),
          labels: ["lbl-pick"],
        }),
        card("fc-cocos", { kind: "place", id: "rec-1784585562167" }, {
          category: T("Exclusive access", "Accès exclusif", "Akse exklizif"),
          labels: ["lbl-dontmiss"],
        }),
        card("fc-banane", { kind: "place", id: "rec-1786602913382" }, {
          category: T("Gastronomy", "Gastronomie", "Gastronomi"),
        }),
        card("fc-charter", { kind: "place", id: "rec-1785681665552" }, {
          category: T("Private charter", "Sortie privée", "Sorti prive"),
          labels: ["lbl-two"],
        }),
        card("fc-car", { kind: "fleet", id: "veh-1783380348440" }, {
          category: T("Self-drive", "Voiture", "Loto"),
          blurb: T(
            "Delivered to your door, so the island is yours from the first morning.",
            "Livrée devant chez vous, l'île est à vous dès le premier matin.",
            "Livre devan ou laport, lil pou ou depi premie gramatin.",
          ),
        }),
        card("fc-mangliers", { kind: "place", id: "rec-1783845365369" }, {
          category: T("Stay", "Séjour", "Lozman"),
        }),
      ],
    },

    {
      id: "sec-only",
      type: "onlyInRodrigues",
      enabled: true,
      seeAll: "/explore",
      title: T("Only in Rodrigues", "Seulement à Rodrigues", "Zis dan Rodrig"),
      subtitle: T(
        "Nowhere else has these.",
        "Nulle part ailleurs.",
        "Nanye lot par.",
      ),
      cards: [
        card("oi-cocos", { kind: "location", id: "loc-1784584619975" }, {
          title: T("The island's rarest residents", "Les habitants les plus rares", "Bann pli rar abitan"),
          labels: ["lbl-dontmiss"],
        }),
        card("oi-limon", { kind: "location", id: "loc-1784122891862" }, {
          title: T("Worth the climb", "Ça vaut la montée", "Vo lapenn mont"),
          labels: ["lbl-sunset"],
        }),
        card("oi-food", { kind: "link", href: "/food" }, {
          title: T("Flavours from here alone", "Des saveurs bien d'ici", "Gou ki pou isi"),
        }),
        card("oi-kotpive", { kind: "location", id: "loc-1784584377346" }, {
          title: T("Made here, by hand", "Fait à la main", "Fer ar lame"),
          labels: ["lbl-hidden"],
        }),
        card("oi-coral", { kind: "location", id: "loc-1784582011518" }, {
          title: T("A road built of coral", "Une route en corail", "Semin ar koray"),
          labels: ["lbl-hidden"],
        }),
        card("oi-stfrancois", { kind: "location", id: "loc-1784121476763" }, {
          title: T("The lagoon at its widest", "Le lagon, au plus large", "Lagon pli larz"),
        }),
      ],
    },

    {
      id: "sec-events",
      type: "events",
      // Events are off the website (2026-08-29): the section type survives for
      // old docs, but no new doc starts with it on and the renderer skips it.
      enabled: false,
      seeAll: "/",
      title: T("What's on", "À l'affiche", "Ki pe pase"),
      subtitle: T(
        "Tickets bought here, not at the door.",
        "Billets achetés ici, pas à l'entrée.",
        "Tiket aste isi, pa laport.",
      ),
    },

    // ── NO "WHAT ARE YOU LOOKING FOR?" GRID HERE ──────────────────────────
    // There was one, and the owner cut it: eight small tiles repeating routes
    // the shortcuts under the hero and the six photo cards had already offered,
    // sitting between the events and the moods where it broke the run of
    // photography with a third menu. A curated page earns its keep by choosing;
    // a grid of every category is the opposite of choosing.
    //
    // The section TYPE still exists and can be added back from the studio.

    {
      id: "sec-moods",
      type: "moods",
      enabled: true,
      title: T(
        "What kind of day?",
        "Quelle journée ?",
        "Ki kalite zourne?",
      ),
      subtitle: T(
        "Start with the feeling.",
        "Commencez par l'envie.",
        "Koumans ar seki ou anvi.",
      ),
      moods: [
        {
          id: "mood-slow",
          title: T("Slow days", "Journées lentes", "Zourne dousman"),
          blurb: T(
            "Quiet mornings, an empty lagoon, a long lunch and nowhere to be.",
            "Des matins calmes, un lagon vide, un long déjeuner et rien à faire.",
            "Gramatin trankil, lagon vid, enn long manze midi ek nanye pou fer.",
          ),
          href: "/guide/beaches",
          enabled: true,
        },
        {
          id: "mood-wild",
          title: T("Wild Rodrigues", "Rodrigues sauvage", "Rodrig sovaz"),
          blurb: T(
            "Cliff paths, hard climbs and beaches you can only walk to.",
            "Sentiers de falaise, montées sèches et plages qu'on n'atteint qu'à pied.",
            "Semin falez, montaz difisil ek laplaz kot zis lipie kapav ariv.",
          ),
          href: "/guide/routes",
          enabled: true,
        },
        {
          id: "mood-dark",
          title: T("After dark", "Quand le jour tombe", "Kan soley kouse"),
          blurb: T(
            "Where to be standing when the light goes — and where to eat after.",
            "Où se tenir quand la lumière s'en va — et où manger ensuite.",
            "Kot bizin debout kan lalimier ale — ek kot manze apre.",
          ),
          href: "/guide/viewpoints",
          enabled: true,
        },
        {
          id: "mood-taste",
          title: T("Taste of the island", "Le goût de l'île", "Gou lil"),
          blurb: T(
            "Saturday market, a smoky kitchen, and whatever came in off the boat.",
            "Le marché du samedi, une cuisine fumante, et ce que le bateau a ramené.",
            "Bazar samdi, enn lakwizinn ki fime, ek seki bato finn amene.",
          ),
          href: "/food",
          enabled: true,
        },
        {
          id: "mood-two",
          title: T("Just the two of us", "Rien qu'à deux", "Zis nou de"),
          blurb: T(
            "A table nobody else knows about, and a beach you'll have to yourselves.",
            "Une table que personne ne connaît, et une plage rien qu'à vous.",
            "Enn latab personn pa kone, ek enn laplaz zis pou zot.",
          ),
          href: "/browse/stays",
          enabled: true,
        },
      ],
    },

    {
      id: "sec-editors",
      type: "editors",
      enabled: true,
      title: T("From our editors", "Par nos éditeurs", "Depi nou bann editer"),
      subtitle: T(
        "The questions people actually ask us.",
        "Les questions qu'on nous pose vraiment.",
        "Kestion dimoun vremem demande nou.",
      ),
      notes: [
        {
          id: "ed-firsttime",
          title: T(
            "3 places we'd take a first-time visitor",
            "3 endroits où emmener un premier séjour",
            "3 plas nou ti pou amenn enn dimoun premie fwa",
          ),
          body: T(
            "Not the three biggest. The three that make the island make sense on day one.",
            "Pas les trois plus grands. Les trois qui font comprendre l'île dès le premier jour.",
            "Pa trwa pli gran. Trwa ki fer ou konpran lil depi premie zour.",
          ),
          href: "/guide/rodrigues",
          ctaLabel: T("Read the guide", "Lire le guide", "Lir gid la"),
          byline: T("Ti Roulé editors", "La rédaction Ti Roulé", "Lekip Ti Roulé"),
          enabled: true,
        },
        {
          id: "ed-sunset",
          title: T(
            "Where we'd watch the sunset tonight",
            "Où regarder le coucher de soleil ce soir",
            "Kot get soley kouse aswar",
          ),
          body: T(
            "It changes with the wind. These are the four that never disappoint.",
            "Cela dépend du vent. Voici les quatre qui ne déçoivent jamais.",
            "Sa depann divan. Ala kat ki zame desevwar.",
          ),
          href: "/guide/viewpoints",
          ctaLabel: T("See the viewpoints", "Voir les points de vue", "Get bann vi"),
          byline: T("Ti Roulé editors", "La rédaction Ti Roulé", "Lekip Ti Roulé"),
          enabled: true,
        },
        {
          id: "ed-sunday",
          title: T(
            "A perfect slow Sunday in Rodrigues",
            "Un dimanche parfait, sans se presser",
            "Enn dimans parfe, san prese",
          ),
          body: T(
            "Build it yourself in a minute — morning, lunch, afternoon, and the drive between them.",
            "Construisez-le en une minute — matin, déjeuner, après-midi, et la route entre les deux.",
            "Fer li ou-mem dan enn minit — gramatin, manze midi, tanto, ek semin ant zot.",
          ),
          href: "/trip-planner",
          ctaLabel: T("Open the planner", "Ouvrir le planificateur", "Ouver planer la"),
          byline: T("Ti Roulé editors", "La rédaction Ti Roulé", "Lekip Ti Roulé"),
          enabled: true,
        },
      ],
    },

    {
      id: "sec-reviews",
      type: "reviews",
      enabled: true,
      title: T("What visitors said", "Ce qu'ils en disent", "Seki dimoun finn dir"),
    },

    {
      id: "sec-concierge",
      type: "concierge",
      enabled: true,
      eyebrow: T("Concierge", "Conciergerie", "Konsierz"),
      title: T("Let Ti Roulé curate it for you", "Laissez Ti Roulé composer votre séjour", "Les Ti Roulé aranz sa pou ou"),
      body: T(
        "Tell us how you want to spend your time. We'll find the rest.",
        "Dites-nous comment vous voulez passer votre temps. On trouve le reste.",
        "Dir nou kouma ou anvi pas ou letan. Nou trouv lerest.",
      ),
      ctaLabel: T("Ask Ti Roulé", "Demander à Ti Roulé", "Demann Ti Roulé"),
      ctaAction: "tiroule",
      reassurance: T(
        "We reply fast — English, French or Creole.",
        "On répond vite — anglais, français ou créole.",
        "Nou reponn vit — angle, franse ouswa kreol.",
      ),
    },
  ],

  seo: {
    title: "Curated Rodrigues — handpicked stays, experiences & local gems",
    description:
      "Ti Roulé's own selection of Rodrigues: a few handpicked stays, experiences and local places worth making time for, chosen by people who live here.",
  },
};

// ── AUTHENTIC HAS NO DOCUMENT, AND SHOULD NOT ──────────────────────────────
//
// There was one here for about an hour: a full seed for a /authentic page
// built from the same components as /curated. The owner's verdict was that it
// made the site four main pages where it wanted two, and he is right —
// Authentic IS the homepage. Six photo cards of the real island, a grid of
// what people actually do, the travel tools: that is the Authentic argument,
// in a layout that has been working for months. It is edited in the content
// studio, where it always was.
//
// So the seed is gone rather than kept "in case". A document nothing renders
// is a document that quietly rots, and the next person to read this file would
// have had to work out which of the two was live.

const SEEDS: Record<string, WorldDoc> = {
  curated: DEFAULT_CURATED,
};

/**
 * A fresh deep copy of a world's seed - callers mutate their document freely.
 *
 * A world with no seed of its own falls back to the Curated document rather
 * than to an empty page: an editor opening a brand-new world wants something to
 * edit, and every field in it is going to be replaced anyway.
 */
export function freshWorldDoc(world: string = "curated"): WorldDoc {
  return JSON.parse(JSON.stringify(SEEDS[world] ?? DEFAULT_CURATED)) as WorldDoc;
}
