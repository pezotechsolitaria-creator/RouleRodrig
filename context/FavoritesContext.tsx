"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const LS_KEY = "rr-favorites-v1";

export type FavoriteType = "scooter" | "place" | "route";

export interface FavoriteItem {
  id: string;          // unique within its type
  type: FavoriteType;
  name: string;
  image?: string;
  href: string;        // where clicking it takes the user (section anchor)
  meta?: string;       // small subtitle, e.g. price or category
}

interface FavoritesContextValue {
  favorites: FavoriteItem[];
  count: number;
  isSaved: (type: FavoriteType, id: string) => boolean;
  toggle: (item: FavoriteItem) => void;
  remove: (type: FavoriteType, id: string) => void;
  clear: () => void;
  hydrated: boolean;
}

const noop = () => {};
const FavoritesContext = createContext<FavoritesContextValue>({
  favorites: [],
  count: 0,
  isSaved: () => false,
  toggle: noop,
  remove: noop,
  clear: noop,
  hydrated: false,
});

const key = (t: FavoriteType, id: string) => `${t}:${id}`;

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Restore on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFavorites(parsed.filter((x) => x && x.id && x.type));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  // Persist on change (after hydration so we never clobber saved data)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(favorites));
    } catch {
      /* ignore */
    }
  }, [favorites, hydrated]);

  const isSaved = useCallback(
    (t: FavoriteType, id: string) => favorites.some((f) => f.type === t && f.id === id),
    [favorites],
  );

  const toggle = useCallback((item: FavoriteItem) => {
    setFavorites((prev) =>
      prev.some((f) => key(f.type, f.id) === key(item.type, item.id))
        ? prev.filter((f) => key(f.type, f.id) !== key(item.type, item.id))
        : [{ ...item }, ...prev],
    );
  }, []);

  const remove = useCallback((t: FavoriteType, id: string) => {
    setFavorites((prev) => prev.filter((f) => !(f.type === t && f.id === id)));
  }, []);

  const clear = useCallback(() => setFavorites([]), []);

  return (
    <FavoritesContext.Provider
      value={{ favorites, count: favorites.length, isSaved, toggle, remove, clear, hydrated }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
