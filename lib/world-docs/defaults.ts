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
  type CuratedDoc,
  type CuratedCard,
  type EditorialLabel,
} from "./types";

const card = (
  id: string,
  source: CuratedCard["source"],
  extra: Omit<CuratedCard, "id" | "source"> = {},
): CuratedCard => ({ id, source, ...extra });

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

export const DEFAULT_CURATED: CuratedDoc = {
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

  quickActions: {
    enabled: true,
    items: [
      { id: "qa-stays", icon: "stay", href: "/browse/stays", label: T("Stays", "Séjours", "Lozman") },
      { id: "qa-exp", icon: "experience", href: "/browse/tours", label: T("Experiences", "Expériences", "Eksperyans") },
      { id: "qa-eat", icon: "eat", href: "/food", label: T("Eat & Drink", "Manger & boire", "Manze & bwar") },
      { id: "qa-shops", icon: "shop", href: "/shop", label: T("Shops", "Boutiques", "Laboutik") },
      { id: "qa-transfers", icon: "transfer", href: "/transfers", label: T("Transfers", "Transferts", "Transfer") },
      { id: "qa-curated", icon: "curated", href: "/curated", label: T("Curated", "Sélection", "Seleksion") },
    ],
  },

  labels: DEFAULT_LABELS,

  sections: [
    {
      id: "sec-featured",
      type: "featured",
      enabled: true,
      title: T("Handpicked for you", "Choisis pour vous", "Swazir pou ou"),
      subtitle: T(
        "A few Rodrigues moments worth making time for.",
        "Quelques moments de Rodrigues qui méritent qu'on s'arrête.",
        "Detrwa moman Rodrig ki merite ou pran letan.",
      ),
      limit: 6,
      cards: [
        card("fc-cocos", { kind: "place", id: "rec-1784585562167" }, {
          category: T("Island day", "Journée sur l'île", "Enn zourne"),
          labels: ["lbl-pick"],
        }),
        card("fc-peche", { kind: "place", id: "svc-1786554105958" }, {
          category: T("Local life", "Vie locale", "Lavi lokal"),
          labels: ["lbl-locals"],
        }),
        card("fc-banane", { kind: "place", id: "rec-1786602913382" }, {
          category: T("Gastronomy", "Gastronomie", "Manze"),
          labels: ["lbl-locals"],
        }),
        card("fc-apnee", { kind: "place", id: "svc-1786553123744" }, {
          category: T("Lagoon", "Lagon", "Lagon"),
          labels: ["lbl-dontmiss"],
        }),
        card("fc-villa", { kind: "place", id: "svc-1786553125959" }, {
          category: T("Private", "Privé", "Prive"),
          labels: ["lbl-two"],
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
      title: T("Only in Rodrigues", "Seulement à Rodrigues", "Zis dan Rodrig"),
      subtitle: T(
        "The places, flavours and moments you won't find anywhere else.",
        "Les lieux, les saveurs et les instants qu'on ne trouve nulle part ailleurs.",
        "Bann plas, gou ek moman ki ou pa pou trouv lot par.",
      ),
      cards: [
        card("oi-cocos", { kind: "location", id: "loc-1784584619975" }, {
          title: T("Meet the island's rarest residents", "Les habitants les plus rares de l'île", "Bann pli rar abitan lil"),
          blurb: T(
            "A sandbank an hour offshore where thousands of terns and noddies nest — and nowhere else.",
            "Un banc de sable à une heure du large où nichent des milliers de sternes — et nulle part ailleurs.",
            "Enn bank disab enn er dan lamer kot milye zwazo fer zot nik — ek nanye lot par.",
          ),
          labels: ["lbl-dontmiss"],
        }),
        card("oi-limon", { kind: "location", id: "loc-1784122891862" }, {
          title: T("Some views are worth the climb", "Certaines vues méritent la montée", "Sertin vi vo lapenn mont"),
          labels: ["lbl-sunset"],
        }),
        card("oi-food", { kind: "link", href: "/food" }, {
          title: T("Flavours that belong to Rodrigues", "Des saveurs bien d'ici", "Bann gou ki pou Rodrig"),
          blurb: T(
            "Octopus, limes, honey and smoked sausage — an island kitchen that is not Mauritian cooking.",
            "Ourite, limons, miel et saucisses fumées — une cuisine d'île qui n'est pas mauricienne.",
            "Ourit, limon, dimiel ek sosis fime — enn lakwizinn lil ki pa Moris.",
          ),
        }),
        card("oi-kotpive", { kind: "location", id: "loc-1784584377346" }, {
          title: T("Made here, by hand", "Fait ici, à la main", "Fer isi, ar lame"),
          labels: ["lbl-hidden"],
        }),
        card("oi-coral", { kind: "location", id: "loc-1784582011518" }, {
          title: T("The road built from coral", "La route bâtie en corail", "Semin fer ar koray"),
          labels: ["lbl-hidden"],
        }),
        card("oi-stfrancois", { kind: "location", id: "loc-1784121476763" }, {
          title: T("The lagoon at its widest", "Le lagon dans toute sa largeur", "Lagon dan so pli gran larzer"),
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

/** A fresh deep copy — callers mutate their document freely. */
export function freshCuratedDoc(): CuratedDoc {
  return JSON.parse(JSON.stringify(DEFAULT_CURATED)) as CuratedDoc;
}
