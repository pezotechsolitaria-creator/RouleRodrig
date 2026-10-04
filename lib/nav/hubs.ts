// ── THE TWO PARENTS THAT WERE 404s ──────────────────────────────────────────
//
// /guide has eight pages beneath it and /fr has eleven, and both PARENTS
// returned a not-found screen. Nothing in the app linked to either, so no test
// caught it and no crawl found it — but they are the two most natural URLs on
// this site to type, to shorten a shared link to, or for another site to point
// at. A French blogger linking "roulerodrig.com/fr" sent every reader to a 404.
//
// ── WHY A HUB AND NOT A REDIRECT ───────────────────────────────────────────
// A redirect would have cleared the 404 in one line. It would also have thrown
// away the reason /fr matters: those eleven pages are the best-performing
// writing on this site and they were an ISLAND — the link graph, not the
// content, was the problem, and four of them had never been crawled. A hub is a
// crawlable page that links all eleven from one place; a redirect is a page
// that links none of them.
//
// ── AND WHY THE LIST IS HERE ───────────────────────────────────────────────
// So a test can assert it is COMPLETE. Every directory under app/guide and
// app/fr must appear below, which means a new guide added next month fails the
// suite on the commit that adds it rather than sitting unlinked — the same
// promise lib/nav/reachable-pages.test.ts makes for everything else.

export type HubLink = {
  /** Route path, relative to the site root. */
  href: string;
  /** The page's own title, trimmed of the site suffix. Taken from the page. */
  title: string;
  /** One line saying what is on it, in the page's own language. No price. */
  blurb: string;
  /**
   * The same line led by a live "from" price, for a caller that has read one.
   * `from` names which: the cheapest sellable fleet unit of that category, or
   * the cheapest stay by placePrice(). The figure is passed in already
   * formatted; this file never holds one.
   */
  priced?: { from: "scooter" | "car" | "stays"; blurb: (price: string) => string };
  /**
   * The title led by the live count the target page prints in its own H1, for
   * a caller that has read the content (lib/guide/hub.ts). `of` names the list
   * that page counts; `title(n)` must equal the page's H1 whenever the page has
   * entries (lib/guide/hub.test.ts renders both), and names no number when it
   * has none. `title` above is the same line with no number, for callers that
   * have not read anything (llms.txt).
   */
  counted?: { of: "beaches" | "hikes" | "plages"; title: (n: number) => string };
};

// ── NO PRICE IS TYPED IN THIS FILE (SEO audit 2026-09-29 C1) ────────────────
// The French blurbs said "Dès Rs 1 499 par jour" for a car while /browse/car
// charged from Rs 1,899: a hand-typed figure that drifted the day the owner
// repriced. The /fr hub now reads the fleet and the stays and fills the price
// in; without a live figure it shows the blurb, which names none.
//
// ── NOR A COUNT (architecture review 2026-09-30, item 5) ────────────────────
// Same drift, different number: the hub said "The 5 best hikes" while
// /guide/hiking showed 2, "The 20 best beaches" and "Les 19 plus belles
// plages" were typed on the day they were true, and the /guide ItemList
// published the wrong one to Google. The pages count their own lists live, so
// the hubs now ask them (`counted`, resolved in lib/guide/hub.ts) and never
// type a number here.

/** The English island guide. */
export const GUIDE_PAGES: HubLink[] = [
  {
    href: "/guide/rodrigues",
    title: "Rodrigues Island travel guide",
    blurb: "Start here: beaches, tortoises, the ferry, and what it actually costs.",
  },
  {
    href: "/guide/beaches",
    title: "The best beaches in Rodrigues",
    blurb: "Every beach worth the drive, with how to reach each one.",
    // The H1 of app/guide/beaches/page.tsx.
    counted: {
      of: "beaches",
      title: (n) => (n > 0 ? `The ${n} best beaches in Rodrigues` : "The best beaches in Rodrigues"),
    },
  },
  {
    href: "/guide/viewpoints",
    title: "Viewpoints & landmarks",
    blurb: "Where to stand for the view that made you come here.",
  },
  {
    href: "/guide/hiking",
    title: "The best hikes in Rodrigues",
    blurb: "Trail by trail, with how long each one really takes.",
    // The H1 of components/HikingGuide.tsx, word for word, its empty state too.
    counted: {
      of: "hikes",
      title: (n) => (n > 0 ? `The ${n} best hikes in Rodrigues` : "Hiking in Rodrigues"),
    },
  },
  {
    href: "/guide/routes",
    title: "Scooter routes & hiking trails",
    blurb: "Round trips that work on one tank, and where the road turns to coral.",
  },
  {
    href: "/guide/ile-aux-cocos",
    title: "Île aux Cocos",
    blurb: "What to know before you book the boat to the bird island.",
  },
  {
    href: "/guide/rodriguan-food",
    title: "Rodriguan food",
    blurb: "What to eat, and why the octopus has a season.",
  },
  {
    href: "/guide/shops",
    title: "Where to shop",
    blurb: "Markets, honey, chilli and the things worth carrying home.",
  },
];

