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
  /** One line saying what is on it, in the page's own language. */
  blurb: string;
};

/** The English island guide. */
export const GUIDE_PAGES: HubLink[] = [
  {
    href: "/guide/rodrigues",
    title: "Rodrigues Island travel guide",
    blurb: "Start here: beaches, tortoises, the ferry, and what it actually costs.",
  },
  {
    href: "/guide/beaches",
    title: "The 20 best beaches in Rodrigues",
    blurb: "Every beach worth the drive, with how to reach each one.",
  },
  {
    href: "/guide/viewpoints",
    title: "Viewpoints & landmarks",
    blurb: "Where to stand for the view that made you come here.",
  },
  {
    href: "/guide/hiking",
    title: "The 5 best hikes in Rodrigues",
    blurb: "Trail by trail, with how long each one really takes.",
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
    title: "Les 19 plus belles plages de Rodrigues",
    blurb: "Chaque plage, comment y aller et laquelle choisir selon la journée.",
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
    blurb: "Où dormir, dès Rs 1 000 la nuit.",
  },
  {
    href: "/fr/se-deplacer-a-rodrigues",
    title: "Se déplacer à Rodrigues",
    blurb: "Bus, taxi, scooter ou voiture : ce qui convient à votre séjour.",
  },
  {
    href: "/fr/location-scooter-rodrigues",
    title: "Location scooter",
    blurb: "Dès Rs 699 par jour, casque et assistance compris.",
  },
  {
    href: "/fr/location-voiture-rodrigues",
    title: "Location voiture",
    blurb: "Dès Rs 1 499 par jour, livrée où vous êtes.",
  },
  {
    href: "/fr/taxi-rodrigues",
    title: "Taxi et transfert aéroport",
    blurb: "Prix fixes annoncés à l'avance, réservation en ligne.",
  },
];
