import type { SearchLang } from "@/lib/search/types";

// The search UI's own words, in the site's three languages.

export const SEARCH_COPY: Record<
  SearchLang,
  {
    dialog: string;
    placeholder: string;
    close: string;
    clearQuery: string;
    recent: string;
    clearRecent: string;
    popular: string;
    top: string;
    viewAll: string;
    none: (q: string) => string;
    noneHint: string;
    ask: (q: string) => string;
    loading: string;
    offline: string;
    retry: string;
    count: (n: number) => string;
    hintMove: string;
    hintOpen: string;
    hintClose: string;
    button: string;
  }
> = {
  en: {
    dialog: "Search Roulé Rodrigues",
    placeholder: "Search scooters, beaches, food…",
    close: "Close",
    clearQuery: "Clear search",
    recent: "Recent",
    clearRecent: "Clear",
    popular: "Popular",
    top: "Top result",
    viewAll: "View all",
    none: (q) => `Nothing found for “${q}”`,
    noneHint: "Try another spelling — or ask Ti Roulé, the island guide.",
    ask: (q) => (q ? `Ask Ti Roulé about “${q}”` : "Ask Ti Roulé"),
    loading: "Loading search…",
    offline: "Search couldn't load. Check your connection.",
    retry: "Try again",
    count: (n) => `${n} result${n === 1 ? "" : "s"}`,
    hintMove: "move",
    hintOpen: "open",
    hintClose: "close",
    button: "Search",
  },
  fr: {
    dialog: "Rechercher sur Roulé Rodrigues",
    placeholder: "Scooters, plages, plats…",
    close: "Fermer",
    clearQuery: "Effacer la recherche",
    recent: "Récentes",
    clearRecent: "Effacer",
    popular: "Populaire",
    top: "Meilleur résultat",
    viewAll: "Tout voir",
    none: (q) => `Aucun résultat pour « ${q} »`,
    noneHint: "Essayez une autre orthographe — ou demandez à Ti Roulé, le guide de l'île.",
    ask: (q) => (q ? `Demander à Ti Roulé : « ${q} »` : "Demander à Ti Roulé"),
    loading: "Chargement de la recherche…",
    offline: "La recherche n'a pas pu se charger. Vérifiez votre connexion.",
    retry: "Réessayer",
    count: (n) => `${n} résultat${n === 1 ? "" : "s"}`,
    hintMove: "naviguer",
    hintOpen: "ouvrir",
    hintClose: "fermer",
    button: "Rechercher",
  },
  cr: {
    dialog: "Rod lor Roulé Rodrigues",
    placeholder: "Scooter, laplaz, manze…",
    close: "Ferme",
    clearQuery: "Efase rod",
    recent: "Resan",
    clearRecent: "Efase",
    popular: "Popiler",
    top: "Pli bon rezilta",
    viewAll: "Get tou",
    none: (q) => `Nanye pou « ${q} »`,
    noneHint: "Esey enn lot fason ekrir — ouswa demann Ti Roulé, gid lil.",
    ask: (q) => (q ? `Demann Ti Roulé: « ${q} »` : "Demann Ti Roulé"),
    loading: "Pe sarze…",
    offline: "Rod pa finn kapav sarze. Get ou koneksion.",
    retry: "Esey ankor",
    count: (n) => `${n} rezilta`,
    hintMove: "bouze",
    hintOpen: "ouver",
    hintClose: "ferme",
    button: "Rod",
  },
};