/** Les pages françaises. Blurbs stay in French — they describe French pages. */
export const FR_PAGES: HubLink[] = [
  {
    href: "/fr/guide-rodrigues",
    title: "Guide de l'île Rodrigues par les locaux",
    blurb: "Par où commencer : l'île, les saisons et ce que ça coûte vraiment.",
  },
  {
    href: "/fr/plages-rodrigues",
    title: "Les plus belles plages de Rodrigues",
    blurb: "Chaque plage, comment y aller et laquelle choisir selon la journée.",
    // Le H1 de app/fr/plages-rodrigues/page.tsx, compté sur la même liste.
    counted: {
      of: "plages",
      title: (n) =>
        n > 0 ? `Les ${n} plus belles plages de Rodrigues` : "Les plus belles plages de Rodrigues",
    },
  },
  {
    href: "/fr/que-faire-a-rodrigues",
    title: "Que faire à Rodrigues ?",
    blurb: "Le guide des activités, de la plongée aux tortues géantes.",
  },
  {
    href: "/fr/itineraire-rodrigues",
    title: "Itinéraire à Rodrigues : 3, 5 ou 7 jours",
    blurb: "Un programme jour par jour, selon le temps que vous avez.",
  },
  {
    href: "/fr/ile-aux-cocos",
    title: "Île aux Cocos",
    blurb: "Ce qu'il faut savoir avant de réserver la sortie en bateau.",
  },
  {
    href: "/fr/manger-a-rodrigues",
    title: "Manger à Rodrigues",
    blurb: "Les plats de l'île, et comment commander en ligne.",
  },
  {
    href: "/fr/hebergement-rodrigues",
    title: "Hébergement à Rodrigues",
    blurb: "Où dormir, en réservation directe avec le propriétaire.",
    priced: { from: "stays", blurb: (price) => `Où dormir, dès ${price} la nuit.` },
  },
  {
    href: "/fr/se-deplacer-a-rodrigues",
    title: "Se déplacer à Rodrigues",
    blurb: "Bus, taxi, scooter ou voiture : ce qui convient à votre séjour.",
  },
  {
    href: "/fr/location-scooter-rodrigues",
    title: "Location scooter",
    blurb: "Casque et assistance compris.",
    priced: { from: "scooter", blurb: (price) => `Dès ${price} par jour, casque et assistance compris.` },
  },
  {
    href: "/fr/location-voiture-rodrigues",
    title: "Location voiture",
    blurb: "Livrée où vous êtes.",
    priced: { from: "car", blurb: (price) => `Dès ${price} par jour, livrée où vous êtes.` },
  },
  {
    href: "/fr/taxi-rodrigues",
    title: "Taxi et transfert aéroport",
    // Was "Prix fixes annoncés à l'avance": true of an airport transfer and
    // not of a taxi, whose fare is the driver's (SEO audit 2026-09-29 C2).
    // "avant tout engagement", the taxi FAQ's own words (lib/taxi-faq.ts): a
    // bare "confirmé avant." read as a sentence cut off. Not "avant paiement":
    // a ride is paid to the driver, and the site takes nothing for it.
    blurb: "Transfert aéroport à tarif fixe par zone ; pour le reste, prix confirmé avant tout engagement.",
  },
  {
    href: "/fr/esim-maurice-rodrigues",
    title: "eSIM Maurice et Rodrigues",
    // The network, not the price: it is the one thing that decides whether an
    // eSIM works here at all, and the one thing no global eSIM site says.
    blurb: "Internet mobile dès l'atterrissage, sur my.t 4G — le réseau qui couvre Rodrigues.",
  },
];

/** A compact footer link. */
export type FooterLink = { href: string; label: string };

/**
 * The money pages, for the sitewide footer (SEO audit 2026-09-29 C3). The
 * footer was on every page and linked only pages that refuse to be indexed
 * (/kitchen, /driver, /partner are noindex, nofollow): the cheapest sitewide
 * lever the site has, spent on nothing. Six links, in the order a visitor
 * plans a trip.
 */
export const FOOTER_EN_LINKS: FooterLink[] = [
  { href: "/browse/scooter", label: "Scooter rental" },
  { href: "/browse/car", label: "Car rental" },
  { href: "/transfers", label: "Airport transfers" },
  { href: "/browse/stays", label: "Where to stay" },
  { href: "/experiences", label: "Things to do" },
  { href: "/guide/rodrigues", label: "Island guide" },
];

/** Short footer labels for French pages that FR_PAGES lists. */
const FR_SHORT: [href: string, label: string][] = [
  ["/fr/location-scooter-rodrigues", "Location scooter"],
  ["/fr/location-voiture-rodrigues", "Location voiture"],
  ["/fr/hebergement-rodrigues", "Hébergement"],
  ["/fr/que-faire-a-rodrigues", "Que faire"],
  ["/fr/guide-rodrigues", "Guide de Rodrigues"],
];

/**
 * The French half of the footer: the EN→FR bridge was one link (/more to /fr),
 * and every French page, the best-ranking writing on the site, had exactly one
 * English inbound link. Drawn FROM FR_PAGES, so a label here can only ever
 * point at a French page the hub also lists.
 */
export const FOOTER_FR_LINKS: FooterLink[] = FR_SHORT.flatMap(([href, label]) =>
  FR_PAGES.some((p) => p.href === href) ? [{ href, label }] : [],
);
