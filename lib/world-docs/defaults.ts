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
      "Handpicked stays, experiences and local gems for unforgettable moments.",
      "Des séjours, des expériences et des trésors locaux choisis un par un.",
      "Bann lozman, eksperyans ek trezor lokal swazir enn par enn.",
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

  // ── THE WHOLE SERVICE RANGE, NOT A SAMPLE ────────────────────────────────
  // The first cut had six tiles and one of them pointed at the page you were
  // already standing on, while CAR AND SCOOTER HIRE — the business this site
  // was built to run — was missing entirely. A world page that cannot rent you
  // a scooter is a brochure.
  //
  // Seven now, and the seventh is the one that peeks: the row scrolls on a
  // narrow phone, which is what the half-tile at the edge is for. The
  // self-referential "Curated" tile is gone; the world switch lives in the
  // header, where a mode switch belongs.
  quickActions: {
    enabled: true,
    items: [
      { id: "qa-stays", icon: "stay", href: "/browse/stays", label: T("Stays", "Séjours", "Lozman") },
      { id: "qa-exp", icon: "experience", href: "/browse/tours", label: T("Private", "Privé", "Prive") },
      { id: "qa-dining", icon: "dining", href: "/food", label: T("Dining", "Table", "Latab") },
      { id: "qa-wellness", icon: "wellness", href: "/experiences/massage", label: T("Wellness", "Bien-être", "Byennet") },
      { id: "qa-transfers", icon: "transfer", href: "/transfers", label: T("Transfers", "Transferts", "Transfer") },
      { id: "qa-car", icon: "car", href: "/browse/car", label: T("Car hire", "Voiture", "Loto") },
      { id: "qa-shops", icon: "shop", href: "/shop", label: T("Boutiques", "Boutiques", "Laboutik") },
    ],
  },

  labels: DEFAULT_LABELS,

  sections: [
    {
      id: "sec-featured",
      type: "featured",
      enabled: true,
      seeAll: "/browse/tours",
      title: T("Handpicked for you", "Choisis pour vous", "Swazir pou ou"),
      subtitle: T(
        "A few Rodrigues moments worth making time for.",
        "Quelques moments de Rodrigues qui méritent qu'on s'arrête.",
        "Detrwa moman Rodrig ki merite ou pran letan.",
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
        "The places, flavours and moments you won't find anywhere else.",
        "Les lieux, les saveurs et les instants qu'on ne trouve nulle part ailleurs.",
        "Bann plas, gou ek moman ki ou pa pou trouv lot par.",
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
      id: "sec-moods",
      type: "moods",
      enabled: true,
      title: T(
        "How do you want to experience Rodrigues?",
        "Comment voulez-vous vivre Rodrigues ?",
        "Kouma ou anvi viv Rodrig?",
      ),
      subtitle: T(
        "Start with the feeling. We'll take care of the rest.",
        "Commencez par l'envie. On s'occupe du reste.",
        "Koumans ar seki ou anvi. Nou okip lerest.",
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
      title: T("From our local editors", "Par nos éditeurs locaux", "Depi nou bann editer lokal"),
      subtitle: T(
        "Short answers to the questions people actually ask us.",
        "Des réponses courtes aux questions qu'on nous pose vraiment.",
        "Bann repons kourt lor kestion dimoun vremem demande nou.",
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
      id: "sec-concierge",
      type: "concierge",
      enabled: true,
      eyebrow: T("Concierge", "Conciergerie", "Konsierz"),
      title: T("Let Ti Roulé curate it for you", "Laissez Ti Roulé composer votre séjour", "Les Ti Roulé aranz sa pou ou"),
      body: T(
        "Tell us how you want to spend your time in Rodrigues. We'll find the places, experiences and local gems that fit.",
        "Dites-nous comment vous voulez passer votre temps à Rodrigues. On trouve les lieux, les expériences et les trésors qui vous correspondent.",
        "Dir nou kouma ou anvi pas ou letan dan Rodrig. Nou pou trouv bann plas, eksperyans ek trezor ki al ar ou.",
      ),
      ctaLabel: T("Ask Ti Roulé", "Demander à Ti Roulé", "Demann Ti Roulé"),
      ctaAction: "tiroule",
      reassurance: T(
        "Our concierge team replies fast — in English, French or Creole.",
        "Notre équipe répond vite — en anglais, français ou créole.",
        "Nou lekip reponn vit — an angle, franse ouswa kreol.",
      ),
    },
  ],

  seo: {
    title: "Curated Rodrigues — handpicked stays, experiences & local gems",
    description:
      "Ti Roulé's own selection of Rodrigues: a few handpicked stays, experiences and local places worth making time for, chosen by people who live here.",
  },
};

// ============================================================================
// AUTHENTIC
// ============================================================================
//
// The other half of the switch. Same engine, same catalogue, a different
// argument about what the island is for — and that difference has to live in
// the WORDS and the ORDER, not only in the palette, or the two worlds are one
// page wearing two skins.
//
//   Curated leads with what has been arranged for you: a private island day, a
//   villa, a table. It is quiet, and it withholds.
//
//   Authentic leads with the island doing what it does anyway: a fishing boat
//   going out, a Saturday market, a path to a beach no road reaches. It is
//   warmer, and it is generous — more per screen, the way a guidebook is.
//
// Note what it does NOT do: invent a second catalogue. Both worlds point at the
// same real listings; they disagree about which ones matter and what to say
// about them, which is exactly what an editor is for.

export const DEFAULT_AUTHENTIC: WorldDoc = {
  version: 1,

  hero: {
    eyebrow: T("Authentic Rodrigues", "Rodrigues authentique", "Rodrig otantik"),
    headline: T("Live Rodrigues,", "Vivez Rodrigues,", "Viv Rodrig,"),
    headlineAccent: T("as it is.", "telle qu'elle est.", "kouma li ete."),
    subheadline: T(
      "Fishermen, footpaths and Saturday markets. The island doing what it does anyway - and how to be there for it.",
      "Des pecheurs, des sentiers, le marche du samedi. L'ile telle qu'elle vit - et comment y etre.",
      "Peser, semin, bazar samdi. Lil pe fer seki li fer - ek kouma pou la.",
    ),
    ctaLabel: T("See the island", "Voir l'ile", "Get lil la"),
    ctaHref: "#authentic-featured",
    images: [],
    intervalSeconds: 7,
  },

  // Seven, mirroring Curated, and the same reasoning: the whole range rather
  // than a sample, no tile pointing at the page you are on, and a way to
  // actually get around the island — which on this side is a scooter.
  quickActions: {
    enabled: true,
    items: [
      { id: "qa-a-beaches", icon: "lagoon", href: "/guide/beaches", label: T("Beaches", "Plages", "Laplaz") },
      { id: "qa-a-hike", icon: "hike", href: "/guide/routes", label: T("Walks", "Sentiers", "Semin") },
      { id: "qa-a-fish", icon: "fish", href: "/experiences/fishing", label: T("Fishing", "Pêche", "Lapes") },
      { id: "qa-a-eat", icon: "dining", href: "/food", label: T("Local food", "Manger local", "Manze lokal") },
      { id: "qa-a-craft", icon: "craft", href: "/shop", label: T("Crafts", "Artisans", "Artizan") },
      { id: "qa-a-village", icon: "village", href: "/map", label: T("Villages", "Villages", "Vilaz") },
      { id: "qa-a-scooter", icon: "scooter", href: "/browse/scooter", label: T("Scooter", "Scooter", "Skooter") },
    ],
  },

  labels: [
    { id: "lbl-a-local", tone: "pick", text: T("Locals do this", "Les locaux le font", "Bann dimoun isi fer sa") },
    { id: "lbl-a-early", tone: "warm", text: T("Go early", "Allez tot", "Al boner") },
    { id: "lbl-a-walk", tone: "quiet", text: T("On foot only", "A pied seulement", "Zis apie") },
  ],

  sections: [
    {
      id: "sec-a-featured",
      type: "featured",
      enabled: true,
      seeAll: "/explore",
      title: T("What the island is doing today", "Ce que l'ile fait aujourd'hui", "Seki lil pe fer zordi"),
      subtitle: T(
        "Not attractions. Things that were happening here anyway, that you can join.",
        "Pas des attractions. Des choses qui se passent de toute facon, et qu'on peut rejoindre.",
        "Pa bann atraksion. Bann kitsoz ki pe pase kanmem, ek ki ou kapav zwenn.",
      ),
      // Seven, not six. Authentic is the generous world by design — more per
      // screen, the way a guidebook is — and the seventh card is the scooter,
      // which the limit had been silently cutting off the end of the rail.
      limit: 7,
      cards: [
        card("fa-peche", { kind: "place", id: "svc-1786554105958" }, {
          category: T("Out at sea", "En mer", "Dan lamer"),
          labels: ["lbl-a-local"],
        }),
        card("fa-cocos", { kind: "place", id: "rec-1784585562167" }, {
          category: T("The islet", "L'ilot", "Lilo"),
          labels: ["lbl-a-early"],
        }),
        card("fa-banane", { kind: "place", id: "rec-1786602913382" }, {
          category: T("The table", "A table", "Latab"),
          labels: ["lbl-a-local"],
        }),
        card("fa-apnee", { kind: "place", id: "svc-1786553123744" }, {
          category: T("In the lagoon", "Dans le lagon", "Dan lagon"),
        }),
        card("fa-mama", { kind: "place", id: "svc-1786553125176" }, {
          category: T("Staying local", "Chez l'habitant", "Kot dimoun"),
        }),
        card("fa-scooter", { kind: "fleet", id: "burgman" }, {
          category: T("Getting about", "Se déplacer", "Bouze"),
          blurb: T(
            "How the island actually moves. Delivered free, wherever you are staying.",
            "Comme tout le monde ici se déplace. Livré gratuitement, où que vous soyez.",
            "Kouma tou dimoun isi deplase. Livre gratis, kot ou reste.",
          ),
          labels: ["lbl-a-local"],
        }),
        card("fa-trou", { kind: "route", id: "ride-graviers-trou-dargent" }, {
          category: T("On foot", "A pied", "Apie"),
          labels: ["lbl-a-walk"],
        }),
      ],
    },

    {
      id: "sec-a-only",
      type: "onlyInRodrigues",
      enabled: true,
      seeAll: "/map",
      title: T("The island itself", "L'ile elle-meme", "Lil li-mem"),
      subtitle: T(
        "Places with a story attached, told by the people who live beside them.",
        "Des lieux qui ont une histoire, racontee par ceux qui vivent a cote.",
        "Bann plas ki ena zot zistwar, rakonte par bann ki reste akote.",
      ),
      cards: [
        card("oa-cocos", { kind: "location", id: "loc-1784584619975" }, {
          title: T("Where the birds nest", "Ou nichent les oiseaux", "Kot zwazo fer nik"),
          labels: ["lbl-a-early"],
        }),
        card("oa-kotpive", { kind: "location", id: "loc-1784584377346" }, {
          title: T("Made here, by hand", "Fait a la main", "Fer ar lame"),
        }),
        card("oa-coral", { kind: "location", id: "loc-1784582011518" }, {
          title: T("A road built of coral", "Une route en corail", "Semin ar koray"),
        }),
        card("oa-marie", { kind: "location", id: "loc-1783535711857" }, {
          title: T("The island's own saint", "La sainte de l'ile", "Sen lil la"),
        }),
        card("oa-landing", { kind: "location", id: "loc-1784582409592" }, {
          title: T("Where the boats come in", "Ou rentrent les bateaux", "Kot bato rantre"),
          labels: ["lbl-a-early"],
        }),
        card("oa-limon", { kind: "location", id: "loc-1784122891862" }, {
          title: T("The top of the island", "Le toit de l'ile", "Lao lil"),
          labels: ["lbl-a-walk"],
        }),
      ],
    },

    {
      id: "sec-a-moods",
      type: "moods",
      enabled: true,
      title: T("What kind of day is it?", "Quel genre de journee ?", "Ki kalite zourne?"),
      subtitle: T(
        "Start with the weather and the mood. The island supplies the rest.",
        "Commencez par le temps qu'il fait. L'ile fournit le reste.",
        "Koumans ar letan ki fer. Lil pou donn lerest.",
      ),
      moods: [
        {
          id: "mood-a-water",
          title: T("On the water", "Sur l'eau", "Lor dilo"),
          blurb: T(
            "Out with the boats at first light, back before the wind gets up.",
            "Sortir avec les bateaux a l'aube, rentrer avant que le vent se leve.",
            "Sorti ar bato boner, retourn avan divan leve.",
          ),
          href: "/experiences/fishing",
          enabled: true,
        },
        {
          id: "mood-a-foot",
          title: T("On foot", "A pied", "Apie"),
          blurb: T(
            "Cliff paths, hard climbs, and beaches no road reaches.",
            "Sentiers de falaise, montees seches, et des plages sans route.",
            "Semin falez, montaz difisil, ek laplaz kot pena semin.",
          ),
          href: "/guide/routes",
          enabled: true,
        },
        {
          id: "mood-a-market",
          title: T("Market morning", "Matin de marche", "Gramatin bazar"),
          blurb: T(
            "Saturday in Port Mathurin: limes, honey, smoked sausage, everyone you know.",
            "Samedi a Port Mathurin : citrons, miel, saucisses fumees, tout le monde.",
            "Samdi Port Mathurin: limon, dimiel, sosis fime, tou dimoun.",
          ),
          href: "/food",
          enabled: true,
        },
        {
          id: "mood-a-slow",
          title: T("Nothing planned", "Rien de prevu", "Nanye pa organize"),
          blurb: T(
            "A beach, a bit of shade, and a whole afternoon to spend badly.",
            "Une plage, un peu d'ombre, et tout l'apres-midi a ne rien faire.",
            "Enn laplaz, tigit lonbraz, ek tou tanto pou fer nanye.",
          ),
          href: "/guide/beaches",
          enabled: true,
        },
        {
          id: "mood-a-people",
          title: T("Meeting people", "Rencontrer", "Zwenn dimoun"),
          blurb: T(
            "Craft workshops, village kitchens, and the makers who will show you.",
            "Ateliers d'artisans, cuisines de village, et ceux qui vous montrent.",
            "Latelie artizan, lakwizinn vilaz, ek bann ki pou montre ou.",
          ),
          href: "/shop",
          enabled: true,
        },
      ],
    },

    {
      id: "sec-a-editors",
      type: "editors",
      enabled: true,
      title: T("Told by people who live here", "Raconte par ceux d'ici", "Rakonte par bann isi"),
      subtitle: T(
        "The answers you would get from a neighbour, not from a brochure.",
        "Les reponses d'un voisin, pas d'une brochure.",
        "Bann repons enn vwazin, pa enn brosir.",
      ),
      notes: [
        {
          id: "ed-a-first",
          title: T("Start here on day one", "Commencer par ici", "Koumans isi premie zour"),
          body: T(
            "The three places that make the rest of the island make sense.",
            "Les trois endroits qui font comprendre tout le reste.",
            "Trwa plas ki fer ou konpran lerest.",
          ),
          href: "/guide/rodrigues",
          ctaLabel: T("Read the guide", "Lire le guide", "Lir gid la"),
          byline: T("Ti Roule editors", "La redaction Ti Roule", "Lekip Ti Roule"),
          enabled: true,
        },
        {
          id: "ed-a-walk",
          title: T("The walk everyone talks about", "La randonnee dont on parle", "Rando ki tou dimoun koze"),
          body: T(
            "Graviers to Trou d'Argent - how long it really takes, and when to start.",
            "Graviers a Trou d'Argent - le vrai temps, et quand partir.",
            "Graviers ziska Trou d'Argent - konbien letan vremem, ek kan koumanse.",
          ),
          href: "/guide/routes",
          ctaLabel: T("See the routes", "Voir les sentiers", "Get bann semin"),
          byline: T("Ti Roule editors", "La redaction Ti Roule", "Lekip Ti Roule"),
          enabled: true,
        },
        {
          id: "ed-a-sunday",
          title: T("Build a day, in a minute", "Composer sa journee", "Fer ou zourne dan enn minit"),
          body: T(
            "Morning, lunch, afternoon, and the drive between them.",
            "Matin, dejeuner, apres-midi, et la route entre les deux.",
            "Gramatin, manze midi, tanto, ek semin ant zot.",
          ),
          href: "/trip-planner",
          ctaLabel: T("Open the planner", "Ouvrir le planificateur", "Ouver planer la"),
          byline: T("Ti Roule editors", "La redaction Ti Roule", "Lekip Ti Roule"),
          enabled: true,
        },
      ],
    },

    {
      id: "sec-a-concierge",
      type: "concierge",
      enabled: true,
      eyebrow: T("Ask a local", "Demandez a un local", "Demann enn dimoun isi"),
      title: T("Not sure where to start?", "Vous ne savez pas par ou commencer ?", "Ou pa kone kot koumanse?"),
      body: T(
        "Tell us how long you have and what you like. We will tell you what we would do.",
        "Dites-nous combien de temps vous avez et ce que vous aimez. On vous dira ce qu'on ferait.",
        "Dir nou konbien letan ou ena ek ki ou kontan. Nou pou dir ou seki nou ti pou fer.",
      ),
      ctaLabel: T("Ask Ti Roule", "Demander a Ti Roule", "Demann Ti Roule"),
      ctaAction: "tiroule",
      reassurance: T(
        "English, French or Creole - whichever is easier.",
        "En anglais, francais ou creole - comme vous voulez.",
        "Angle, franse ouswa kreol - kouma pli fasil.",
      ),
    },
  ],

  seo: {
    title: "Authentic Rodrigues - local life, walks, fishing & the island itself",
    description:
      "Rodrigues as the people who live here see it: fishing trips, cliff walks, the Saturday market, village kitchens and the places worth the detour.",
  },
};

const SEEDS: Record<string, WorldDoc> = {
  authentic: DEFAULT_AUTHENTIC,
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
