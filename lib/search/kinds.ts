import type { SearchKind, SearchLang } from "./types";

// ── How each kind of result is named, grouped and "viewed all" ───────────────
//
// Order is the tie-break when two groups' best results score the same: the
// things a visitor comes to DO before the things they come to read.

export const KIND_ORDER: SearchKind[] = [
  "vehicle",
  "stay",
  "experience",
  "eat",
  "beach",
  "viewpoint",
  "route",
  "place",
  "event",
  "shop",
  "service",
  "guide",
  "help",
];

export const KIND_LABEL: Record<SearchKind, Record<SearchLang, string>> = {
  vehicle: { en: "Rent a vehicle", fr: "Location", cr: "Lokasion" },
  stay: { en: "Stays", fr: "Hébergements", cr: "Lakaz pou dormi" },
  experience: { en: "Experiences & tours", fr: "Activités & excursions", cr: "Aktivite ek tour" },
  eat: { en: "Food", fr: "Manger", cr: "Manze" },
  beach: { en: "Beaches", fr: "Plages", cr: "Laplaz" },
  viewpoint: { en: "Viewpoints", fr: "Points de vue", cr: "Bann vi" },
  route: { en: "Hikes & rides", fr: "Randos & balades", cr: "Rando ek balad" },
  place: { en: "Places", fr: "Lieux", cr: "Landrwa" },
  event: { en: "Events", fr: "Événements", cr: "Levennman" },
  shop: { en: "Shops", fr: "Boutiques", cr: "Laboutik" },
  service: { en: "Services", fr: "Services", cr: "Servis" },
  guide: { en: "Guides", fr: "Guides", cr: "Gid" },
  help: { en: "Help", fr: "Aide", cr: "Led" },
};

/** Where "View all" goes for a group; absent = no such page. */
export const KIND_ALL: Partial<Record<SearchKind, string>> = {
  vehicle: "/browse/scooter",
  stay: "/browse/stays",
  experience: "/explore",
  eat: "/food",
  beach: "/guide/beaches",
  viewpoint: "/guide/viewpoints",
  route: "/guide/hiking",
  place: "/map",
  event: "/events",
  shop: "/shop",
  guide: "/guide",
  help: "/faq",
};
