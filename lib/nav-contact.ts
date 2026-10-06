import { useSyncExternalStore } from "react";

// ── WhatsApp in Ti Roulé's place, while a booking needs a person ────────────
//
// Owner, 6 Oct 2026: on the reservation page "the ask Ti Roulé should be
// WhatsApp so that it is noticeable". A guest choosing how to pay needs a
// human on Roulé's line, not the island guide — so a page in that state
// registers its WhatsApp link here, and the bottom bar's centre button
// becomes it until the page goes away. Everywhere else Ti Roulé stays.

export type NavContact = { href: string; label: string };

let current: NavContact | null = null;
const listeners = new Set<() => void>();

export function setNavContact(next: NavContact | null): void {
  if (current?.href === next?.href && current?.label === next?.label) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The WhatsApp link standing in for Ti Roulé right now, or null. */
export function useNavContact(): NavContact | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
